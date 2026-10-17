"""ClearOne Multiroom: control a ClearOne CONVERGE Pro 880T multi-room system from Home Assistant."""
from __future__ import annotations

import json
import pathlib

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_PORT, CONF_USERNAME, Platform
import logging
import time

from homeassistant.core import Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers import device_registry as dr

from .const import CONF_DEVICE_ID, DOMAIN, OPT_ARYLIC_ENTITY, OPT_CAPS, OPT_SCENES, PANEL_COMPONENT, PANEL_URL, STATIC_URL
from .device import MultiroomDevice
from .websocket import async_register_commands

PLATFORMS = [Platform.BINARY_SENSOR, Platform.MEDIA_PLAYER, Platform.NUMBER, Platform.SCENE, Platform.SWITCH]
FRONTEND_DIR = pathlib.Path(__file__).parent / "frontend"
VERSION = json.loads((pathlib.Path(__file__).parent / "manifest.json").read_text())["version"]

type MultiroomConfigEntry = ConfigEntry[MultiroomDevice]


async def async_setup_entry(hass: HomeAssistant, entry: MultiroomConfigEntry) -> bool:
    device = MultiroomDevice(
        entry.data[CONF_HOST], entry.data[CONF_PORT], entry.data[CONF_USERNAME], entry.data[CONF_PASSWORD],
        entry.data.get(CONF_DEVICE_ID, "0"), caps=entry.options.get(OPT_CAPS),
        scenes=entry.options.get(OPT_SCENES),
    )

    def save_caps(caps: dict[str, float]) -> None:
        hass.config_entries.async_update_entry(entry, options={**entry.options, OPT_CAPS: caps})

    def save_scenes(scenes: list) -> None:
        hass.config_entries.async_update_entry(entry, options={**entry.options, OPT_SCENES: scenes})

    device.on_caps_changed = save_caps
    device.on_scenes_changed = save_scenes
    # The ClearOne itself; each room device points to it.
    dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={(DOMAIN, entry.entry_id)},
        name="ClearOne CONVERGE Pro 880T", manufacturer="ClearOne", model="CONVERGE Pro 880T",
    )
    entry.runtime_data = device
    # Connects, polls and reconnects in the background; cancelled automatically on unload.
    entry.async_create_background_task(hass, device.run(), f"{DOMAIN}_{entry.entry_id}")

    await _async_register_panel(hass)
    async_register_commands(hass)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    arylic = entry.options.get(OPT_ARYLIC_ENTITY)
    if arylic:
        entry.async_on_unload(_keep_arylic_at_full_volume(hass, arylic))

    async def options_updated(hass: HomeAssistant, entry: MultiroomConfigEntry) -> None:
        # Cap changes are applied live; only a different Arylic player needs a reload.
        if entry.options.get(OPT_ARYLIC_ENTITY) != arylic:
            await hass.config_entries.async_reload(entry.entry_id)

    entry.async_on_unload(entry.add_update_listener(options_updated))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: MultiroomConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        entry.runtime_data.close()
        entry.runtime_data = None
        others = [e for e in hass.config_entries.async_entries(DOMAIN)
                  if e.entry_id != entry.entry_id and isinstance(getattr(e, "runtime_data", None), MultiroomDevice)]
        if not others and hass.data.get(f"{DOMAIN}_panel"):
            frontend.async_remove_panel(hass, PANEL_URL)
            hass.data[f"{DOMAIN}_panel"] = False
    return unloaded


async def _async_register_panel(hass: HomeAssistant) -> None:
    if not hass.data.get(f"{DOMAIN}_static"):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(FRONTEND_DIR), cache_headers=False)]
        )
        hass.data[f"{DOMAIN}_static"] = True
    if not hass.data.get(f"{DOMAIN}_panel"):
        await panel_custom.async_register_panel(
            hass,
            frontend_url_path=PANEL_URL,
            webcomponent_name=PANEL_COMPONENT,
            sidebar_title="Multiroom",
            sidebar_icon="mdi:speaker-multiple",
            module_url=f"{STATIC_URL}/multiroom-panel.js?v={VERSION}",
            require_admin=False,
        )
        hass.data[f"{DOMAIN}_panel"] = True


_LOGGER = logging.getLogger(__name__)
FULL_VOLUME_RETRY_S = 30


def _keep_arylic_at_full_volume(hass: HomeAssistant, arylic: str):
    """The Arylic stays at 100 %; room volume is done in the ClearOne. At most one attempt per 30 s."""
    last_attempt = 0.0

    @callback
    def changed(event: Event[EventStateChangedData]) -> None:
        nonlocal last_attempt
        new = event.data["new_state"]
        level = new.attributes.get("volume_level") if new else None
        if level is None or level >= 0.999 or time.monotonic() - last_attempt < FULL_VOLUME_RETRY_S:
            return
        last_attempt = time.monotonic()
        _LOGGER.debug("Setting %s back to full volume (was %s)", arylic, level)
        hass.async_create_task(hass.services.async_call(
            "media_player", "volume_set", {"entity_id": arylic, "volume_level": 1.0}, blocking=False))

    return async_track_state_change_event(hass, [arylic], changed)
