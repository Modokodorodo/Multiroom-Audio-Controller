# Handoff

Current state of the project for whoever continues (Claude Code, Codex or a person). Updated 2026-10-16, Europe/Brussels.

## Status

The live browser interface controls the real ClearOne CONVERGE Pro 880T and is in daily use by the owner.

**New (Milestone 13): Home Assistant integration** in `custom_components/clearone_multiroom` (install: README). Python port of the device logic (same whitelist, validation and readback), a **Multiroom** sidebar panel (port of the web UI, using Home Assistant theme colors, state pushed over the HA WebSocket), and per-room entities: Volume (number), Mute (switch), one switch per source, Playing (binary sensor). Input gain and AGC are panel-only by the user's choice. Caps are stored in the config entry options. Tested: 8 Python device tests against a simulated ClearOne; 2 tests in a real Home Assistant 2025.1 test instance (setup, entities, services, panel registration, WebSocket commands, config flow incl. wrong password, unload); hardware read and one gain write/restore through the Python code. **Not yet tested: installation in the user's Home Assistant and the panel in a browser.** 

**Milestone 14: room speakers for Music Assistant** (version 0.2.0). `media_player.py`: one speaker per room; state and track info mirror the Arylic's media player while Arylic is routed to the room; play/play_media route Arylic into the room first and forward to the Arylic; turn_off removes the route and pauses the Arylic when no room has it; volume_level maps linearly onto the room's dB range up to the cap; mute = room mute. Arylic entity chosen in the integration options (caps are preserved; changing the Arylic reloads the entry). By user decision the Arylic stays at 100 % volume: the integration sets it back to 1.0 when something lowers it (max once per 30 s). Tested in a Home Assistant test instance with a simulated Arylic (4 HA tests + 8 device tests pass). **Confirmed by the user (2026-10-17): the room speakers appear in Music Assistant (LinkPlay entity chosen) and playback on a room works quickly.**

**Milestone 15: scenes** (version 0.3.0). Stored in the config entry options (`scenes`); created, updated (rename / capture current state), deleted and applied from the panel's Scenes tab, with quick-apply buttons above the room cards; each scene is a `scene` entity (added/removed live). Applying: per room, mute first, sources, volume clamped to today's cap, unmute last; only differing values are written; one refresh at the end. Tests: 9 device + 5 Home Assistant tests pass (simulated). Not yet tested on hardware or in the user's Home Assistant.

**Milestone 16: power switch in the panel** (version 0.4.0). Options: `power_entity` (switch / input_boolean / light; the KinCony relay that powers the ClearOne and the amplifier). Panel: ⏻ button with confirmation on switch-off, "switched off" banner with Turn on, "starting up" while connecting. `clearone_multiroom/power` calls homeassistant.turn_on/off, then `device.kick()` retries every 5 s for 3 minutes. Panel subscriptions are now held at hass level and look the device up on every push, so the panel keeps working after the entry reloads. A tests-found bug (state listener without @callback ran in a worker thread) was fixed before release. 9 device + 6 HA tests pass. Not tested with the real relay.

| Area | State |
|---|---|
| Rooms | Toilet (O1), Kitchen extension (O2), Laundry room (O3). Mono, one output each. O4–O12 are expansion outputs and hidden. |
| Per room | Volume with cap, mute, source on/off (Arylic, Birds, Alexa; sources mix), "Playing" badge. |
| Inputs tab | Input gain per source; AGC on/off and settings in a dialog. Arylic = M1+M2 written together. |
| Settings | Per-room volume caps (Toilet -25, Kitchen extension -15, Laundry room -20 dB, confirmed by the user). |
| Connection | Status pill, warning banner, automatic reconnect with back-off (5–30 s); no writes are replayed. |
| Tests | `npm test`: 12 passing (Mac app). Python: 9 device tests + 6 Home Assistant tests passing. |

See [docs/PROGRESS.md](docs/PROGRESS.md) for the milestone list and code map, and [docs/HARDWARE.md](docs/HARDWARE.md) for every hardware test performed.

## Device and permissions

- ClearOne at 192.168.1.175, TCP 23, device type D, ID 0, firmware 4.4.0.31.
- Login: Console credentials (factory default; the user has decided to keep it, do not raise this again). Credentials are passed via environment variables and are not stored in this repository.
- The user has authorized live changes made through the app: room gain, mute, source routing on/off for the configured rooms, input gain, AGC on/off and AGC settings. For any **new kind** of write, or settings outside the app, ask the user first and read the current value before changing it.
- Never clear the matrix, run presets/macros, change reporting settings, or change unrelated routes or DSP. Never replay writes after a reconnect.

## Run

```sh
CLEARONE_HOST=192.168.1.175 CLEARONE_USER=<user> CLEARONE_PASS=<password> DEVICE_MODE=live npm start
```

Open http://127.0.0.1:8787. `npm start` alone runs the mock.

## Hardware-confirmed vs not yet tested

Confirmed on the device: login sequence, all reads, room gain and mute writes (O1), source on/off (Alexa on O3), input gain (Alexa), AGC on/off and AGCSET (Birds), automatic recovery after the device was powered off and on, audio presence for inputs.

Not yet tested on the device: Arylic and Birds source toggles, input gain and AGC writes for Arylic and Alexa, whether a paused Arylic drops to "no signal", audibility of any change (left to the user). Browser rendering has been checked by the user from screenshots, not by automation.

## Next steps

Ranked in [docs/OPPORTUNITIES.md](docs/OPPORTUNITIES.md). In short:

1. A double-click launcher for the Mac with the password stored outside the command line (Keychain).
2. Scenes and schedules, ideally via Home Assistant. First find out how Home Assistant is installed.
3. Later phases: run the service on the home server, KinCony amplifier power, idle shutdown using audio presence.

User actions recommended: full site-file backup from Converge Console, try AGC off on Arylic.

## History

1. **Codex**: plan, protocol reference, mock prototype, read-only device snapshot (`docs/READ_ONLY_SNAPSHOT.json`).
2. **Claude Code**: live Telnet client and controller, read-only live view, first write test on O1, room mapping, gain/mute controls, source mixing, editable caps, offline handling, input gain tab, AGC switch and settings, layout redesign, "Playing" indicator, repository clean-up.

Details per milestone are in [docs/PROGRESS.md](docs/PROGRESS.md).
