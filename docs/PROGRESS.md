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

## Code map

- `src/server.js`: loopback HTTP server, static files, JSON API, same-origin and Host checks. `DEVICE_MODE=mock` (default) or `live`.
- `src/live-controller.js`: connection lifecycle, full refresh every 15 s, presence poll every 3 s, reconnect with back-off, one validated change at a time with readback (`update`, `setInputGain`, `setInputAgc`, `setInputAgcSettings`, `setCap`).
- `src/clearone-telnet.js`: Telnet transport: option refusal, login, serialized queries matched on the echoed command, deadlines, bounded buffer, QUERY and WRITE whitelists.
- `src/controller.js`, `src/mock-device.js`, `src/protocol.js`, `config/mock.js`: mock mode.
- `config/live-rooms.json`: the installation's room/source mapping and ranges.
- `public/`: `index.html`, `app.js`, `style.css`.
- `test/controller.test.js`: protocol helpers, mock lifecycle, HTTP security.
- `test/live.test.js`: whitelist refusal, login and fragmented replies against a simulated device, validation, readback mismatch, timeouts.

## API (live mode)

| Method and path | Body | Effect |
|---|---|---|
| `GET /api/state` | | Current state |
| `POST /api/connect`, `/api/disconnect` | `{}` | Reconnect / disconnect |
| `POST /api/rooms/<id>` | `{"patch": {"gainDb": n} \| {"muted": bool} \| {"source": {"id", "on": bool}}}` | Room change |
| `POST /api/rooms/<id>/cap` | `{"maxDb": n}` | App-side cap only |
| `POST /api/inputs/<id>` | `{"gainDb": n}` | Input gain |
| `POST /api/inputs/<id>/agc` | `{"on": bool}` | AGC on/off |
| `POST /api/inputs/<id>/agcset` | `{"settings": {"thresholdDb", "targetDb", "responseS", "maxGainDb"}}` | AGC settings |
