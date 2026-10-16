# Hardware findings

Everything here was observed on the actual device, in date order. Later sections record writes made through the app with the user's authorization; each was confirmed by readback and, where it was a test, restored. Current mapping: [MAPPING.md](MAPPING.md).

## Initial read-only inspection (Codex)

Captured 2026-10-16 at 21:17 Europe/Brussels. User explicitly authorized read-only inspection, supplied the address, and confirmed factory-default login. No setting writes were sent. Telnet login itself is an access event; no audio configuration was changed by these queries.

## Confirmed on device

- Host: 192.168.1.175, TCP 23.
- Type/address: D0; `VER` and `DID` replies confirmed ID 0.
- Firmware reply: 4.4.0.31 (also displayed in the banner).
- Login prompts: `user:` / `pass:`; authenticated prompt `OK> `. CR-terminated queries worked. Telnet negotiation handling was present in the one-off reader; complete option behavior was not validated.
- A credential-free capture of all 194 query/reply pairs is in `READ_ONLY_SNAPSHOT.json`.

## Output snapshot

Device labels are configuration labels, not proof of physical wiring. All outputs below reported mute 0 (unmuted); this does not prove audible signal.

| Output (O) | Device label | Gain dB | Mute |
|---|---|---:|---|
| 1 | WC | -35.00 | 0 |
| 2 | 2de Kelder | -25.00 | 0 |
| 3 | Waskot | -30.00 | 0 |
| 4 | Output 4 | -47.50 | 0 |
| 5 | Output 5 | -38.50 | 0 |
| 6 | Output 6 | 0.00 | 0 |
| 7 | Output 7 | 0.00 | 0 |
| 8 | Output 8 | 0.00 | 0 |
| 9 | Output 9 | 0.00 | 0 |
| 10 | Output 10 | 0.00 | 0 |
| 11 | Output 11 | 0.00 | 0 |
| 12 | Output 12 | 0.00 | 0 |

## Physical input labels

| Input | Device label |
|---|---|
| M1 | Arylic L |
| M2 | Arylic R |
| M3 | Birds |
| M4 | Alexa |
| M5 | Input 5 |
| M6 | Input 6 |
| M7 | Input 7 |
| M8 | Input 8 |
| L9 | input 9 |
| L10 | Input 10 |
| L11 | Input 11 |
| L12 | Input 12 |

## Nonzero physical-input routes

Mode 1 = line crosspoint on; 3 = mic non-gated; 4 = mic gated. Nonzero routes below are device-confirmed, but their intended purpose is unknown. Do not erase apparent default/unused routes.

| Output | Active physical sources (mode) |
|---|---|
| O1 | M3 (3) |
| O2 | None in inspected physical-input subset |
| O3 | None in inspected physical-input subset |
| O4 | None in inspected physical-input subset |
| O5 | M5 (3) |
| O6 | M6 (3) |
| O7 | M7 (3) |
| O8 | M8 (3) |
| O9 | M5 (4), M6 (4), M7 (4), M8 (4), L10 (1), L11 (1), L12 (1) |
| O10 | M5 (4), M6 (4), M7 (4), M8 (4), L11 (1), L12 (1) |
| O11 | M5 (4), M6 (4), M7 (4), M8 (4), L10 (1), L12 (1) |
| O12 | L10 (1), L11 (1), L12 (1) |

The useful first-room candidate is O1, labeled WC, currently -35 dB and unmuted, with M3 labeled Birds routed non-gated (3). This is evidence of the configured association, not a listening/wiring test. O2/O3 have no active physical-input routes in the inspected subset; processing or expansion routes may still feed them. Arylic L/R labels suggest pairing M1/M2, but that pairing and their device roles need user confirmation.

## Scope limits and next step

This is NOT a full DSP backup or atomic snapshot. It excludes integrated-amplifier O13; processing/expansion/fader/telco routes; crosspoint levels; existing MIN/MAX gain settings; filters/AEC/AGC/limiters; presets/macros; and physical amplifier wiring. Queries ran sequentially, so external changes during capture cannot be ruled out.

## Re-read through the app (2026-10-16, second session)

The live read-only app re-read firmware and all 12 outputs; labels, gain, mute and physical-input routes matched the earlier snapshot exactly. Still read-only; no device settings were changed.

## O1 (WC) extra read-only checks (2026-10-16, hardware-confirmed)

- Device gain limits for O1: MINMAX -65.00 / 20.00 dB (MIN -65.00, MAX 20.00). No tighter device limit exists; any cap must come from the app.
- Crosspoint level M3 -> O1: 0.00 dB (absolute).
- Processing block A -> O1: on (1). Processing B–H -> O1: 0. Faders 1–3 -> O1: 0. Fader 4, expansion and telco routes were not read.
- Replies on this session lagged one prompt behind when matched only on `OK>`; always match the echoed query prefix (the app does).

## First write test on O1 (WC) — RUN 2026-10-16 (hardware-confirmed)

User-approved, exact commands only: `#D0 GAIN 1 O -37.0 A` (read back -37.00 A), `#D0 GAIN 1 O -35.0 A` (read back -35.00 A), `#D0 MUTE 1 O 1` (read back 1), `#D0 MUTE 1 O 0` (read back 0). Final state equals the original: -35.00 dB, unmuted. Absolute writes with `A`, followed by independent readback after ~500 ms, work. Audible effect was not verified.

## Sources and routing for rooms (2026-10-16, user screenshot + hardware read)

- User-supplied Converge Console screenshot (Unit tab): processing block A is labelled "Arylic" (RX and TX); M1/M2 = Arylic L/R at +10 dB input gain, M3 Birds -5 dB, M4 Alexa 0 dB, L9 +3 dB; O1-O3 labelled WC/2de Kelder/Waskot at -35/-25/-30 dB; O13 "Speaker". User states Arylic L/R are combined by a device, and every room must be able to play every input, with sources mixing.
- Hardware-read crosspoints to O1/O2/O3: Arylic = processing A -> all three on (mode 1); Birds M3 -> O1 only (mode 3); Alexa M4 -> none. M1/M2 not routed directly. All these crosspoints at 0.00 dB.
- Hardware write test through the app (Laundry/O3): `MTRX 4 M 3 O 3` (Alexa on) read back 3; `MTRX 4 M 3 O 0` read back 0. Restored; no other routes touched. Audibility not verified.

## Per-room source level (crosspoint level), 2026-10-16 — later reverted

Hardware-confirmed via the app: `MTRXLVL 4 M 3 O -6.0 A` (Alexa -> O3) read back -6.00 A; restored with `... 0.0 A`, read back 0.00 A. Absolute (`A`) writes work. All crosspoint levels to O1-O3 for Arylic (P A), Birds and Alexa were 0.00 dB beforehand. Device range is -60..+12 dB; the app offers -60..0 only.

## Input gain per source (2026-10-16) — replaces the per-room level idea

User decision: per-room crosspoint level sliders were REVERTED (code removed; nothing was left changed on the device: all crosspoint levels to O1-O3 are 0.00 dB). Instead, input gain per source is controlled with `GAIN <ch> M <value> A`.
Hardware-read: M1 +10.00, M2 +10.00 (Arylic L/R), M3 -5.00 (Birds), M4 0.00 (Alexa), processing A 0.00; all with device limits -65..+20 dB and mute 0.
Hardware-confirmed write via the app: Alexa (M4) -3.0 read back -3.00 A; restored to 0.0, read back 0.00 A. Arylic is written as M1+M2 together (a design choice; both are +10 dB). Writing Arylic or Birds not yet tested on hardware. App input-gain range -40..+15 dB.

## AGC (automatic gain control) on mic inputs, read-only (2026-10-16, hardware-confirmed)

Commands (serial guide PDF 13-14 / printed 227-228): `AGC <ch> <grp> [0|1|2]`, `AGCSET <ch> <grp> [Threshold Target Attack Gain]` (threshold -50..0 dB, target -30..20 dB, response time 0.10..10.00 s, max gain 0.00..18.00 dB; field meaning taken from the guide's jumbled table extraction, so the order is manufacturer-documented but not independently verified).

| Input | AGC | Threshold | Target | Response time | Max gain |
|---|---|---|---|---|---|
| M1 Arylic L | on | -25 | 0 | 2.03 s | 18.00 dB |
| M2 Arylic R | on | -25 | 0 | 2.00 s | 18.00 dB |
| M3 Birds | off | -25 | 0 | 2.00 s | 6.00 dB |
| M4 Alexa | on | -25 | 0 | 2.00 s | 18.00 dB |

Implication: with AGC on, the unit automatically raises quiet signals by up to the max gain, so the effective loudness of Arylic and Alexa is input gain plus automatic gain. Nothing was written. The app does not show or change AGC yet.

Hardware-confirmed AGC write via the app (2026-10-16): Birds (M3) `AGC 3 M 1` read back 1, then `AGC 3 M 0` read back 0 (original state restored). AGC settings (threshold/target/response/max gain) are shown read-only and are never written. Arylic (M1+M2 together) and Alexa AGC writes not yet tested.

## AGC settings write (2026-10-16, hardware-confirmed on M3 Birds, AGC off)

`AGCSET <ch> M <threshold> <target> <response> <max gain>` takes all four values at once (threshold/target whole dB, response and max gain with two decimals). Sent via the app: identity write (-25 0 2.00 6.00) read back unchanged, which also confirms the documented field order; max gain 5 read back 5.00; restored to 6.00, read back 6.00. Birds ended in its original state (AGC off, -25 / 0 / 2.00 s / 6.00). Not yet tested: Arylic (M1+M2 together; M1's response currently 2.03 s vs M2 2.00 s, saving will make them identical) and Alexa.

## Processing review of the sources, read-only (2026-10-16, hardware-confirmed)

M1-M4 (Arylic L/R, Birds, Alexa): AEC 0 (off), noise cancellation NCSEL 0 (off, depth 6), phantom power PP 0 (off), coarse gain MLINE 0 (0 dB), gating mode GMODE 3 (manual off; routes use non-gated mode 3 anyway), NLP 1 (soft; only relevant with AEC), input filters FILTSEL nodes 1-4 all off. AGC: see above (on for Arylic and Alexa).
Processing block A (Arylic sum): filter nodes 1-2 on, 3-15 off (`FILTER A P n` query returned 0; filter type/meaning not interpreted), compressor COMPSEL 0 (off), delay DELAYSEL 0 (off).
`ADPRESENT` returned `7 0 0 0 0`: per the guide the first field is an input bitmap, so 7 = inputs 1-3 have signal (Arylic L/R and Birds), matching the "Pres" indicators in the user's screenshot. The meaning of the remaining fields (documented as outputs and processors) did not match expectations (Birds routed to O1 but outputs field 0), so only the input part is considered understood.
Output filters: `FILTSEL n O` is an argument error; the guide lists filters only for M and P groups. Safety mute SFTYMUTE 0. Nothing written.
