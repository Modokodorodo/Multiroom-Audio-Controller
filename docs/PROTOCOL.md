# Protocol reference

Sources are the supplied manufacturer PDFs. Page references below use one-based PDF page, then printed page. Extracted tables can interleave columns: the group table was also visually inspected. A typo in the guide's query example confuses channel/ID; use grammar and parameter tables rather than that sentence.

## Manufacturer verified

| Topic | Source | Verified behavior |
|---|---|---|
| 880T addressing | Serial guide PDF 2 / 218; main manual PDF 255 / 250 | Type D; IDs 0–B. Actual ID must be discovered, not assumed. No wildcard addressing in this project. |
| Grammar | Serial guide PDF 2–3 / 218–219 | `#D<ID> COMMAND parameters` followed by CR (`\r`); case-insensitive commands, uppercase returns; omitted optional value queries where documented. |
| 880T groups | Serial guide PDF 3 / 219 | M mic inputs 1–8; L line inputs 9–12; I inputs 1–12; O outputs 1–13 (13 is the integrated power amp); P processing A–H; F faders 1–4; E expansion audio O–Z, I–N; T/R telco 1. Prototype deliberately supports external outputs 1–12 only. |
| Gain | Serial guide PDF 27 / 243; main manual PDF 290 / 285 | `GAIN <channel> <group> [value] [A/R]`; query omits value. Omitted A/R means relative! Sliders must explicitly use A. Entry range -99.90…99.90; internal gain range -65…+20 dB. Respect existing MIN/MAX as well as stricter room caps. |
| Gain limits | Serial guide PDF 34 / 250 and PDF 36 / 252 | MAX, MIN and MINMAX can query existing limits. Never set device MIN/MAX simply to enforce app caps. |
| Mute | Serial guide PDF 38 / 254 | `MUTE <channel> <group> [value]`; 0 off, 1 on, 2 toggle. Use explicit 0/1 writes, never toggle retries. |
| Routing | Serial guide PDF 37 / 253 | `MTRX <src ch> <src group> <dest ch> <dest group> [value]`; 0 off; 1 on and 2 toggle are invalid for mic sources; mic modes 3 non-gated, 4 gated, 5 pre-AEC. 6 means prohibited; do not write it. Query first. |
| Crosspoint gain | Serial guide PDF 38 / 254 | `MTRXLVL ... [value] [A/R]`; internal attenuation -60…+12 dB; omission of A/R is relative. Preserve existing levels. |
| Levels | Serial guide PDF 32–33 / 248–249; meter types PDF 4 / 220 | LVL is read-only; position depends on channel type. LVLREPORT changes per-channel reporting; LVLREPORTEN changes reporting globally (2 clears list). Neither reporting-setting command belongs in read-only inspection. |
| Telnet | Main manual PDF 339 / 334 | TCP 23; login uses Console credentials; 15-minute idle receive timeout; manufacturer recommends VER heartbeat. No evidence here of a general HTTP control API. |
| Identity | Main manual PDF 282 / 277 and PDF 320 / 315 | DID reports device ID; VER and UID are read-only. Query with no value. |
| Labels | Main manual PDF 293 / 288 | `LABEL <channel> <group> <In/Out> [value]`; non-expansion groups use 0 for In/Out; omit label to query. |

## Observed on actual hardware (2026-10-16)

User authorized read-only inspection, supplied 192.168.1.175, and confirmed factory-default login. Device ID was initially unknown; first candidate `#D0 VER` returned version 4.4.0.31 and `#D0 DID` returned 0. This establishes ID 0 rather than assuming it. Login prompts are `user:` then `pass:`; after login prompt is `OK> `. Responses may have the prompt directly before the addressed reply. Example actual readback: `OK> #D0 GAIN 1 O -35.00 A` followed by CRLF and `OK>`. Query framing with CR and login worked. No setting writes performed. See READ_ONLY_SNAPSHOT.json and HARDWARE.md for captured scope and limitations.

Factory credential values are intentionally absent from project documentation/code. The one-off inspection helper was removed after capture and is not a reusable live controller.

## Implementation (src/clearone-telnet.js, src/live-controller.js)

- Telnet options offered by the device are refused (DO → WONT, WILL → DONT); subnegotiation is skipped. None were observed in practice.
- Login: wait for `user:`, send user + CR; wait for `pass:`, send password + CR; wait for `Authenticated.` (not `OK>`, see below).
- One request at a time. A reply is accepted only when a received line (with leading `OK>` prompts removed) starts with the exact query text plus a space; an `OK>` prompt alone never completes a request. 3 s deadline per request; 16 KB buffer limit.
- Writes are sent once, then confirmed by an independent query. A mismatch puts the app in error state and triggers a fresh reconnect; nothing is retried or replayed.
- Heartbeat: the 15 s full refresh starts with `VER`, well within the 15-minute idle timeout. Audio presence is polled every 3 s.

## Commands used by the app

| Command | Use | Values written |
|---|---|---|
| `VER`, `DID`, `LABEL n O/M/L 0` | identity, names | read only |
| `GAIN n O [x.x A]` | room volume, outputs 1–3 | absolute, within room cap |
| `MUTE n O [0/1]` | room mute | explicit 0/1, never toggle (2) |
| `MTRX A P n O [0/1]` | Arylic (processing A) to room | 0/1 |
| `MTRX 3/4 M n O [0/3]` | Birds / Alexa to room | 0/3 (mic, non-gated); mic sources reject 1/2 |
| `GAIN n M [x.x A]` | input gain, M1–M4 | absolute, -40..+15 dB (app range) |
| `AGC n M [0/1]` | AGC on/off, M1–M4 | explicit 0/1 |
| `AGCSET n M [thr tgt resp gain]` | AGC settings, M1–M4 | thr -50..0, tgt -30..20 (integers), resp 0.10..10.00 s, gain 0..18 dB |
| `MTRX`, `ADPRESENT` | routing and audio presence reads | read only |

`ADPRESENT` reply observed as `7 0 0 0 0`; the first field is the input bitmap (input 1 = lsb), the remaining fields are not interpreted.

## Observed on actual hardware — login detail (2026-10-16)

Banner `* Converge *`, `Version 4.4.0.31`, then `user: ` / `pass: `. After valid credentials the device sends `Authenticated.`, `Text Mode Engaged`, `Level: Administrator`; no `OK>` yet. `OK> ` appears with the first command reply, e.g. `\r\nOK> #D0 VER 4.4.0.31\r\nOK> `. A full refresh of ~190 queries completes in about a second. LABEL replies echo the query (`#D0 LABEL 1 O 0 WC`), so prefix-matching on the exact query is a reliable reply check. No Telnet option negotiation was observed in this session (client refuses any offered option).
