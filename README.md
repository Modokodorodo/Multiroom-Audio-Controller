# Multiroom Audio Controller

A local browser interface for a **ClearOne CONVERGE Pro 880T** used as a multi-room audio matrix. A small Node.js service talks to the ClearOne over Telnet; the browser talks only to that service.

**Features (live mode)**

- **Rooms tab**: per-room volume (with a per-room cap), mute, and which sources play in the room (sources can mix). A "Playing" badge shows when a routed source has signal.
- **Inputs tab**: input gain per source, and automatic gain control (AGC) on/off plus its settings.
- **Settings**: per-room volume caps.
- Connection status with automatic reconnect; the last known values stay visible while the device is unreachable.
- A **mock mode** with invented demo rooms, for trying the interface without hardware.

No dependencies, no build step, no cloud service. Node.js 22 or newer is the only requirement.

## Run

```sh
node --version          # 22 or newer
npm test                # automated tests (simulated device)
npm start               # mock mode: http://127.0.0.1:8787
```

Live mode against the real device:

```sh
CLEARONE_HOST=192.168.1.175 CLEARONE_USER=<user> CLEARONE_PASS=<password> DEVICE_MODE=live npm start
```

Then open **http://127.0.0.1:8787** (use the numeric address; other host names are rejected). Stop with Control-C. Use `PORT=8788` for another port and `CLEARONE_ID` if the device ID is not 0.

Credentials are read from the environment only. Never put them in project files.

## Configuration

- `config/live-rooms.json`: rooms (name, output, volume range), sources (route and input channels) and the input-gain range. This is the verified mapping for this installation.
- `config/caps.local.json`: volume caps saved from the Settings dialog (git-ignored; overrides the defaults).
- `config/mock.js`: invented demo data for mock mode only.

## Safety design

- The Telnet client sends only commands matching an explicit whitelist (`src/clearone-telnet.js`): queries, plus absolute gain, explicit mute, matrix on/off for the configured sources and rooms, input gain and AGC for inputs 1–4. Anything else is refused before it reaches the network.
- Every change is validated (caps and documented ranges), sent once, and confirmed by reading the value back. A mismatch shows an error; nothing is retried or replayed after a reconnect.
- Gain is always written as absolute (`A`), never relative. The matrix is never cleared; presets, macros and other DSP settings are never written.
- The web service listens on 127.0.0.1 only and rejects foreign `Host`/`Origin` headers.
- Keep the ClearOne off the internet: Telnet is unencrypted.

## Layout

```
src/server.js          HTTP service and API (mock or live)
src/live-controller.js live state, polling, validated changes
src/clearone-telnet.js Telnet client with command whitelist
src/controller.js      mock-mode controller
src/mock-device.js     simulated device for mock mode
src/protocol.js        command formatters/parser used by mock mode and tests
public/                browser UI (plain HTML/CSS/JS)
config/                room/source mapping and mock data
test/                  automated tests (node --test)
docs/                  project knowledge, see below
```

## Documentation

- [HANDOFF.md](HANDOFF.md): current state and next steps (start here when continuing).
- [docs/PROTOCOL.md](docs/PROTOCOL.md): protocol facts with manual page references and observed device behavior.
- [docs/HARDWARE.md](docs/HARDWARE.md): hardware-confirmed findings and tests, in date order.
- [docs/MAPPING.md](docs/MAPPING.md): room, source and channel mapping.
- [docs/PROGRESS.md](docs/PROGRESS.md): milestones and code map.
- [docs/OPPORTUNITIES.md](docs/OPPORTUNITIES.md): backlog and recommendations.
- [docs/PLAN.md](docs/PLAN.md): phases and reference files.
- [PROJECT_BRIEF.md](PROJECT_BRIEF.md) and [START_HERE.md](START_HERE.md): the original project brief.

The ClearOne manuals used as references (Serial Command Guide 800-151-880 Rev 3.2 and the CONVERGE Pro manual) are not included in this repository because of copyright. Download them from ClearOne and place them in `docs/`.
