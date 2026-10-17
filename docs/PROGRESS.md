# Progress

Updated 2026-10-16 (Europe/Brussels).

## Milestones

| # | Milestone | By | Notes |
|---|---|---|---|
| 0 | Plan, protocol reference, mapping worksheet | Codex | From the manuals, with page references. |
| 1 | Mock prototype | Codex | Node service + plain browser UI, mock device, 7 test groups. |
| 1b | Read-only device snapshot | Codex | 194 query/reply records: identity, outputs O1–O12, input labels, physical routes. |
| 2 | Live read-only view | Claude Code | Telnet client with command whitelist; login sequence confirmed on hardware. |
| 3 | First write test on O1 | Claude Code | Gain -35 → -37 → -35 dB and mute on/off, confirmed by readback. |
| 4 | Room mapping, gain and mute | Claude Code | O1 Toilet, O2 Kitchen extension, O3 Laundry room; per-room caps. |
| 5 | Source mixing per room | Claude Code | Arylic (processing A), Birds (M3), Alexa (M4) on/off per room. |
| 6 | Reliability | Claude Code | Fixed idle socket timeout bug; auto-reconnect with back-off; server starts without device. |
| 7 | Settings dialog | Claude Code | Editable per-room caps, stored in `config/caps.local.json`. |
| 8 | Inputs tab | Claude Code | Input gain per source. (A per-room crosspoint-level version was built first and reverted at the user's request.) |
| 9 | AGC | Claude Code | On/off and settings (threshold, target, response, max gain) in a dialog. |
| 10 | Layout v2 | Claude Code | Cards first; connection details at the bottom; status pill and warning banner. |
| 11 | "Playing" indicator | Claude Code | Audio presence (`ADPRESENT`) every 3 s. |
| 12 | Repository clean-up | Claude Code | Renamed client to `clearone-telnet.js`, removed obsolete template, rewrote docs, prepared for GitHub. |
| 15 | Scenes | Claude Code | Saved room states applied in one tap; scene entities for dashboards, automations and Alexa. |
| 14 | Room speakers (Music Assistant) | Claude Code | media_player per room streaming via the Arylic; Arylic kept at full volume. |
| 13 | Home Assistant integration | Claude Code | `custom_components/clearone_multiroom`: Python device layer, sidebar panel, room entities, config flow. Hardware read + gain write confirmed via the Python code. |

## Code map

- `src/server.js`: loopback HTTP server, static files, JSON API, same-origin and Host checks. `DEVICE_MODE=mock` (default) or `live`.
- `src/live-controller.js`: connection lifecycle, full refresh every 15 s, presence poll every 3 s, reconnect with back-off, one validated change at a time with readback (`update`, `setInputGain`, `setInputAgc`, `setInputAgcSettings`, `setCap`).
- `src/clearone-telnet.js`: Telnet transport: option refusal, login, serialized queries matched on the echoed command, deadlines, bounded buffer, QUERY and WRITE whitelists.
- `src/controller.js`, `src/mock-device.js`, `src/protocol.js`, `config/mock.js`: mock mode.
- `config/live-rooms.json`: the installation's room/source mapping and ranges.
- `public/`: `index.html`, `app.js`, `style.css`.
- `test/controller.test.js`: protocol helpers, mock lifecycle, HTTP security.
- `test/live.test.js`: whitelist refusal, login and fragmented replies against a simulated device, validation, readback mismatch, timeouts.

## Home Assistant integration (`custom_components/clearone_multiroom`)

- `clearone.py`: asyncio Telnet client with the same QUERY/WRITE whitelists (no HA imports).
- `device.py`: rooms/sources model, refresh (~30 queries, 0.7 s on hardware), presence poll, run loop with back-off, validated changes with readback (no HA imports).
- `const.py`: installation mapping (rooms, sources, ranges).
- `__init__.py`: config entry setup, background task, hub device, static path and sidebar panel.
- `websocket.py`: `clearone_multiroom/subscribe`, `/room`, `/input`, `/cap`, `/scene_save`, `/scene_update`, `/scene_delete`, `/scene_apply`.
- `scene.py`: one scene entity per saved scene (added/removed live).
- `number.py`, `switch.py`, `binary_sensor.py`, `media_player.py`, `entity.py`: room entities; `media_player.py` is the room speaker that streams via the Arylic.
- `config_flow.py`: host/port/login/device ID, checked by connecting; options: Arylic media player.
- `frontend/multiroom-panel.js`: the sidebar panel.
- Tests: `tests/test_device.py` (stateful simulated ClearOne, `python3 -m unittest discover -s tests`), `tests_ha/` (Home Assistant test instance, `python -m pytest tests_ha`).

## API (Mac app, live mode)

| Method and path | Body | Effect |
|---|---|---|
| `GET /api/state` | | Current state |
| `POST /api/connect`, `/api/disconnect` | `{}` | Reconnect / disconnect |
| `POST /api/rooms/<id>` | `{"patch": {"gainDb": n} \| {"muted": bool} \| {"source": {"id", "on": bool}}}` | Room change |
| `POST /api/rooms/<id>/cap` | `{"maxDb": n}` | App-side cap only |
| `POST /api/inputs/<id>` | `{"gainDb": n}` | Input gain |
| `POST /api/inputs/<id>/agc` | `{"on": bool}` | AGC on/off |
| `POST /api/inputs/<id>/agcset` | `{"settings": {"thresholdDb", "targetDb", "responseS", "maxGainDb"}}` | AGC settings |
