# Room, source and channel mapping

Confirmed by the user on 2026-10-16 unless noted. The machine-readable version is `config/live-rooms.json`.

## Device

| Field | Value | Evidence |
|---|---|---|
| Host | 192.168.1.241 | Since 2026-11 (was 192.168.1.175); confirmed with VER/DID on 2026-11-02 |
| Port | 23 | Manual and connection |
| Type / ID | D / 0 | `VER` and `DID` replies |
| Firmware | 4.4.0.31 | `VER` reply |

## Rooms

Based on the ClearOne output labels (Converge Console screenshot, confirmed by the user on 2026-11-02).

| Room | Output | Device label | Mono/stereo | App range | Cap | Since |
|---|---|---|---|---|---|---|
| Toilet | O1 | WC | Mono | -60 dB to cap | -25 dB | 2026-10-16 |
| Kitchen extension | O2 | 2de Kelder | Mono | -60 dB to cap | -15 dB | 2026-10-16 |
| Laundry room | O3 | Waskot | Mono | -60 dB to cap | -20 dB | 2026-10-16 |
| Kitchen | O4 | Kitchen | Mono | -60 dB to cap | -15 dB (proposed) | 2026-11-02 |
| Dining room | O5 | Dining Room | Mono | -60 dB to cap | -15 dB (proposed) | 2026-11-02 |
| Terrace | O6 | Terras | Mono | -60 dB to cap | -15 dB (proposed) | 2026-11-02 |

Read-only state on 2026-11-02: O4 Kitchen -47.5 dB, O5 Dining Room -38.5 dB, **O6 Terras 0 dB (above the proposed cap; not changed by the app)**; none of them had Arylic, Birds or Alexa routed. O5 has a route from M5 ("Input 5") and O6 from M6 ("Input 6"); both are left alone. O7–O12 are not used as rooms (O7 carries M7). O13 is the integrated amplifier ("Speaker"), not inspected.

## Sources

Every room may play every source; sources mix (independent on/off per room).

| Source | Route into rooms | Route value when on | Input channels (gain, AGC) | Notes |
|---|---|---|---|---|
| Arylic | Processing block A → O1–O6 | 1 | M1 + M2, written together | Arylic L/R summed in processing A (Console screenshot: block A labelled "Arylic"). The Arylic's own volume stays at 100 % (user decision); volume is controlled in the ClearOne. |
| Birds | M3 → O1–O6 | 3 (mic, non-gated) | M3 | |
| Alexa | M4 → O1–O6 | 3 (mic, non-gated) | M4 | |

## Preserved, never changed by the app

Crosspoint levels (all 0 dB for these routes), routes to O7–O12, other inputs routed to O5/O6 (M5, M6), processing blocks B–H, faders, expansion and telco routes, filters, compressors, delays, presets and macros.
