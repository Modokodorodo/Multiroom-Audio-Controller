# Opportunities and recommendations

Backlog of ideas for the Multiroom Audio Controller and the ClearOne CONVERGE Pro 880T. Written 2026-10-16 after a read-only review of the device. Device facts referenced here are in `docs/HARDWARE.md`; protocol details in `docs/PROTOCOL.md`.

Status legend: **Done**, **Next**, **Idea**, **Later phase** (from the original brief), **Action for user**.

## Actions for the user (outside the app)

| # | Item | Why | Status |
|---|---|---|---|
| U1 | Save a full site file / backup from the ClearOne Console software | The app's snapshots are partial (labels, gains, a subset of routing). There is no full DSP backup, and real changes are now being made from the app. | Action for user |
| U2 | Change the factory-default Console password | The default login is published in the manual. | Declined by the user (2026-10-16); do not raise again. Mitigation: keep the ClearOne on the local network only (U3). |
| U3 | Keep the ClearOne off the internet | Telnet is unencrypted plain text, including the login. | Action for user (currently true) |
| U4 | Try AGC off on Arylic | AGC is on with up to +18 dB automatic boost, on top of +10 dB input gain. AGC is designed for speech; on music it can lift quiet passages and make dynamics "pump". Compare by ear; if music becomes too quiet, raise the Arylic input gain instead. Keeping AGC on for Alexa (mostly voice) is reasonable. | Action for user (switch is in the app) |

## Device review findings (read-only, hardware-confirmed)

- Already correct for music sources (M1-M4): echo cancellation off, noise cancellation off, phantom power off, coarse mic/line gain 0 dB, input filters off.
- Arylic L/R are summed in processing block A: filters 1-2 on, compressor off, delay off.
- Audio presence (`ADPRESENT`) reports which inputs carry signal. This is the basis for the "Playing" indicator and for future idle shutdown.
- Outputs 4-12 are expansion (per user) and still carry routes from M5-M8 and L10-L12; left untouched.
- Integrated amplifier output O13 ("Speaker") has not been inspected.

## App features

| # | Feature | Notes | Status |
|---|---|---|---|
| A1 | "Playing" indicator per room and per source | Uses `ADPRESENT` (one query every 3 s). A room shows Playing when a source is switched on there, has signal at its input, and the room is not muted. Inferred, not measured at the output. | **Done** (2026-10-16) |
| A2 | Double-click launcher for the Mac | Start the service without Terminal. Store the device password in the macOS Keychain or a local file outside the project, not on the command line. Optionally start at login. | Next |
| A3 | Scenes | One click sets several rooms (sources, volume, mute), for example "Morning: Birds in Toilet at -35 dB" or "Night: all muted". Stored in the app, not as ClearOne presets, so nothing hidden changes on the device. | **Done** (2026-10-17) in the Home Assistant integration: Scenes tab, quick buttons, scene entities (usable from Alexa). Not in the Mac app. |
| A4 | Schedules | For example Birds only during daytime. App-side, or the ClearOne Event Scheduler. Easier to manage from Home Assistant. | Idea |
| A5 | Level meters per room | Live signal level via `LVL`. Needs faster polling; only worth it if wanted. | Idea |
| A6 | Show the integrated amplifier output O13 | Read-only first, to see whether it is used. | Idea |
| A7 | Friendlier offline state | Done: status pill, warning banner, automatic reconnect with back-off. | **Done** |

## Later phases (from the original brief)

| # | Item | Prerequisite | Status |
|---|---|---|---|
| L1 | Home Assistant integration | Custom integration with sidebar panel and room entities. | **Done** (2026-10-16, pending install by user) |
| L1b | Music Assistant virtual speaker per room | media_player per room that streams via the Arylic and routes it to the room. One Arylic = one stream at a time. | **Done**; playback confirmed by the user with the real Arylic and Music Assistant (2026-10-17) |
| L2 | Move the service to the home server | Covered by L1: the integration runs inside Home Assistant. | **Done** |
| L3 | KinCony amplifier power control | KinCony model and Home Assistant entities are unknown. | Later phase |
| L4 | Idle shutdown | Combine audio presence (A1) with presence detection: for example "no signal for 30 minutes and nobody home, switch the amplifier off". Needs L1 and L3. | Later phase |
