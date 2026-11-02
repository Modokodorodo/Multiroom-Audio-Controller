"""Automatic power for the ClearOne and the amplifier (one relay, the configured power switch).

- Switch on when the Arylic starts playing (optionally pausing it until the ClearOne is ready, so the
  start of the music is not lost) and when something is played on a room speaker.
- Switch off after N minutes without sound. Sound = the input level of a monitored source above the
  threshold (see MultiroomDevice.monitored_sources: not ignored, switched on in an unmuted room), or the
  Arylic reporting "playing". The countdown only runs while the ClearOne is connected and not paused,
  and restarts whenever the power is switched on.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_interval
from homeassistant.util import dt as dt_util

from .const import (
    DEFAULTS, OPT_AUTO_OFF, OPT_AUTO_ON, OPT_HOLD_PLAYBACK, OPT_IDLE_MINUTES, OPT_IGNORED_SOURCES, OPT_THRESHOLD,
)
from .device import MultiroomDevice

_LOGGER = logging.getLogger(__name__)
TICK = timedelta(seconds=15)
READY_TIMEOUT_S = 150


class AutoPower:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, device: MultiroomDevice,
                 power: str | None, arylic: str | None) -> None:
        self.hass, self.entry, self.device, self.power, self.arylic = hass, entry, device, power, arylic
        self.on_since: datetime = dt_util.utcnow()
        self.arylic_playing_at: datetime | None = None
        self._lock = asyncio.Lock()

    def option(self, key: str) -> Any:
        return self.entry.options.get(key, DEFAULTS[key])

    @callback
    def apply_settings(self) -> None:
        self.device.sound_threshold_db = float(self.option(OPT_THRESHOLD))
        self.device.ignored_sources = set(self.option(OPT_IGNORED_SOURCES))
        self._tick()

    @callback
    def start(self) -> list:
        self.apply_settings()
        unsubs = [async_track_time_interval(self.hass, self._tick, TICK)]
        if self.power:
            unsubs.append(async_track_state_change_event(self.hass, [self.power], self._power_changed))
            self.device.ensure_power = self.ensure_on  # room speakers switch the system on before playing
        if self.arylic:
            unsubs.append(async_track_state_change_event(self.hass, [self.arylic], self._arylic_changed))
        return unsubs

    # ---- state ------------------------------------------------------------------------------------
    def power_on(self) -> bool | None:
        st = self.hass.states.get(self.power) if self.power else None
        return None if st is None or st.state not in ("on", "off") else st.state == "on"

    def arylic_playing(self) -> bool:
        st = self.hass.states.get(self.arylic) if self.arylic else None
        return st is not None and st.state == "playing"

    @callback
    def _power_changed(self, event: Event[EventStateChangedData]) -> None:
        new, old = event.data["new_state"], event.data["old_state"]
        if new and new.state == "on" and (old is None or old.state != "on"):
            self.on_since = dt_util.utcnow()  # a fresh countdown after every switch-on
        self._tick()

    @callback
    def _arylic_changed(self, event: Event[EventStateChangedData]) -> None:
        new, old = event.data["new_state"], event.data["old_state"]
        if not new or new.state != "playing" or (old is not None and old.state == "playing"):
            return
        self.arylic_playing_at = dt_util.utcnow()
        if self.power and self.option(OPT_AUTO_ON) and self.power_on() is False:
            _LOGGER.info("Arylic started playing while the system is off: switching on")
            self.entry.async_create_background_task(self.hass, self._on_for_arylic(), "clearone_multiroom_auto_on")

    async def _on_for_arylic(self) -> None:
        hold = bool(self.option(OPT_HOLD_PLAYBACK))
        if hold:
            await self._arylic_call("media_pause")
        try:
            await self.ensure_on()
        except HomeAssistantError as err:
            _LOGGER.warning("Auto power-on: %s", err)
        finally:
            if hold:
                await self._arylic_call("media_play")

    async def _arylic_call(self, service: str) -> None:
        try:
            await self.hass.services.async_call("media_player", service, {"entity_id": self.arylic}, blocking=True)
        except Exception as err:  # noqa: BLE001 - the Arylic being unreachable must not break power-on
            _LOGGER.warning("Arylic %s failed: %s", service, err)

    async def ensure_on(self) -> None:
        """Switch the system on if needed and wait until the ClearOne is connected."""
        async with self._lock:
            if not self.power or self.device.paused:
                return
            if self.power_on() is not True:
                await self.hass.services.async_call("homeassistant", "turn_on", {"entity_id": self.power}, blocking=True)
                self.device.kick()
            for _ in range(READY_TIMEOUT_S):
                if self.device.status == "ready":
                    return
                await asyncio.sleep(1)
            raise HomeAssistantError("The ClearOne did not become ready after switching on")

    # ---- auto-off ------------------------------------------------------------------------------------
    @callback
    def _tick(self, _now: datetime | None = None) -> None:
        now = dt_util.utcnow()
        minutes = int(self.option(OPT_IDLE_MINUTES))
        info: dict[str, Any] = {"enabled": bool(self.power and self.option(OPT_AUTO_OFF)), "minutes": minutes}
        if not info["enabled"]:
            info["state"] = "disabled" if self.power else "no_power_switch"
        elif self.power_on() is not True:
            info["state"] = "off"
        elif self.device.paused or self.device.status != "ready":
            # No countdown while paused or not connected; start afresh afterwards.
            self.on_since = now
            info["state"] = "paused" if self.device.paused else "waiting"
        else:
            if self.arylic_playing():
                self.arylic_playing_at = now
            last = max(t for t in (self.on_since, self.device.last_sound_at, self.arylic_playing_at) if t is not None)
            off_at = last + timedelta(minutes=minutes)
            info.update(state="counting", lastActivity=last.isoformat(), offAt=off_at.isoformat())
            if now >= off_at:
                info["state"] = "switching_off"
                _LOGGER.info("No sound for %s minutes: switching the ClearOne and amplifier off", minutes)
                self.on_since = now
                self.hass.async_create_task(self.hass.services.async_call(
                    "homeassistant", "turn_off", {"entity_id": self.power}, blocking=False))
        if info != self.device.auto_off_info:
            self.device.auto_off_info = info
            self.device._notify(levels_only=True)  # panel only; entities do not depend on it
