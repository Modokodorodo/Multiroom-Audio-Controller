"""Setup dialog: address and Console login of the ClearOne, checked by connecting."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_PORT, CONF_USERNAME
from homeassistant.core import callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.selector import EntitySelector, EntitySelectorConfig

from .clearone import ClearOneAuthError, ClearOneError, ClearOneTelnet
from .const import CONF_DEVICE_ID, DOMAIN, OPT_ARYLIC_ENTITY


class MultiroomConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return MultiroomOptionsFlow()

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            await self.async_set_unique_id(f"{user_input[CONF_HOST]}_{user_input[CONF_DEVICE_ID]}")
            self._abort_if_unique_id_configured()
            client = ClearOneTelnet(user_input[CONF_HOST], user_input[CONF_PORT])
            try:
                await client.connect(user_input[CONF_USERNAME], user_input[CONF_PASSWORD])
                await client.query(f"#D{user_input[CONF_DEVICE_ID]} VER")
            except ClearOneAuthError:
                errors["base"] = "invalid_auth"
            except ClearOneError:
                errors["base"] = "cannot_connect"
            else:
                return self.async_create_entry(title=f"ClearOne {user_input[CONF_HOST]}", data=user_input)
            finally:
                client.close()
        schema = vol.Schema({
            vol.Required(CONF_HOST): str,
            vol.Required(CONF_PORT, default=23): int,
            vol.Required(CONF_USERNAME): str,
            vol.Required(CONF_PASSWORD): str,
            vol.Required(CONF_DEVICE_ID, default="0"): vol.In(list("0123456789AB")),
        })
        return self.async_show_form(step_id="user", data_schema=self.add_suggested_values_to_schema(schema, user_input), errors=errors)


class MultiroomOptionsFlow(OptionsFlow):
    """Choose the Arylic's media player; the room speakers stream through it."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            options = {**self.config_entry.options}  # keep the volume caps
            if user_input.get(OPT_ARYLIC_ENTITY):
                options[OPT_ARYLIC_ENTITY] = user_input[OPT_ARYLIC_ENTITY]
            else:
                options.pop(OPT_ARYLIC_ENTITY, None)
            return self.async_create_entry(data=options)
        own = [e.entity_id for e in er.async_entries_for_config_entry(er.async_get(self.hass), self.config_entry.entry_id)]
        schema = vol.Schema({
            vol.Optional(OPT_ARYLIC_ENTITY, description={"suggested_value": self.config_entry.options.get(OPT_ARYLIC_ENTITY)}):
                EntitySelector(EntitySelectorConfig(domain="media_player", exclude_entities=own)),
        })
        return self.async_show_form(step_id="init", data_schema=schema)
