# Handoff

Current state of the project for whoever continues (Claude Code, Codex or a person). Updated 2026-10-16, Europe/Brussels.

## Status

The live browser interface controls the real ClearOne CONVERGE Pro 880T and is in daily use by the owner.

| Area | State |
|---|---|
| Rooms | Toilet (O1), Kitchen extension (O2), Laundry room (O3). Mono, one output each. O4–O12 are expansion outputs and hidden. |
| Per room | Volume with cap, mute, source on/off (Arylic, Birds, Alexa; sources mix), "Playing" badge. |
| Inputs tab | Input gain per source; AGC on/off and settings in a dialog. Arylic = M1+M2 written together. |
| Settings | Per-room volume caps (Toilet -25, Kitchen extension -15, Laundry room -20 dB, confirmed by the user). |
| Connection | Status pill, warning banner, automatic reconnect with back-off (5–30 s); no writes are replayed. |
| Tests | `npm test`: 12 passing (simulated fake device and mock mode). |

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
