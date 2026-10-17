# ClearOne Multiroom for Home Assistant

A **Home Assistant custom integration** (installable with HACS) that turns a **ClearOne CONVERGE Pro 880T** audio matrix into a multi-room audio system you control from Home Assistant: a sidebar panel, room entities for dashboards and automations, a speaker per room for Music Assistant, and scenes.

It talks to the ClearOne directly over Telnet from inside Home Assistant. No extra service, no cloud, no MQTT.

> The repository also contains the original stand-alone **Mac app** (Node.js) this started as; see [Stand-alone Mac app](#stand-alone-mac-app). Most people want the Home Assistant integration.

## What you get in Home Assistant

- **Multiroom sidebar panel**, following your Home Assistant theme:
  - **Rooms**: volume per room (with a cap), mute, and which sources play in each room (sources can play together). A "Playing" badge shows when a routed source has signal.
  - **Scenes**: save the current state of chosen rooms as a named scene and apply it with one tap.
  - **Inputs**: input gain per source, and automatic gain control (AGC) on/off plus its settings. These are back-end settings, so they are only in the panel.
  - **Settings**: per-room volume caps.
  - **Power**: optional on/off button for the relay that powers the ClearOne and the amplifier.
  - Connection status with automatic reconnect; the last known values stay visible while the device is unreachable.
- **A device per room**, in an area with the room's name, with entities for dashboards, automations and Alexa routines: **Volume** (number, capped), **Mute** (switch), one **switch per source**, **Playing** (binary sensor).
- **A speaker per room for Music Assistant** (`media_player.<room>`). It streams through the Arylic network streamer: playing to a room switches Arylic on in that room; the speaker's volume and mute are the room's volume and mute in the ClearOne. There is one Arylic, so all room speakers share one stream. The Arylic itself is kept at 100 % volume.
- **Scene entities** (`scene.<name>`) for every saved scene, usable on dashboards, in automations and with Alexa. Scenes are stored in Home Assistant, never as ClearOne presets.

## Install

1. **HACS** → ⋮ → **Custom repositories** → add `https://github.com/Modokodorodo/Multiroom-Audio-Controller` as type **Integration** → download **ClearOne Multiroom**.
   Or copy `custom_components/clearone_multiroom` into your Home Assistant `config/custom_components/` folder.
2. **Restart Home Assistant**, then refresh the browser page.
3. **Settings → Devices & services → Add integration → ClearOne Multiroom.** Enter host, port 23, Console username and password, and device ID (usually 0). The login is checked before saving and stored by Home Assistant.
4. **ClearOne Multiroom → Configure** (optional):
   - **Arylic media player**: the **LinkPlay** entity of the Arylic (not Music Assistant's copy). Enables streaming on the room speakers.
   - **Power switch**: the relay that switches the ClearOne and the amplifier. Adds the ⏻ button to the panel.
5. **Music Assistant → Settings → Providers → Home Assistant MediaPlayers**: enable the room speakers.

After each update: restart Home Assistant, then refresh the page.

### Adapting to your installation

The room/source mapping is set in [`custom_components/clearone_multiroom/const.py`](custom_components/clearone_multiroom/const.py) and currently describes one specific installation: three mono rooms on outputs 1–3, and sources Arylic (processing block A, inputs M1+M2), Birds (M3) and Alexa (M4). Change `ROOMS` and `SOURCES` there for another setup, and widen the command whitelist in `clearone.py` if you use other outputs or inputs.

## Safety design

- The Telnet client sends only commands matching an explicit whitelist (`clearone.py`): queries, plus absolute gain, explicit mute, matrix on/off for the configured sources and rooms, input gain and AGC for the configured inputs. Anything else is refused before it reaches the network.
- Every change is validated (caps and documented ranges), sent once, and confirmed by reading the value back. A mismatch shows an error; nothing is retried or replayed after a reconnect.
- Gain is always written as absolute (`A`), never relative. The matrix is never cleared; presets, macros and other DSP settings are never written.
- Keep the ClearOne off the internet: Telnet is unencrypted.

## Tests

```sh
python3 -m unittest discover -s tests   # device layer against a simulated ClearOne (Python 3.11+)
python3 -m pytest tests_ha              # the integration in a Home Assistant test instance
                                        # (pip install pytest-homeassistant-custom-component)
npm test                                # stand-alone Mac app
```

## Stand-alone Mac app

The same controls as a local web page served by a small Node.js service (Node 22+, no dependencies). It has rooms, inputs and caps, but no scenes, room speakers or power button.

```sh
npm start                                        # mock mode with demo rooms: http://127.0.0.1:8787
CLEARONE_HOST=192.168.1.175 CLEARONE_USER=<user> CLEARONE_PASS=<password> DEVICE_MODE=live npm start
```

Open **http://127.0.0.1:8787** (numeric address only). Credentials come from the environment, never from files. Mapping: `config/live-rooms.json`; caps saved from the page: `config/caps.local.json` (git-ignored). The service listens on 127.0.0.1 only and rejects foreign `Host`/`Origin` headers.

Use one controller for daily use (the integration *or* the Mac app); they work side by side, but each keeps its own connection to the ClearOne.

## Repository layout

```
custom_components/clearone_multiroom/   Home Assistant integration
  clearone.py, device.py                 Telnet client and device logic (no Home Assistant imports)
  const.py                               room/source mapping of the installation
  frontend/multiroom-panel.js            sidebar panel
tests/, tests_ha/                        integration tests
src/, public/, config/, test/            stand-alone Mac app
docs/                                    project knowledge, see below
```

## Documentation

- [HANDOFF.md](HANDOFF.md): current state and next steps (start here when continuing development).
- [docs/PROTOCOL.md](docs/PROTOCOL.md): protocol facts with manual page references and observed device behavior.
- [docs/HARDWARE.md](docs/HARDWARE.md): hardware-confirmed findings and tests, in date order.
- [docs/MAPPING.md](docs/MAPPING.md): room, source and channel mapping.
- [docs/PROGRESS.md](docs/PROGRESS.md): milestones, code map and API.
- [docs/OPPORTUNITIES.md](docs/OPPORTUNITIES.md): backlog and recommendations.
- [docs/PLAN.md](docs/PLAN.md): phases and reference files.
- [PROJECT_BRIEF.md](PROJECT_BRIEF.md) and [START_HERE.md](START_HERE.md): the original project brief.

The ClearOne manuals used as references (Serial Command Guide 800-151-880 Rev 3.2 and the CONVERGE Pro manual) are not included because of copyright. Download them from ClearOne and place them in `docs/`.
