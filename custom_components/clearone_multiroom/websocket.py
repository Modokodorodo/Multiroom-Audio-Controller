"""WebSocket commands used by the sidebar panel."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .clearone import ClearOneError
from .const import (
    DEFAULTS, DOMAIN, OPT_ARYLIC_ENTITY, OPT_AUTO_OFF, OPT_AUTO_ON, OPT_HIDDEN_ROOMS, OPT_HOLD_PLAYBACK,
    OPT_IDLE_MINUTES, OPT_IGNORED_SOURCES, OPT_POWER_ENTITY, OPT_THRESHOLD, ROOMS, SOURCES,
)
from .device import MultiroomDevice


def _entry(hass: HomeAssistant):
    for entry in hass.config_entries.async_entries(DOMAIN):
        if isinstance(getattr(entry, "runtime_data", None), MultiroomDevice):
            return entry
    return None


def _settings(hass: HomeAssistant) -> dict[str, Any]:
    """The integration options as the panel's Settings dialog edits them (same storage as Configure)."""
    entry = _entry(hass)
    opts = entry.options if entry else {}
    return {**{k: opts.get(k, v) for k, v in DEFAULTS.items()},
            OPT_ARYLIC_ENTITY: opts.get(OPT_ARYLIC_ENTITY), OPT_POWER_ENTITY: opts.get(OPT_POWER_ENTITY)}


def _device(hass: HomeAssistant) -> MultiroomDevice | None:
    for entry in hass.config_entries.async_entries(DOMAIN):
        device = getattr(entry, "runtime_data", None)
        if isinstance(device, MultiroomDevice):
            return device
    return None


@callback
def async_register_commands(hass: HomeAssistant) -> None:
    if hass.data.get(f"{DOMAIN}_ws"):
        return
    for handler in (ws_settings, ws_connection, ws_power, ws_subscribe, ws_room, ws_input, ws_cap, ws_scene_save, ws_scene_update, ws_scene_delete, ws_scene_apply):
        websocket_api.async_register_command(hass, handler)
    hass.data[f"{DOMAIN}_ws"] = True


SUBSCRIBERS = f"{DOMAIN}_ws_subscribers"


def _power(hass: HomeAssistant, device: MultiroomDevice) -> dict[str, Any] | None:
    entity = device.power_entity
    if not entity:
        return None
    st = hass.states.get(entity)
    return {"entity": entity, "name": st.attributes.get("friendly_name", entity) if st else entity,
            "on": st.state == "on" if st and st.state in ("on", "off") else None}


@callback
def async_notify_subscribers(hass: HomeAssistant) -> None:
    for forward in list(hass.data.get(SUBSCRIBERS, ())):
        forward()


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/subscribe"})
@callback
def ws_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Push the full state now and after every change."""
    device = _device(hass)
    if device is None:
        connection.send_error(msg["id"], "not_loaded", "ClearOne Multiroom is not loaded")
        return

    @callback
    def forward() -> None:
        current = _device(hass)  # looked up each time, so the panel keeps working after a reload
        if current is not None:
            connection.send_message(websocket_api.event_message(msg["id"], {
                **current.state(), "power": _power(hass, current), "settings": _settings(hass),
                "isAdmin": bool(connection.user and connection.user.is_admin)}))

    subscribers = hass.data.setdefault(SUBSCRIBERS, set())
    subscribers.add(forward)
    connection.subscriptions[msg["id"]] = lambda: subscribers.discard(forward)
    connection.send_result(msg["id"])
    forward()


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/power", vol.Required("on"): bool})
@websocket_api.async_response
async def ws_power(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Switch the ClearOne and amplifier power (the configured switch entity)."""
    device = _device(hass)
    if device is None or not device.power_entity:
        connection.send_error(msg["id"], "not_configured", "No power switch configured (integration options)")
        return
    try:
        await hass.services.async_call("homeassistant", "turn_on" if msg["on"] else "turn_off",
                                       {"entity_id": device.power_entity}, blocking=True)
    except Exception as err:  # noqa: BLE001 - report any service failure to the panel
        connection.send_error(msg["id"], "failed", str(err))
        return
    if msg["on"]:
        device.kick()
    connection.send_result(msg["id"])


async def _run(connection: websocket_api.ActiveConnection, msg: dict[str, Any], coro) -> None:
    try:
        await coro
    except ClearOneError as err:
        connection.send_error(msg["id"], "failed", str(err))
        return
    connection.send_result(msg["id"])


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/room",
    vol.Required("room_id"): str,
    vol.Exclusive("gain_db", "change"): vol.Coerce(float),
    vol.Exclusive("muted", "change"): bool,
    vol.Exclusive("source_id", "change"): str,
    vol.Optional("on"): bool,
})
@websocket_api.async_response
async def ws_room(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    device = _device(hass)
    if device is None:
        connection.send_error(msg["id"], "not_loaded", "ClearOne Multiroom is not loaded")
        return
    if "gain_db" in msg:
        coro = device.set_room_gain(msg["room_id"], msg["gain_db"])
    elif "muted" in msg:
        coro = device.set_room_mute(msg["room_id"], msg["muted"])
    elif "source_id" in msg and "on" in msg:
        coro = device.set_room_source(msg["room_id"], msg["source_id"], msg["on"])
    else:
        connection.send_error(msg["id"], "invalid", "Nothing to change")
        return
    await _run(connection, msg, coro)


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/input",
    vol.Required("source_id"): str,
    vol.Exclusive("gain_db", "change"): vol.Coerce(float),
    vol.Exclusive("agc", "change"): bool,
    vol.Exclusive("agc_settings", "change"): dict,
})
@websocket_api.async_response
async def ws_input(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    device = _device(hass)
    if device is None:
        connection.send_error(msg["id"], "not_loaded", "ClearOne Multiroom is not loaded")
        return
    if "gain_db" in msg:
        coro = device.set_input_gain(msg["source_id"], msg["gain_db"])
    elif "agc" in msg:
        coro = device.set_input_agc(msg["source_id"], msg["agc"])
    elif "agc_settings" in msg:
        coro = device.set_input_agc_settings(msg["source_id"], msg["agc_settings"])
    else:
        connection.send_error(msg["id"], "invalid", "Nothing to change")
        return
    await _run(connection, msg, coro)


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/cap",
    vol.Required("room_id"): str,
    vol.Required("max_db"): vol.Coerce(float),
})
@callback
def ws_cap(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    device = _device(hass)
    if device is None:
        connection.send_error(msg["id"], "not_loaded", "ClearOne Multiroom is not loaded")
        return
    try:
        device.set_cap(msg["room_id"], msg["max_db"])
    except ClearOneError as err:
        connection.send_error(msg["id"], "failed", str(err))
        return
    connection.send_result(msg["id"])


def _sync_call(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any], fn) -> None:
    device = _device(hass)
    if device is None:
        connection.send_error(msg["id"], "not_loaded", "ClearOne Multiroom is not loaded")
        return
    try:
        result = fn(device)
    except ClearOneError as err:
        connection.send_error(msg["id"], "failed", str(err))
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/scene_save", vol.Required("name"): str, vol.Required("room_ids"): [str],
})
@callback
def ws_scene_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    _sync_call(hass, connection, msg, lambda d: {"scene_id": d.save_scene(msg["name"], msg["room_ids"])})


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/scene_update", vol.Required("scene_id"): str,
    vol.Optional("name"): str, vol.Optional("capture", default=False): bool,
})
@callback
def ws_scene_update(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    _sync_call(hass, connection, msg, lambda d: d.update_scene(msg["scene_id"], msg.get("name"), msg["capture"]))


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/scene_delete", vol.Required("scene_id"): str})
@callback
def ws_scene_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    _sync_call(hass, connection, msg, lambda d: d.delete_scene(msg["scene_id"]))


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/scene_apply", vol.Required("scene_id"): str})
@websocket_api.async_response
async def ws_scene_apply(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    device = _device(hass)
    if device is None:
        connection.send_error(msg["id"], "not_loaded", "ClearOne Multiroom is not loaded")
        return
    await _run(connection, msg, device.apply_scene(msg["scene_id"]))


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/connection", vol.Required("action"): vol.In(["pause", "resume", "reconnect"]),
})
@callback
def ws_connection(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Pause or resume communication with the ClearOne, or reconnect now."""
    _sync_call(hass, connection, msg, lambda d: getattr(d, msg["action"])())


SETTINGS_SCHEMA = vol.Schema({
    vol.Optional(OPT_AUTO_ON): bool,
    vol.Optional(OPT_HOLD_PLAYBACK): bool,
    vol.Optional(OPT_AUTO_OFF): bool,
    vol.Optional(OPT_IDLE_MINUTES): vol.All(vol.Coerce(int), vol.Range(min=1, max=480, msg="Minutes must be 1 to 480")),
    vol.Optional(OPT_THRESHOLD): vol.All(vol.Coerce(float), vol.Range(min=-90, max=-10, msg="Threshold must be -90 to -10 dB")),
    vol.Optional(OPT_IGNORED_SOURCES): [vol.In([s["id"] for s in SOURCES])],
    vol.Optional(OPT_HIDDEN_ROOMS): [vol.In([r["id"] for r in ROOMS])],
    vol.Optional(OPT_ARYLIC_ENTITY): vol.Any(None, "", vol.Match(r"^media_player\.[a-z0-9_]+$")),
    vol.Optional(OPT_POWER_ENTITY): vol.Any(None, "", vol.Match(r"^(switch|input_boolean|light)\.[a-z0-9_]+$")),
    vol.Optional("caps"): {vol.In([r["id"] for r in ROOMS]): vol.Coerce(float)},
})


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/settings", vol.Required("values"): dict})
@callback
def ws_settings(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Save settings from the panel. Same storage and effect as the integration's Configure dialog."""
    entry, device = _entry(hass), _device(hass)
    if entry is None or device is None:
        connection.send_error(msg["id"], "not_loaded", "ClearOne Multiroom is not loaded")
        return
    try:
        values = SETTINGS_SCHEMA(msg["values"])
    except vol.Invalid as err:
        connection.send_error(msg["id"], "invalid", str(err.msg if hasattr(err, "msg") else err))
        return
    try:
        for room_id, cap in values.pop("caps", {}).items():
            device.set_cap(room_id, cap)  # stores the caps in the options itself
    except ClearOneError as err:
        connection.send_error(msg["id"], "failed", str(err))
        return
    options = {**entry.options}
    for key, value in values.items():
        if key in (OPT_ARYLIC_ENTITY, OPT_POWER_ENTITY) and not value:
            options.pop(key, None)
        else:
            options[key] = value
    hass.config_entries.async_update_entry(entry, options=options)
    connection.send_result(msg["id"])
