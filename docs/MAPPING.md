# Room, source and channel mapping

Confirmed by the user on 2026-10-16 unless noted. The machine-readable version is `config/live-rooms.json`.

## Device

| Field | Value | Evidence |
|---|---|---|
| Host | 192.168.1.175 | User-supplied; Telnet works |
| Port | 23 | Manual and connection |
| Type / ID | D / 0 | `VER` and `DID` replies |
| Firmware | 4.4.0.31 | `VER` reply |

## Rooms

| Room | Output | Device label | Mono/stereo | Device MIN/MAX | App range | Cap |
|---|---|---|---|---|---|---|
| Toilet | O1 | WC | Mono | -65 / +20 dB | -60 dB to cap | -25 dB |
| Kitchen extension | O2 | 2de Kelder | Mono | not read | -60 dB to cap | -15 dB |
| Laundry room | O3 | Waskot | Mono | not read | -60 dB to cap | -20 dB |

O4–O12 are expansion outputs (user). O13 is the integrated amplifier ("Speaker"), not inspected.

## Sources

Every room may play every source; sources mix (independent on/off per room).

| Source | Route into rooms | Route value when on | Input channels (gain, AGC) | Notes |
|---|---|---|---|---|
| Arylic | Processing block A → O1–O3 | 1 | M1 + M2, written together | Arylic L/R summed in processing A (Console screenshot: block A labelled "Arylic"). |
| Birds | M3 → O1–O3 | 3 (mic, non-gated) | M3 | |
| Alexa | M4 → O1–O3 | 3 (mic, non-gated) | M4 | |

## Preserved, never changed by the app

Crosspoint levels (all 0 dB for these routes), routes to O4–O12, processing blocks B–H, faders, expansion and telco routes, filters, compressors, delays, presets and macros.
