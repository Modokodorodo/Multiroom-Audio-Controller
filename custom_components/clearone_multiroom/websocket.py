"""WebSocket commands used by the sidebar panel."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .clearone import ClearOneError
from .const import DOMAIN
from .device import MultiroomDevice


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
    for handler in (ws_subscribe, ws_room, ws_input, ws_cap):
        websocket_api.async_register_command(hass, handler)
    hass.data[f"{DOMAIN}_ws"] = True


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
        connection.send_message(websocket_api.event_message(msg["id"], device.state()))

    connection.subscriptions[msg["id"]] = device.add_listener(forward)
    connection.send_result(msg["id"])
    forward()


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
