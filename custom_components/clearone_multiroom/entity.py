"""Shared entity base: one Home Assistant device per room, linked to the ClearOne."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import Entity

from .const import DOMAIN
from .device import MultiroomDevice


class RoomEntity(Entity):
    """Push-updated entity for one room."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, entry: ConfigEntry, device: MultiroomDevice, room: dict, key: str) -> None:
        self.device, self.room_id = device, room["id"]
        self._attr_unique_id = f"{entry.entry_id}_{room['id']}_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{entry.entry_id}_{room['id']}")}, name=room["name"],
            manufacturer="ClearOne", model=f"880T output {room['output']}",
            via_device=(DOMAIN, entry.entry_id), suggested_area=room["name"],
        )

    @property
    def available(self) -> bool:
        return self.device.status == "ready" and self.room_id in self.device.room_state

    @property
    def room(self) -> dict:
        return self.device.room(self.room_id)

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.device.add_listener(self._handle_update))

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()
