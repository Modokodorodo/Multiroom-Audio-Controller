"""Room mute and one switch per source per room (sources can play together)."""
from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import MultiroomConfigEntry
from .clearone import ClearOneError
from .entity import RoomEntity


async def async_setup_entry(hass: HomeAssistant, entry: MultiroomConfigEntry, add: AddEntitiesCallback) -> None:
    device = entry.runtime_data
    entities: list[SwitchEntity] = []
    for room in device.rooms:
        entities.append(RoomMute(entry, device, room))
        entities.extend(RoomSource(entry, device, room, src) for src in device.sources)
    add(entities)


async def _call(coro) -> None:
    try:
        await coro
    except ClearOneError as err:
        raise HomeAssistantError(str(err)) from err


class RoomMute(RoomEntity, SwitchEntity):
    _attr_translation_key = "mute"

    def __init__(self, entry, device, room) -> None:
        super().__init__(entry, device, room, "mute")

    @property
    def icon(self) -> str:
        return "mdi:volume-off" if self.is_on else "mdi:volume-high"

    @property
    def is_on(self) -> bool | None:
        return self.room["muted"]

    async def async_turn_on(self, **kwargs: Any) -> None:
        await _call(self.device.set_room_mute(self.room_id, True))

    async def async_turn_off(self, **kwargs: Any) -> None:
        await _call(self.device.set_room_mute(self.room_id, False))


class RoomSource(RoomEntity, SwitchEntity):
    _attr_icon = "mdi:music-box-outline"

    def __init__(self, entry, device, room, source) -> None:
        super().__init__(entry, device, room, f"source_{source['id']}")
        self.source_id = source["id"]
        self._attr_name = source["name"]

    @property
    def is_on(self) -> bool | None:
        return next(m["on"] for m in self.room["mix"] if m["id"] == self.source_id)

    async def async_turn_on(self, **kwargs: Any) -> None:
        await _call(self.device.set_room_source(self.room_id, self.source_id, True))

    async def async_turn_off(self, **kwargs: Any) -> None:
        await _call(self.device.set_room_source(self.room_id, self.source_id, False))
