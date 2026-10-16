"""Load the integration in a real Home Assistant test instance against the SIMULATED ClearOne.

Run: pip install pytest-homeassistant-custom-component && python -m pytest tests_ha
"""
from __future__ import annotations

import asyncio
import pathlib
import sys

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from homeassistant.core import HomeAssistant

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "tests"))
from test_device import FakeClearOne  # noqa: E402

DOMAIN = "clearone_multiroom"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    # The test instance loads custom integrations from its own testing_config; add this repository's.
    import custom_components

    repo = str(pathlib.Path(__file__).resolve().parents[1] / "custom_components")
    if repo not in list(custom_components.__path__):
        custom_components.__path__.append(repo)
    yield


async def _setup(hass: HomeAssistant, fake: FakeClearOne) -> MockConfigEntry:
    port = await fake.start()
    entry = MockConfigEntry(domain=DOMAIN, title="ClearOne test", unique_id="127.0.0.1_0",
                            data={"host": "127.0.0.1", "port": port, "username": "u", "password": "p", "device_id": "0"})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    for _ in range(50):  # the device connects in the background
        await hass.async_block_till_done()
        if entry.runtime_data.status == "ready":
            break
        await asyncio.sleep(0.05)
    await hass.async_block_till_done()
    return entry


async def test_entities_panel_and_websocket(hass: HomeAssistant, hass_ws_client, socket_enabled) -> None:
    fake = FakeClearOne()
    entry = await _setup(hass, fake)
    try:
        assert entry.runtime_data.status == "ready"
        assert hass.states.get("number.toilet_volume").state == "-35.0"
        assert hass.states.get("switch.toilet_mute").state == "off"
        assert hass.states.get("switch.toilet_birds").state == "on"
        assert hass.states.get("switch.laundry_room_alexa").state == "off"
        assert hass.states.get("binary_sensor.toilet_playing").state == "on"
        assert hass.states.get("number.kitchen_extension_volume").attributes["max"] == -15.0
        # No input-gain or AGC entities: those are panel-only back-end settings.
        assert not [s for s in hass.states.async_entity_ids() if "agc" in s or "input" in s]

        await hass.services.async_call("number", "set_value", {"entity_id": "number.toilet_volume", "value": -40}, blocking=True)
        await hass.services.async_call("switch", "turn_on", {"entity_id": "switch.laundry_room_alexa"}, blocking=True)
        await hass.async_block_till_done()
        assert hass.states.get("number.toilet_volume").state == "-40.0"
        assert hass.states.get("switch.laundry_room_alexa").state == "on"
        assert "#D0 GAIN 1 O -40.0 A" in fake.received and "#D0 MTRX 4 M 3 O 3" in fake.received

        assert "multiroom" in hass.data["frontend_panels"]

        ws = await hass_ws_client(hass)
        await ws.send_json({"id": 1, "type": f"{DOMAIN}/subscribe"})
        assert (await ws.receive_json())["success"]
        event = (await ws.receive_json())["event"]
        assert [r["name"] for r in event["rooms"]] == ["Toilet", "Kitchen extension", "Laundry room"]
        await ws.send_json({"id": 2, "type": f"{DOMAIN}/room", "room_id": "toilet", "gain_db": -10})
        while (msg := await ws.receive_json())["id"] != 2:
            pass
        assert not msg["success"] and "Volume must be" in msg["error"]["message"]
        await ws.send_json({"id": 3, "type": f"{DOMAIN}/cap", "room_id": "toilet", "max_db": -30})
        while (msg := await ws.receive_json())["id"] != 3:
            pass
        assert msg["success"] and entry.options["caps"]["toilet"] == -30
        await ws.send_json({"id": 4, "type": f"{DOMAIN}/input", "source_id": "birds", "agc": True})
        while (msg := await ws.receive_json())["id"] != 4:
            pass
        assert msg["success"] and "#D0 AGC 3 M 1" in fake.received

        assert await hass.config_entries.async_unload(entry.entry_id)
        assert "multiroom" not in hass.data["frontend_panels"]
    finally:
        await fake.stop()


async def test_config_flow_checks_login(hass: HomeAssistant, socket_enabled) -> None:
    fake = FakeClearOne()
    port = await fake.start()
    try:
        result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
        assert result["type"] == "form"
        data = {"host": "127.0.0.1", "port": port, "username": "u", "password": "wrong", "device_id": "0"}
        result = await hass.config_entries.flow.async_configure(result["flow_id"], data)
        assert result["errors"] == {"base": "invalid_auth"}
        result = await hass.config_entries.flow.async_configure(result["flow_id"], {**data, "password": "p"})
        assert result["type"] == "create_entry"
        await hass.async_block_till_done()
        await hass.config_entries.async_unload(result["result"].entry_id)
    finally:
        await fake.stop()
