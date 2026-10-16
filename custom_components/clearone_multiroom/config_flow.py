"""Setup dialog: address and Console login of the ClearOne, checked by connecting."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_PORT, CONF_USERNAME

from .clearone import ClearOneAuthError, ClearOneError, ClearOneTelnet
from .const import CONF_DEVICE_ID, DOMAIN


class MultiroomConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

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
