# Plan

Phases from the original brief ([PROJECT_BRIEF.md](../PROJECT_BRIEF.md)) and their status on 2026-10-16.

| Phase | Scope | Status |
|---|---|---|
| 0 | Inspect manuals, protocol reference, mapping template | Done |
| 1 | Local prototype: rooms, sources, volume, mute, connection status; mock mode; first hardware test on one room | Done |
| 2 | Expand daily controls to confirmed rooms and sources | Done for O1–O3; inputs tab and AGC added |
| 3 | Server hosting and Home Assistant | Not started. First establish the Home Assistant installation type. |
| 4 | KinCony power control and idle shutdown (audio presence + presence detection) | Not started. KinCony model and entities unknown. |

Backlog and recommendations: [OPPORTUNITIES.md](OPPORTUNITIES.md).

## Reference files

| File | Use | In repository |
|---|---|---|
| `800-151-880-Rev3.2_Serial-Command-Guide_WEB.pdf` | Command grammar, groups, parameters. Primary protocol source. | No (ClearOne copyright); place in `docs/` locally |
| `CONVERGE Pro Manual.pdf` | Installation, Telnet, default login, DSP context | No; place in `docs/` locally |
| `Network Port Used with CONVERGE Pro SR Systems.pdf` | Referenced in the brief; never supplied. Port 23 is confirmed by the main manual and by connecting. | No |
| `docs/READ_ONLY_SNAPSHOT.json` | Raw 194-record read-only capture from 2026-10-16. Evidence, not a backup. | Yes |

No configuration export, site file or backup of the ClearOne exists in this project. Making one with Converge Console is recommended before further changes.
