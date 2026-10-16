"""'Playing' per room: a routed source has signal at its input and the room is not muted (inferred)."""
from __future__ import annotations

from typing import Any

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import MultiroomConfigEntry
from .entity import RoomEntity


async def async_setup_entry(hass: HomeAssistant, entry: MultiroomConfigEntry, add: AddEntitiesCallback) -> None:
    device = entry.runtime_data
    add(RoomPlaying(entry, device, room) for room in device.rooms)


class RoomPlaying(RoomEntity, BinarySensorEntity):
    _attr_translation_key = "playing"
    _attr_device_class = BinarySensorDeviceClass.SOUND

    def __init__(self, entry, device, room) -> None:
        super().__init__(entry, device, room, "playing")

    @property
    def is_on(self) -> bool | None:
        return bool(self.room["playing"])

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {"sources": self.room["playing"]}
