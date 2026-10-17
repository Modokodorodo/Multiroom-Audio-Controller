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


async def test_room_speakers_stream_via_arylic(hass: HomeAssistant, socket_enabled) -> None:
    """Room speakers: state/metadata mirror the Arylic, volume maps to the room range, play routes Arylic in."""
    from homeassistant.const import EVENT_CALL_SERVICE

    fake = FakeClearOne()
    port = await fake.start()
    hass.states.async_set("media_player.arylic", "playing", {"media_title": "Song", "media_artist": "Band"})
    calls = []
    hass.bus.async_listen(EVENT_CALL_SERVICE, lambda e: calls.append(e.data) if e.data.get("service_data", {}).get("entity_id") == "media_player.arylic" else None)
    entry = MockConfigEntry(domain=DOMAIN, title="ClearOne test", unique_id="127.0.0.1_0",
                            data={"host": "127.0.0.1", "port": port, "username": "u", "password": "p", "device_id": "0"},
                            options={"arylic_entity": "media_player.arylic"})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    for _ in range(50):
        await hass.async_block_till_done()
        if entry.runtime_data.status == "ready":
            break
        await asyncio.sleep(0.05)
    await hass.async_block_till_done()
    try:
        toilet = hass.states.get("media_player.toilet")
        assert toilet.state == "playing"
        assert toilet.attributes["media_title"] == "Song"
        assert toilet.attributes["volume_level"] == (-35 + 60) / (-25 + 60)  # -35 dB in -60..-25

        await hass.services.async_call("media_player", "volume_set", {"entity_id": "media_player.toilet", "volume_level": 0.5}, blocking=True)
        assert "#D0 GAIN 1 O -42.5 A" in fake.received  # -60 + 0.5 * 35

        await hass.services.async_call("media_player", "turn_off", {"entity_id": "media_player.laundry_room"}, blocking=True)
        await hass.async_block_till_done()
        assert hass.states.get("media_player.laundry_room").state == "off"
        assert "#D0 MTRX A P 3 O 0" in fake.received

        await hass.services.async_call("media_player", "play_media", {"entity_id": "media_player.laundry_room",
            "media_content_type": "music", "media_content_id": "http://ma/stream.flac"}, blocking=True)
        await hass.async_block_till_done()
        assert "#D0 MTRX A P 3 O 1" in fake.received  # Arylic routed into the room first
        assert calls[-1]["service"] == "play_media"
        assert calls[-1]["service_data"]["media_content_id"] == "http://ma/stream.flac"

        for room in ("toilet", "kitchen_extension", "laundry_room"):
            await hass.services.async_call("media_player", "turn_off", {"entity_id": f"media_player.{room}"}, blocking=True)
        assert calls[-1]["service"] == "media_pause"  # nobody listening any more

        hass.states.async_set("media_player.arylic", "playing", {"volume_level": 0.4})  # e.g. lowered in the Spotify app
        await hass.async_block_till_done()
        assert calls[-1]["service"] == "volume_set" and calls[-1]["service_data"]["volume_level"] == 1.0
        n = len(calls)
        hass.states.async_set("media_player.arylic", "playing", {"volume_level": 0.3})
        await hass.async_block_till_done()
        assert len(calls) == n  # rate-limited: no second attempt within 30 s
        await hass.config_entries.async_unload(entry.entry_id)
    finally:
        await fake.stop()


async def test_options_choose_arylic_and_keep_caps(hass: HomeAssistant, socket_enabled) -> None:
    fake = FakeClearOne()
    entry = await _setup(hass, fake)
    try:
        entry.runtime_data.set_cap("toilet", -30)
        hass.states.async_set("media_player.arylic", "idle")
        result = await hass.config_entries.options.async_init(entry.entry_id)
        result = await hass.config_entries.options.async_configure(result["flow_id"], {"arylic_entity": "media_player.arylic"})
        assert result["type"] == "create_entry"
        await hass.async_block_till_done()
        assert entry.options == {"caps": {"toilet": -30, "kitchen-ext": -15.0, "laundry": -20.0}, "arylic_entity": "media_player.arylic"}
        for _ in range(50):  # reloaded with the Arylic configured
            await hass.async_block_till_done()
            if entry.runtime_data and entry.runtime_data.status == "ready":
                break
            await asyncio.sleep(0.05)
        assert hass.states.get("media_player.toilet").attributes["supported_features"] & 512  # PLAY_MEDIA
        await hass.config_entries.async_unload(entry.entry_id)
    finally:
        await fake.stop()



async def test_scenes_as_entities(hass: HomeAssistant, hass_ws_client, socket_enabled) -> None:
    fake = FakeClearOne()
    entry = await _setup(hass, fake)
    try:
        ws = await hass_ws_client(hass)
        await ws.send_json({"id": 1, "type": f"{DOMAIN}/scene_save", "name": "Downstairs music", "room_ids": ["kitchen-ext", "laundry"]})
        msg = await ws.receive_json()
        assert msg["success"], msg
        await hass.async_block_till_done()
        state = hass.states.get("scene.downstairs_music")
        assert state is not None and [r["name"] for r in state.attributes["rooms"]] == ["Kitchen extension", "Laundry room"]
        assert entry.options["scenes"][0]["name"] == "Downstairs music"

        await hass.services.async_call("switch", "turn_on", {"entity_id": "switch.laundry_room_alexa"}, blocking=True)
        await hass.services.async_call("scene", "turn_on", {"entity_id": "scene.downstairs_music"}, blocking=True)
        await hass.async_block_till_done()
        assert hass.states.get("switch.laundry_room_alexa").state == "off"

        await ws.send_json({"id": 2, "type": f"{DOMAIN}/scene_delete", "scene_id": msg["result"]["scene_id"]})
        assert (await ws.receive_json())["success"]
        await hass.async_block_till_done()
        assert hass.states.get("scene.downstairs_music") is None
        assert entry.options["scenes"] == []
        await hass.config_entries.async_unload(entry.entry_id)
    finally:
        await fake.stop()
