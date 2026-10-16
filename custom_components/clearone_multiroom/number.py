"""Room volume as a number entity (slider); its maximum follows the room cap."""
from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import MultiroomConfigEntry
from .clearone import ClearOneError
from .entity import RoomEntity


async def async_setup_entry(hass: HomeAssistant, entry: MultiroomConfigEntry, add: AddEntitiesCallback) -> None:
    device = entry.runtime_data
    add(RoomVolume(entry, device, room) for room in device.rooms)


class RoomVolume(RoomEntity, NumberEntity):
    _attr_translation_key = "volume"
    _attr_icon = "mdi:volume-high"
    _attr_mode = NumberMode.SLIDER
    _attr_native_step = 0.5
    _attr_native_unit_of_measurement = "dB"

    def __init__(self, entry, device, room) -> None:
        super().__init__(entry, device, room, "volume")

    @property
    def native_min_value(self) -> float:
        return self.room["minDb"]

    @property
    def native_max_value(self) -> float:
        return self.room["maxDb"]

    @property
    def native_value(self) -> float | None:
        return self.room["gainDb"]

    async def async_set_native_value(self, value: float) -> None:
        try:
            await self.device.set_room_gain(self.room_id, value)
        except ClearOneError as err:
            raise HomeAssistantError(str(err)) from err
