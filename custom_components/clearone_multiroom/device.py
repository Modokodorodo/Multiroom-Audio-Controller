"""Room/source model and connection lifecycle for the ClearOne. No Home Assistant imports.

Every change is validated, sent once through the whitelisted client, and confirmed by an
independent readback. Nothing is retried or replayed after a reconnect.
"""
from __future__ import annotations

import asyncio
import logging
import re
import uuid
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from .clearone import ClearOneError, ClearOneTelnet
from .const import INPUT_GAIN_RANGE, ROOMS, SOURCES

_LOGGER = logging.getLogger(__name__)
_GAIN = re.compile(r"(-?[0-9]+(?:\.[0-9]+)?) A")
_AGCSET = re.compile(r"(-?[0-9]+(?:\.[0-9]+)?) (-?[0-9]+(?:\.[0-9]+)?) ([0-9]+(?:\.[0-9]+)?) ([0-9]+(?:\.[0-9]+)?)")

FULL_REFRESH_S = 15
PRESENCE_S = 3
HARD_MAX_CAP_DB = 0.0


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class MultiroomDevice:
    """Owns the single ClearOne session used by the panel and all entities."""

    def __init__(self, host: str, port: int, user: str, password: str, device_id: str = "0",
                 caps: dict[str, float] | None = None, scenes: list[dict[str, Any]] | None = None,
                 timeout: float = 3.0,
                 client_factory: Callable[[], ClearOneTelnet] | None = None) -> None:
        self.host, self.port, self.user, self.password, self.id = host, port, user, password, device_id
        self.timeout = timeout
        self.rooms = [dict(r, maxDb=(caps or {}).get(r["id"], r["maxDb"])) for r in ROOMS]
        self.sources = [dict(s) for s in SOURCES]
        self._client_factory = client_factory or (lambda: ClearOneTelnet(host, port, timeout))
        self.client: ClearOneTelnet | None = None
        self.status = "disconnected"
        self.error: str | None = None
        self.firmware: str | None = None
        self.updated_at: str | None = None
        self.next_retry_at: str | None = None
        self.presence_bits: int | None = None
        self.room_state: dict[str, dict[str, Any]] = {}
        self.input_state: dict[str, dict[str, Any]] = {}
        self._listeners: list[Callable[[], None]] = []
        self._op = asyncio.Lock()  # a refresh and a change never interleave
        self.on_caps_changed: Callable[[dict[str, float]], None] | None = None
        self.scenes: list[dict[str, Any]] = [dict(sc) for sc in (scenes or [])]
        self.on_scenes_changed: Callable[[list[dict[str, Any]]], None] | None = None

    # ---- listeners -------------------------------------------------------------------------
    def add_listener(self, cb: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(cb)
        return lambda: self._listeners.remove(cb) if cb in self._listeners else None

    def _notify(self) -> None:
        for cb in list(self._listeners):
            try:
                cb()
            except Exception:  # a broken listener must not stop the device
                _LOGGER.exception("Listener failed")

    # ---- lifecycle ---------------------------------------------------------------------------
    async def run(self) -> None:
        """Connect, poll, and reconnect with back-off (5 s doubling to 30 s) until cancelled."""
        delay = 5
        loop = asyncio.get_running_loop()
        while True:
            try:
                await self.connect()
                delay = 5
                last_full = loop.time()
                while True:
                    await asyncio.sleep(PRESENCE_S)
                    if loop.time() - last_full >= FULL_REFRESH_S:
                        await self.refresh()
                        last_full = loop.time()
                    else:
                        await self.poll_presence()
            except asyncio.CancelledError:
                self.close()
                raise
            except Exception as err:  # noqa: BLE001 - any failure leads to a clean reconnect
                self._fail(err)
                self.next_retry_at = datetime.fromtimestamp(
                    datetime.now(timezone.utc).timestamp() + delay, timezone.utc).isoformat()
                self._notify()
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30)

    async def connect(self) -> None:
        self.close()
        self.status = "connecting"
        self._notify()
        self.client = self._client_factory()
        await self.client.connect(self.user, self.password)
        await self.refresh()

    def close(self) -> None:
        if self.client is not None:
            self.client.close()
        self.client = None
        if self.status == "ready":
            self.status = "disconnected"

    def _fail(self, err: Exception) -> None:
        _LOGGER.warning("ClearOne %s: %s", self.host, err)
        if self.client is not None:
            self.client.close()
        self.client = None
        self.status, self.error = "error", str(err) or err.__class__.__name__

    # ---- reads -------------------------------------------------------------------------------
    async def _q(self, cmd: str) -> str:
        if self.client is None:
            raise ClearOneError("Not connected")
        return await self.client.query(f"#D{self.id} {cmd}")

    async def _presence(self) -> None:
        bits = int((await self._q("ADPRESENT")).split(" ")[0])
        if not 0 <= bits <= 0xFFFF:
            raise ClearOneError("Unparseable audio presence")
        self.presence_bits = bits

    async def poll_presence(self) -> None:
        if self._op.locked():
            return
        async with self._op:
            before = self.presence_bits
            await self._presence()
        if self.presence_bits != before:
            self._notify()

    async def refresh(self) -> None:
        """Read everything the integration shows (about 30 queries; VER doubles as heartbeat)."""
        async with self._op:
            self.firmware = await self._q("VER")
            await self._presence()
            rooms: dict[str, dict[str, Any]] = {}
            for room in self.rooms:
                ch = room["output"]
                gain = _GAIN.fullmatch(await self._q(f"GAIN {ch} O"))
                mute = await self._q(f"MUTE {ch} O")
                if not gain or mute not in ("0", "1"):
                    raise ClearOneError(f"Unparseable gain/mute for output {ch}")
                routes = {}
                for src in self.sources:
                    m = await self._q(f"MTRX {src['channel']} {src['group']} {ch} O")
                    if not re.fullmatch(r"[0-6]", m):
                        raise ClearOneError("Unparseable matrix reply")
                    routes[src["id"]] = int(m)
                rooms[room["id"]] = {"label": await self._q(f"LABEL {ch} O 0"), "gainDb": float(gain[1]),
                                     "muted": mute == "1", "routes": routes}
            inputs: dict[str, dict[str, Any]] = {}
            for src in self.sources:
                channels = []
                for inp in src["inputs"]:
                    c, g = inp["channel"], inp["group"]
                    gain = _GAIN.fullmatch(await self._q(f"GAIN {c} {g}"))
                    agc = await self._q(f"AGC {c} {g}")
                    st = _AGCSET.fullmatch(await self._q(f"AGCSET {c} {g}"))
                    if not gain or agc not in ("0", "1") or not st:
                        raise ClearOneError(f"Unparseable input settings for {g}{c}")
                    channels.append({"channel": c, "group": g, "gainDb": float(gain[1]), "agc": agc == "1",
                                     "agcSettings": {"thresholdDb": float(st[1]), "targetDb": float(st[2]),
                                                     "responseS": float(st[3]), "maxGainDb": float(st[4])}})
                inputs[src["id"]] = {"channels": channels}
            self.room_state, self.input_state = rooms, inputs
            self.status, self.error, self.next_retry_at, self.updated_at = "ready", None, None, _now()
        self._notify()

    # ---- derived state -------------------------------------------------------------------------
    def present(self, source_id: str) -> bool | None:
        if self.presence_bits is None or self.status != "ready":
            return None
        src = next((s for s in self.sources if s["id"] == source_id), None)
        return bool(src) and any((self.presence_bits >> (i["channel"] - 1)) & 1 for i in src["inputs"])

    def room(self, room_id: str) -> dict[str, Any]:
        room = next((r for r in self.rooms if r["id"] == room_id), None)
        if room is None:
            raise ClearOneError("Unknown room")
        st = self.room_state.get(room_id)
        mix = [{"id": s["id"], "name": s["name"], "on": bool(st and st["routes"][s["id"]]),
                "present": self.present(s["id"])} for s in self.sources]
        muted = st["muted"] if st else None
        return {"id": room_id, "name": room["name"], "output": room["output"], "minDb": room["minDb"],
                "maxDb": room["maxDb"], "deviceLabel": st and st["label"], "gainDb": st and st["gainDb"],
                "muted": muted, "mix": mix,
                "playing": [] if muted or not st else [m["name"] for m in mix if m["on"] and m["present"]]}

    def input(self, source_id: str) -> dict[str, Any]:
        src = next((s for s in self.sources if s["id"] == source_id), None)
        if src is None:
            raise ClearOneError("Unknown source")
        chans = (self.input_state.get(source_id) or {}).get("channels", [])
        same = lambda k: chans[0][k] if chans and all(c[k] == chans[0][k] for c in chans) else None  # noqa: E731
        return {"id": source_id, "name": src["name"], "channels": chans, "gainDb": same("gainDb"),
                "agc": same("agc"), "present": self.present(source_id)}

    def state(self) -> dict[str, Any]:
        return {"status": self.status, "error": self.error, "updatedAt": self.updated_at,
                "nextRetryAt": self.next_retry_at,
                "device": {"host": self.host, "id": self.id, "firmware": self.firmware},
                "inputRange": dict(INPUT_GAIN_RANGE), "rooms": [self.room(r["id"]) for r in self.rooms],
                "inputs": [self.input(s["id"]) for s in self.sources],
                "scenes": [self.scene_summary(sc) for sc in self.scenes]}

    # ---- changes ---------------------------------------------------------------------------------
    async def _change(self, command: str, check_query: str, expect: Callable[[str], bool]) -> None:
        if self.status != "ready" or self.client is None:
            raise ClearOneError("Device is not ready; retry shortly")
        async with self._op:
            await self.client.write(f"#D{self.id} {command}")
            if not expect(await self._q(check_query)):
                raise ClearOneError("Readback did not confirm requested value")

    def _room_cfg(self, room_id: str) -> dict[str, Any]:
        room = next((r for r in self.rooms if r["id"] == room_id), None)
        if room is None:
            raise ClearOneError("Unknown room")
        return room

    def _source_cfg(self, source_id: str) -> dict[str, Any]:
        src = next((s for s in self.sources if s["id"] == source_id), None)
        if src is None:
            raise ClearOneError("Unknown source")
        return src

    async def set_room_gain(self, room_id: str, gain_db: float, refresh: bool = True) -> None:
        room = self._room_cfg(room_id)
        if isinstance(gain_db, bool) or not isinstance(gain_db, (int, float)) or not room["minDb"] <= gain_db <= room["maxDb"]:
            raise ClearOneError(f"Volume must be {room['minDb']} to {room['maxDb']} dB")
        text = f"{round(gain_db * 2) / 2:.1f}"
        ch = room["output"]
        try:
            await self._change(f"GAIN {ch} O {text} A", f"GAIN {ch} O",
                               lambda r: bool(_GAIN.fullmatch(r)) and float(_GAIN.fullmatch(r)[1]) == float(text))
        finally:
            if refresh:
                await self._safe_refresh()

    async def set_room_mute(self, room_id: str, muted: bool, refresh: bool = True) -> None:
        room = self._room_cfg(room_id)
        if not isinstance(muted, bool):
            raise ClearOneError("Mute must be on or off")
        ch, v = room["output"], str(int(muted))
        try:
            await self._change(f"MUTE {ch} O {v}", f"MUTE {ch} O", lambda r: r == v)
        finally:
            if refresh:
                await self._safe_refresh()

    async def set_room_source(self, room_id: str, source_id: str, on: bool, refresh: bool = True) -> None:
        room, src = self._room_cfg(room_id), self._source_cfg(source_id)
        if not isinstance(on, bool):
            raise ClearOneError("Source on/off must be on or off")
        v = str(src["onMode"] if on else 0)  # only this crosspoint changes; its level is untouched
        q = f"MTRX {src['channel']} {src['group']} {room['output']} O"
        try:
            await self._change(f"{q} {v}", q, lambda r: r == v)
        finally:
            if refresh:
                await self._safe_refresh()

    async def set_input_gain(self, source_id: str, gain_db: float) -> None:
        src = self._source_cfg(source_id)
        lo, hi = INPUT_GAIN_RANGE["min"], INPUT_GAIN_RANGE["max"]
        if isinstance(gain_db, bool) or not isinstance(gain_db, (int, float)) or not lo <= gain_db <= hi:
            raise ClearOneError(f"Input gain must be {lo} to {hi} dB")
        text = f"{round(gain_db * 2) / 2:.1f}"
        try:
            for i in src["inputs"]:  # Arylic: M1 and M2 together
                q = f"GAIN {i['channel']} {i['group']}"
                await self._change(f"{q} {text} A", q,
                                   lambda r: bool(_GAIN.fullmatch(r)) and float(_GAIN.fullmatch(r)[1]) == float(text))
        finally:
            await self._safe_refresh()

    async def set_input_agc(self, source_id: str, on: bool) -> None:
        src = self._source_cfg(source_id)
        if not isinstance(on, bool):
            raise ClearOneError("AGC must be on or off")
        v = str(int(on))
        try:
            for i in src["inputs"]:
                q = f"AGC {i['channel']} {i['group']}"
                await self._change(f"{q} {v}", q, lambda r: r == v)
        finally:
            await self._safe_refresh()

    async def set_input_agc_settings(self, source_id: str, settings: dict[str, Any]) -> None:
        src = self._source_cfg(source_id)
        s = settings if isinstance(settings, dict) else {}

        def num(key: str, lo: float, hi: float, label: str, unit: str, integer: bool = False) -> float:
            x = s.get(key)
            if isinstance(x, bool) or not isinstance(x, (int, float)) or not lo <= x <= hi or (integer and x != int(x)):
                kind = "a whole number from " if integer else ""
                raise ClearOneError(f"{label} must be {kind}{lo:g} to {hi:g} {unit}")
            return x

        thr = int(num("thresholdDb", -50, 0, "Threshold", "dB", True))
        tgt = int(num("targetDb", -30, 20, "Target", "dB", True))
        resp = f"{round(num('responseS', 0.1, 10, 'Response time', 's') * 100) / 100:.2f}"
        mx = f"{round(num('maxGainDb', 0, 18, 'Maximum gain', 'dB') * 100) / 100:.2f}"
        want = [thr, tgt, float(resp), float(mx)]
        try:
            for i in src["inputs"]:
                q = f"AGCSET {i['channel']} {i['group']}"
                await self._change(f"{q} {thr} {tgt} {resp} {mx}", q,
                                   lambda r: [float(x) for x in r.split(" ")] == want)
        finally:
            await self._safe_refresh()

    def set_cap(self, room_id: str, max_db: float) -> None:
        """App-side cap only: never writes to the device or changes the current volume."""
        room = self._room_cfg(room_id)
        lo = room["minDb"] + 5
        if isinstance(max_db, bool) or not isinstance(max_db, (int, float)) or not lo <= max_db <= HARD_MAX_CAP_DB:
            raise ClearOneError(f"Cap must be between {lo:g} and {HARD_MAX_CAP_DB:g} dB")
        room["maxDb"] = round(max_db * 2) / 2
        if self.on_caps_changed:
            self.on_caps_changed({r["id"]: r["maxDb"] for r in self.rooms})
        self._notify()

    async def _safe_refresh(self) -> None:
        """Show the device's real state after any change attempt; connection errors go to the run loop."""
        try:
            await self.refresh()
        except ClearOneError as err:
            _LOGGER.debug("Refresh after change failed: %s", err)

    # ---- scenes ------------------------------------------------------------------------------------
    # A scene stores, per included room: mute, volume and which sources are on. Stored in the app
    # (config entry options), never as ClearOne presets.
    MAX_SCENES = 30

    def scene_summary(self, scene: dict[str, Any]) -> dict[str, Any]:
        names = {r["id"]: r["name"] for r in self.rooms}
        src = {s["id"]: s["name"] for s in self.sources}
        rooms = []
        for room_id, t in scene["rooms"].items():
            if room_id in names:
                on = [src[k] for k, v in t["sources"].items() if v and k in src]
                rooms.append({"id": room_id, "name": names[room_id], "gainDb": t["gainDb"], "muted": t["muted"], "sources": on})
        return {"id": scene["id"], "name": scene["name"], "rooms": rooms}

    def _snapshot_rooms(self, room_ids: list[str]) -> dict[str, Any]:
        if not room_ids:
            raise ClearOneError("Choose at least one room")
        rooms = {}
        for room_id in room_ids:
            r = self.room(room_id)  # raises for unknown rooms
            if r["gainDb"] is None or r["muted"] is None:
                raise ClearOneError("Room state is not known yet; wait until the ClearOne is connected")
            rooms[room_id] = {"gainDb": r["gainDb"], "muted": r["muted"], "sources": {m["id"]: m["on"] for m in r["mix"]}}
        return rooms

    @staticmethod
    def _clean_name(name: Any) -> str:
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 40:
            raise ClearOneError("Scene name must be 1 to 40 characters")
        return name.strip()

    def _scene(self, scene_id: str) -> dict[str, Any]:
        sc = next((x for x in self.scenes if x["id"] == scene_id), None)
        if sc is None:
            raise ClearOneError("Unknown scene")
        return sc

    def _scenes_changed(self) -> None:
        if self.on_scenes_changed:
            self.on_scenes_changed([dict(x) for x in self.scenes])
        self._notify()

    def save_scene(self, name: str, room_ids: list[str]) -> str:
        """New scene from the current state of the given rooms."""
        name = self._clean_name(name)
        if any(x["name"].lower() == name.lower() for x in self.scenes):
            raise ClearOneError("A scene with this name already exists")
        if len(self.scenes) >= self.MAX_SCENES:
            raise ClearOneError(f"At most {self.MAX_SCENES} scenes")
        scene = {"id": uuid.uuid4().hex[:8], "name": name, "rooms": self._snapshot_rooms(room_ids)}
        self.scenes.append(scene)
        self._scenes_changed()
        return scene["id"]

    def update_scene(self, scene_id: str, name: str | None = None, capture: bool = False) -> None:
        """Rename and/or replace the stored values with the rooms' current state."""
        sc = self._scene(scene_id)
        if name is not None:
            name = self._clean_name(name)
            if any(x["name"].lower() == name.lower() and x["id"] != scene_id for x in self.scenes):
                raise ClearOneError("A scene with this name already exists")
        rooms = self._snapshot_rooms(list(sc["rooms"])) if capture else sc["rooms"]
        if name is not None:
            sc["name"] = name
        sc["rooms"] = rooms
        self._scenes_changed()

    def delete_scene(self, scene_id: str) -> None:
        self._scene(scene_id)
        self.scenes = [x for x in self.scenes if x["id"] != scene_id]
        self._scenes_changed()

    async def apply_scene(self, scene_id: str) -> None:
        """Apply room by room: mute first, then sources, then volume (clamped to today's cap), unmute last.
        Only values that differ are written; one refresh at the end."""
        sc = self._scene(scene_id)
        if self.status != "ready":
            raise ClearOneError("Device is not ready; retry shortly")
        errors = []
        try:
            for room_id, t in sc["rooms"].items():
                room = next((r for r in self.rooms if r["id"] == room_id), None)
                if room is None:
                    continue
                try:
                    cur = self.room(room_id)
                    if t["muted"] and cur["muted"] is not True:
                        await self.set_room_mute(room_id, True, refresh=False)
                    for m in cur["mix"]:
                        want = t["sources"].get(m["id"])
                        if want is not None and want != m["on"]:
                            await self.set_room_source(room_id, m["id"], want, refresh=False)
                    gain = min(max(t["gainDb"], room["minDb"]), room["maxDb"])
                    if gain != cur["gainDb"]:
                        await self.set_room_gain(room_id, gain, refresh=False)
                    if not t["muted"] and cur["muted"] is not False:
                        await self.set_room_mute(room_id, False, refresh=False)
                except ClearOneError as err:
                    errors.append(f"{room['name']}: {err}")
        finally:
            await self._safe_refresh()
        if errors:
            raise ClearOneError("; ".join(errors))
