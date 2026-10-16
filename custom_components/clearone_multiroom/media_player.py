"""One speaker per room, for Music Assistant and dashboards.

A room speaker streams through the Arylic: playing to it routes the Arylic into that room and
forwards the media to the Arylic's own media_player entity. Volume is the room volume (0-100 %
maps linearly onto the room's range in dB, up to its cap) and mute is the room mute.
There is one Arylic, so all room speakers share one stream: pause/next affect every room that
has Arylic switched on.
"""
from __future__ import annotations

from typing import Any

from homeassistant.components.media_player import (
    DOMAIN as MP_DOMAIN,
    MediaPlayerDeviceClass,
    MediaPlayerEntity,
    MediaPlayerEntityFeature as F,
    MediaPlayerState,
)
from homeassistant.const import ATTR_ENTITY_ID, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_state_change_event

from . import MultiroomConfigEntry
from .clearone import ClearOneError
from .const import ARYLIC_SOURCE_ID, OPT_ARYLIC_ENTITY
from .entity import RoomEntity

BASE = F.TURN_ON | F.TURN_OFF | F.VOLUME_SET | F.VOLUME_MUTE | F.VOLUME_STEP
STREAM = F.PLAY_MEDIA | F.PLAY | F.PAUSE | F.STOP | F.NEXT_TRACK | F.PREVIOUS_TRACK | F.MEDIA_ENQUEUE


async def async_setup_entry(hass: HomeAssistant, entry: MultiroomConfigEntry, add: AddEntitiesCallback) -> None:
    device = entry.runtime_data
    arylic = entry.options.get(OPT_ARYLIC_ENTITY)
    add(RoomSpeaker(entry, device, room, arylic) for room in device.rooms)


class RoomSpeaker(RoomEntity, MediaPlayerEntity):
    _attr_name = None  # the entity takes the room's name
    _attr_device_class = MediaPlayerDeviceClass.SPEAKER
    _attr_volume_step = 0.05

    def __init__(self, entry, device, room, arylic_entity: str | None) -> None:
        super().__init__(entry, device, room, "speaker")
        self.arylic = arylic_entity
        self._attr_supported_features = BASE | (STREAM if arylic_entity else F(0))

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        if self.arylic:
            self.async_on_remove(async_track_state_change_event(self.hass, [self.arylic], self._arylic_changed))

    @callback
    def _arylic_changed(self, event: Event[EventStateChangedData]) -> None:
        self.async_write_ha_state()

    # ---- state ---------------------------------------------------------------------------------
    @property
    def _arylic_on(self) -> bool:
        return next(m["on"] for m in self.room["mix"] if m["id"] == ARYLIC_SOURCE_ID)

    @property
    def _arylic_state(self):
        return self.hass.states.get(self.arylic) if self.arylic else None

    @property
    def state(self) -> MediaPlayerState | None:
        if not self._arylic_on:
            return MediaPlayerState.OFF
        st = self._arylic_state
        if st is None or st.state in (STATE_UNAVAILABLE, STATE_UNKNOWN):
            return MediaPlayerState.ON
        try:
            return MediaPlayerState(st.state)
        except ValueError:
            return MediaPlayerState.ON

    @property
    def volume_level(self) -> float | None:
        room = self.room
        if room["gainDb"] is None:
            return None
        span = room["maxDb"] - room["minDb"]
        return max(0.0, min(1.0, (room["gainDb"] - room["minDb"]) / span))

    @property
    def is_volume_muted(self) -> bool | None:
        return self.room["muted"]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {"volume_db": self.room["gainDb"], "stream_via": self.arylic}

    def _mirror(self, key: str) -> Any:
        st = self._arylic_state
        return st.attributes.get(key) if st is not None and self._arylic_on else None

    media_content_id = property(lambda self: self._mirror("media_content_id"))
    media_content_type = property(lambda self: self._mirror("media_content_type"))
    media_duration = property(lambda self: self._mirror("media_duration"))
    media_position = property(lambda self: self._mirror("media_position"))
    media_position_updated_at = property(lambda self: self._mirror("media_position_updated_at"))
    media_title = property(lambda self: self._mirror("media_title"))
    media_artist = property(lambda self: self._mirror("media_artist"))
    media_album_name = property(lambda self: self._mirror("media_album_name"))
    app_name = property(lambda self: self._mirror("app_name"))

    @property
    def entity_picture(self) -> str | None:
        # The Arylic's own (proxied) cover art, so the room speaker shows what is playing.
        return self._mirror("entity_picture")

    # ---- room controls -------------------------------------------------------------------------
    async def _do(self, coro) -> None:
        try:
            await coro
        except ClearOneError as err:
            raise HomeAssistantError(str(err)) from err

    async def async_turn_on(self) -> None:
        await self._do(self.device.set_room_source(self.room_id, ARYLIC_SOURCE_ID, True))

    async def async_turn_off(self) -> None:
        await self._do(self.device.set_room_source(self.room_id, ARYLIC_SOURCE_ID, False))
        # Last room switched off: pause the Arylic so it does not keep streaming to nobody.
        if self.arylic and not any(next(m["on"] for m in self.device.room(r["id"])["mix"] if m["id"] == ARYLIC_SOURCE_ID)
                                   for r in self.device.rooms):
            await self._arylic("media_pause")

    async def async_set_volume_level(self, volume: float) -> None:
        room = self.room
        gain = room["minDb"] + max(0.0, min(1.0, volume)) * (room["maxDb"] - room["minDb"])
        await self._do(self.device.set_room_gain(self.room_id, round(gain * 2) / 2))

    async def async_mute_volume(self, mute: bool) -> None:
        await self._do(self.device.set_room_mute(self.room_id, mute))

    # ---- stream controls (forwarded to the Arylic) -----------------------------------------------
    async def _arylic(self, service: str, data: dict[str, Any] | None = None) -> None:
        if not self.arylic:
            raise HomeAssistantError("No Arylic media player configured (integration options)")
        await self.hass.services.async_call(MP_DOMAIN, service, {ATTR_ENTITY_ID: self.arylic, **(data or {})}, blocking=True)

    async def async_play_media(self, media_type: str, media_id: str, **kwargs: Any) -> None:
        if not self._arylic_on:
            await self.async_turn_on()
        data = {"media_content_type": media_type, "media_content_id": media_id}
        if kwargs.get("enqueue") is not None:
            data["enqueue"] = kwargs["enqueue"]
        if kwargs.get("announce") is not None:
            data["announce"] = kwargs["announce"]
        if kwargs.get("extra"):
            data["extra"] = kwargs["extra"]
        await self._arylic("play_media", data)

    async def async_media_play(self) -> None:
        if not self._arylic_on:
            await self.async_turn_on()
        await self._arylic("media_play")

    async def async_media_pause(self) -> None:
        await self._arylic("media_pause")

    async def async_media_stop(self) -> None:
        await self._arylic("media_stop")

    async def async_media_next_track(self) -> None:
        await self._arylic("media_next_track")

    async def async_media_previous_track(self) -> None:
        await self._arylic("media_previous_track")
