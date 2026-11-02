"""Countdown for the automatic switch-off: the time the system will switch off (a timestamp sensor,
which dashboards show as "in 12 minutes"). Unknown when no countdown is running."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from . import MultiroomConfigEntry
from .const import DOMAIN


async def async_setup_entry(hass: HomeAssistant, entry: MultiroomConfigEntry, add: AddEntitiesCallback) -> None:
    add([AutoOffSensor(entry, entry.runtime_data)])


class AutoOffSensor(SensorEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_translation_key = "auto_off"
    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _attr_icon = "mdi:timer-off-outline"

    def __init__(self, entry: MultiroomConfigEntry, device) -> None:
        self.device = device
        self._attr_unique_id = f"{entry.entry_id}_auto_off"
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, entry.entry_id)})
        self._shown: dict[str, Any] | None = None

    @property
    def native_value(self) -> datetime | None:
        info = self.device.auto_off_info or {}
        return dt_util.parse_datetime(info["offAt"]) if info.get("state") == "counting" else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        info = self.device.auto_off_info or {}
        return {"status": info.get("state"), "minutes": info.get("minutes"), "last_activity": info.get("lastActivity")}

    async def async_added_to_hass(self) -> None:
        # The countdown changes with sound levels (pushed every few seconds); only write when it changed.
        self.async_on_remove(self.device.add_listener(self._changed, levels=True))

    @callback
    def _changed(self) -> None:
        if self.device.auto_off_info != self._shown:
            self._shown = dict(self.device.auto_off_info or {})
            self.async_write_ha_state()
