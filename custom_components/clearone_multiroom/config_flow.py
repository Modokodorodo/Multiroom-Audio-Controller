"""Setup dialog: address and Console login of the ClearOne, checked by connecting."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_PORT, CONF_USERNAME
from homeassistant.core import callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.selector import (
    BooleanSelector, EntitySelector, EntitySelectorConfig, NumberSelector, NumberSelectorConfig, NumberSelectorMode,
    SelectSelector, SelectSelectorConfig, SelectSelectorMode,
)

from .clearone import ClearOneAuthError, ClearOneError, ClearOneTelnet
from .const import (
    CONF_DEVICE_ID, DEFAULTS, DOMAIN, OPT_ARYLIC_ENTITY, OPT_AUTO_OFF, OPT_AUTO_ON, OPT_HOLD_PLAYBACK,
    OPT_HIDDEN_ROOMS, OPT_IDLE_MINUTES, OPT_IGNORED_SOURCES, OPT_POWER_ENTITY, OPT_THRESHOLD, ROOMS, SOURCES,
)


class MultiroomConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return MultiroomOptionsFlow()

    @staticmethod
    async def _check(data: dict[str, Any]) -> dict[str, str]:
        """Log in and query the device ID; return form errors (empty when it works)."""
        client = ClearOneTelnet(data[CONF_HOST], data[CONF_PORT])
        try:
            await client.connect(data[CONF_USERNAME], data[CONF_PASSWORD])
            await client.query(f"#D{data[CONF_DEVICE_ID]} VER")
        except ClearOneAuthError:
            return {"base": "invalid_auth"}
        except ClearOneError:
            return {"base": "cannot_connect"}
        finally:
            client.close()
        return {}

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            await self.async_set_unique_id(f"{user_input[CONF_HOST]}_{user_input[CONF_DEVICE_ID]}")
            self._abort_if_unique_id_configured()
            errors = await self._check(user_input)
            if not errors:
                return self.async_create_entry(title=f"ClearOne {user_input[CONF_HOST]}", data=user_input)
        schema = vol.Schema({
            vol.Required(CONF_HOST): str,
            vol.Required(CONF_PORT, default=23): int,
            vol.Required(CONF_USERNAME): str,
            vol.Required(CONF_PASSWORD): str,
            vol.Required(CONF_DEVICE_ID, default="0"): vol.In(list("0123456789AB")),
        })
        return self.async_show_form(step_id="user", data_schema=self.add_suggested_values_to_schema(schema, user_input), errors=errors)

    async def async_step_reconfigure(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Change address, port, login or device ID in place; options (caps, scenes, Arylic, power) are kept."""
        entry = self._get_reconfigure_entry()
        errors: dict[str, str] = {}
        if user_input is not None:
            data = {**entry.data, **user_input}
            if not user_input.get(CONF_PASSWORD):
                data[CONF_PASSWORD] = entry.data[CONF_PASSWORD]  # empty field keeps the stored password
            unique_id = f"{data[CONF_HOST]}_{data[CONF_DEVICE_ID]}"
            if any(e.unique_id == unique_id and e.entry_id != entry.entry_id for e in self._async_current_entries()):
                return self.async_abort(reason="already_configured")
            errors = await self._check(data)
            if not errors:
                return self.async_update_reload_and_abort(
                    entry, unique_id=unique_id, title=f"ClearOne {data[CONF_HOST]}", data=data)
        current = {k: v for k, v in entry.data.items() if k != CONF_PASSWORD}
        schema = vol.Schema({
            vol.Required(CONF_HOST): str,
            vol.Required(CONF_PORT): int,
            vol.Required(CONF_USERNAME): str,
            vol.Optional(CONF_PASSWORD): str,
            vol.Required(CONF_DEVICE_ID): vol.In(list("0123456789AB")),
        })
        return self.async_show_form(step_id="reconfigure", errors=errors,
                                    data_schema=self.add_suggested_values_to_schema(schema, user_input or current))


class MultiroomOptionsFlow(OptionsFlow):
    """Choose the Arylic's media player (room speakers stream through it) and the power switch."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            options = {**self.config_entry.options}  # keep caps and scenes
            for key in (OPT_ARYLIC_ENTITY, OPT_POWER_ENTITY):
                if user_input.get(key):
                    options[key] = user_input[key]
                else:
                    options.pop(key, None)
            for key in DEFAULTS:
                if key in user_input:
                    options[key] = user_input[key]
            options[OPT_IDLE_MINUTES] = int(options.get(OPT_IDLE_MINUTES, DEFAULTS[OPT_IDLE_MINUTES]))
            return self.async_create_entry(data=options)
        def opt(key: str):
            return self.config_entry.options.get(key, DEFAULTS[key])

        own = [e.entity_id for e in er.async_entries_for_config_entry(er.async_get(self.hass), self.config_entry.entry_id)]
        schema = vol.Schema({
            vol.Optional(OPT_ARYLIC_ENTITY, description={"suggested_value": self.config_entry.options.get(OPT_ARYLIC_ENTITY)}):
                EntitySelector(EntitySelectorConfig(domain="media_player", exclude_entities=own)),
            vol.Optional(OPT_POWER_ENTITY, description={"suggested_value": self.config_entry.options.get(OPT_POWER_ENTITY)}):
                EntitySelector(EntitySelectorConfig(domain=["switch", "input_boolean", "light"])),
            vol.Required(OPT_AUTO_ON, default=opt(OPT_AUTO_ON)): BooleanSelector(),
            vol.Required(OPT_HOLD_PLAYBACK, default=opt(OPT_HOLD_PLAYBACK)): BooleanSelector(),
            vol.Required(OPT_AUTO_OFF, default=opt(OPT_AUTO_OFF)): BooleanSelector(),
            vol.Required(OPT_IDLE_MINUTES, default=opt(OPT_IDLE_MINUTES)): NumberSelector(NumberSelectorConfig(
                min=1, max=480, step=1, unit_of_measurement="min", mode=NumberSelectorMode.BOX)),
            vol.Required(OPT_THRESHOLD, default=opt(OPT_THRESHOLD)): NumberSelector(NumberSelectorConfig(
                min=-90, max=-10, step=1, unit_of_measurement="dB", mode=NumberSelectorMode.BOX)),
            vol.Required(OPT_IGNORED_SOURCES, default=opt(OPT_IGNORED_SOURCES)): SelectSelector(SelectSelectorConfig(
                options=[{"value": s["id"], "label": s["name"]} for s in SOURCES], multiple=True,
                mode=SelectSelectorMode.LIST)),
            vol.Required(OPT_HIDDEN_ROOMS, default=opt(OPT_HIDDEN_ROOMS)): SelectSelector(SelectSelectorConfig(
                options=[{"value": r["id"], "label": r["name"]} for r in ROOMS], multiple=True,
                mode=SelectSelectorMode.LIST)),
        })
        return self.async_show_form(step_id="init", data_schema=schema)
