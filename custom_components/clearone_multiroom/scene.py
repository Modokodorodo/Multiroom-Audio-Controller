"""Multiroom scenes as Home Assistant scene entities (dashboards, automations, Alexa).

Scenes are created in the sidebar panel; entities appear and disappear as scenes are saved/deleted.
"""
from __future__ import annotations

from typing import Any

from homeassistant.components.scene import Scene
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import MultiroomConfigEntry
from .clearone import ClearOneError
from .const import DOMAIN


async def async_setup_entry(hass: HomeAssistant, entry: MultiroomConfigEntry, add: AddEntitiesCallback) -> None:
    device = entry.runtime_data
    known: dict[str, MultiroomScene] = {}

    @callback
    def sync() -> None:
        ids = {sc["id"] for sc in device.scenes}
        new = [MultiroomScene(entry, device, sc["id"]) for sc in device.scenes if sc["id"] not in known]
        for ent in new:
            known[ent.scene_id] = ent
        if new:
            add(new)
        registry = er.async_get(hass)
        for scene_id in [k for k in known if k not in ids]:
            ent = known.pop(scene_id)
            if ent.entity_id and registry.async_get(ent.entity_id):
                registry.async_remove(ent.entity_id)

    sync()
    entry.async_on_unload(device.add_listener(sync))


class MultiroomScene(Scene):
    _attr_should_poll = False
    _attr_icon = "mdi:speaker-multiple"

    def __init__(self, entry: MultiroomConfigEntry, device, scene_id: str) -> None:
        self.device, self.scene_id = device, scene_id
        self._attr_unique_id = f"{entry.entry_id}_scene_{scene_id}"
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, entry.entry_id)})
        self._shown_name: str | None = None

    @property
    def _scene(self) -> dict[str, Any] | None:
        return next((sc for sc in self.device.scenes if sc["id"] == self.scene_id), None)

    @property
    def name(self) -> str:
        sc = self._scene
        return sc["name"] if sc else self.scene_id

    @property
    def available(self) -> bool:
        return self.device.status == "ready" and self._scene is not None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        sc = self._scene
        return {"rooms": self.device.scene_summary(sc)["rooms"]} if sc else {}

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(self.device.add_listener(self._changed))

    @callback
    def _changed(self) -> None:
        if self.hass is not None and self._scene is not None:
            self.async_write_ha_state()

    async def async_activate(self, **kwargs: Any) -> None:
        try:
            await self.device.apply_scene(self.scene_id)
        except ClearOneError as err:
            raise HomeAssistantError(str(err)) from err
