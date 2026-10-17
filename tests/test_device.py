"""Tests for the Home Assistant integration's device layer, against a SIMULATED ClearOne.

Run: python3 -m unittest discover -s tests   (Python 3.11+; Home Assistant is not needed)
"""
from __future__ import annotations

import asyncio
import pathlib
import re
import sys
import types
import unittest

# Import the integration's modules without running its Home Assistant __init__.py.
PKG_DIR = pathlib.Path(__file__).resolve().parents[1] / "custom_components" / "clearone_multiroom"
pkg = types.ModuleType("cmr")
pkg.__path__ = [str(PKG_DIR)]
sys.modules["cmr"] = pkg
from cmr.clearone import ClearOneAuthError, ClearOneError, ClearOneTelnet  # noqa: E402
from cmr.device import MultiroomDevice  # noqa: E402


class FakeClearOne:
    """Minimal stateful 880T: login, Telnet option offer, fragmented replies, writes applied."""

    def __init__(self, apply_writes: bool = True, password: str = "p") -> None:
        self.apply_writes, self.password = apply_writes, password
        self.received: list[str] = []
        self.v = {"GAIN 1 O": "-35.00 A", "GAIN 2 O": "-25.00 A", "GAIN 3 O": "-30.00 A",
                  "MUTE 1 O": "0", "MUTE 2 O": "0", "MUTE 3 O": "0",
                  "GAIN 1 M": "10.00 A", "GAIN 2 M": "10.00 A", "GAIN 3 M": "-5.00 A", "GAIN 4 M": "0.00 A",
                  "VER": "4.4.0.31", "ADPRESENT": "5 0 0 0 0"}
        for n in (1, 2, 3, 4):
            self.v[f"AGC {n} M"] = "0" if n == 3 else "1"
            self.v[f"AGCSET {n} M"] = "-25 0 2.00 " + ("6.00" if n == 3 else "18.00")
        for o in (1, 2, 3):
            self.v[f"LABEL {o} O 0"] = ["WC", "2de Kelder", "Waskot"][o - 1]
            self.v[f"MTRX A P {o} O"] = "1"
            self.v[f"MTRX 3 M {o} O"] = "3" if o == 1 else "0"
            self.v[f"MTRX 4 M {o} O"] = "0"

    async def start(self) -> int:
        self.server = await asyncio.start_server(self.handle, "127.0.0.1", 0)
        return self.server.sockets[0].getsockname()[1]

    async def stop(self) -> None:
        self.server.close()
        await self.server.wait_closed()

    async def handle(self, reader, writer) -> None:
        writer.write(bytes([255, 253, 1]) + b"\r\n* Converge *\r\nuser: ")
        stage, buf = 0, b""
        try:
            while data := await reader.read(1024):
                buf += bytes(b for b in data if b not in (255, 252, 254))  # drop IAC replies
                while b"\r" in buf:
                    line, buf = buf.split(b"\r", 1)
                    line = line.decode().strip()
                    if not line:
                        continue
                    self.received.append(line)
                    if stage == 0:
                        stage = 1
                        writer.write(b"\r\npass: ")
                    elif stage == 1:
                        if line != self.password:
                            writer.write(b"\r\nLogin failed\r\nuser: ")
                            stage = 0
                            continue
                        stage = 2
                        writer.write(b"\r\n\r\nAuthenticated.\r\nText Mode Engaged\r\n")
                    else:
                        cmd = line[4:]
                        m = re.fullmatch(r"(GAIN [0-9]+ [OM]|MUTE [0-9]+ O|AGC [0-9]+ M|AGCSET [0-9]+ M|MTRX [0-9A-H]+ [MP] [0-9]+ O) (.+)", cmd)
                        if m and m[1] in self.v:
                            if self.apply_writes:
                                val = m[2]
                                if val.endswith(" A"):
                                    val = f"{float(val[:-2]):.2f} A"
                                if m[1].startswith("AGCSET"):
                                    t, g, r, x = val.split(" ")
                                    val = f"{int(t)} {int(g)} {float(r):.2f} {float(x):.2f}"
                                self.v[m[1]] = val
                            reply = f"{line[:3]} {cmd}"
                        elif cmd in self.v:
                            reply = f"{line[:3]} {cmd} {self.v[cmd]}"
                        else:
                            reply = f"{line[:3]} ERROR ARGUMENT ERROR."
                        writer.write(f"\r\nOK> {reply[:7]}".encode())
                        await writer.drain()
                        writer.write(f"{reply[7:]}\r\nOK> ".encode())
                await writer.drain()
        except (ConnectionError, asyncio.CancelledError):
            pass
        finally:
            writer.close()


class ClientTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.fake = FakeClearOne()
        self.port = await self.fake.start()

    async def asyncTearDown(self) -> None:
        await self.fake.stop()

    async def test_refuses_commands_outside_whitelist_without_sending(self) -> None:
        c = ClearOneTelnet("127.0.0.1", self.port, timeout=1)
        await c.connect("u", "p")
        for bad in ["#D0 GAIN 1 O -30.0 A", "#D0 MTRX 1 M 1 O 0", "#D* VER", "#D0 VER\r#D0 MUTE 1 O 1",
                    "#D0 PRESET 1", "#D0 GAIN 13 O", "#D0 VER\n"]:
            with self.assertRaisesRegex(ClearOneError, "Refused"):
                await c.query(bad)
        for bad in ["#D0 GAIN 1 O -30.0", "#D0 GAIN 1 O -30.0 R", "#D0 GAIN 4 O -30.0 A", "#D0 MUTE 1 O 2",
                    "#D0 MTRX 4 M 1 O 1", "#D0 MTRX 1 M 1 O 3", "#D0 MTRX B P 1 O 1", "#D0 MTRXLVL 3 M 1 O -10.0 A",
                    "#D0 GAIN 5 M -10.0 A", "#D0 AGC 1 M 2", "#D0 AGCSET 1 M -25 0 2 18", "#D0 MTRXCLEAR",
                    "#D0 MUTE 1 O 1\n"]:
            with self.assertRaisesRegex(ClearOneError, "Refused write"):
                await c.write(bad)
        self.assertEqual(await c.query("#D0 VER"), "4.4.0.31")
        self.assertEqual(await c.query("#D0 GAIN 3 O"), "-30.00 A")  # reply split mid-line
        self.assertEqual(self.fake.received[2:], ["#D0 VER", "#D0 GAIN 3 O"])
        c.close()

    async def test_bad_password_is_reported(self) -> None:
        c = ClearOneTelnet("127.0.0.1", self.port, timeout=1)
        with self.assertRaises(ClearOneAuthError):
            await c.connect("u", "wrong")

    async def test_unreachable_and_silent_device_time_out(self) -> None:
        silent = await asyncio.start_server(lambda r, w: w.write(b"user: "), "127.0.0.1", 0)
        c = ClearOneTelnet("127.0.0.1", silent.sockets[0].getsockname()[1], timeout=0.2)
        with self.assertRaisesRegex(ClearOneError, "timeout"):
            await c.connect("u", "p")
        silent.close()


class DeviceTests(unittest.IsolatedAsyncioTestCase):
    async def make(self, **kw) -> MultiroomDevice:
        self.fake = FakeClearOne(**kw)
        port = await self.fake.start()
        d = MultiroomDevice("127.0.0.1", port, "u", "p", timeout=1)
        await d.connect()
        return d

    async def asyncTearDown(self) -> None:
        await self.fake.stop()

    async def test_reads_rooms_inputs_and_presence(self) -> None:
        d = await self.make()
        s = d.state()
        self.assertEqual(s["status"], "ready")
        self.assertEqual([r["name"] for r in s["rooms"]], ["Toilet", "Kitchen extension", "Laundry room"])
        toilet = s["rooms"][0]
        self.assertEqual((toilet["gainDb"], toilet["muted"], toilet["deviceLabel"]), (-35.0, False, "WC"))
        self.assertEqual([(m["id"], m["on"], m["present"]) for m in toilet["mix"]],
                         [("arylic", True, True), ("birds", True, True), ("alexa", False, False)])
        self.assertEqual(toilet["playing"], ["Arylic", "Birds"])
        self.assertEqual([(i["id"], i["gainDb"], i["agc"], i["present"]) for i in s["inputs"]],
                         [("arylic", 10.0, True, True), ("birds", -5.0, False, True), ("alexa", 0.0, True, False)])
        writes = [l for l in self.fake.received[2:] if not re.fullmatch(
            r"#D0 (VER|ADPRESENT|LABEL [0-9]+ O 0|GAIN [0-9]+ [OM]|MUTE [0-9]+ O|MTRX [0-9A]+ [MP] [0-9]+ O|AGC [0-9]+ M|AGCSET [0-9]+ M)", l)]
        self.assertEqual(writes, [])  # reading never writes
        d.close()

    async def test_changes_are_written_once_and_confirmed(self) -> None:
        d = await self.make()
        await d.set_room_gain("toilet", -37)
        await d.set_room_mute("toilet", True)
        await d.set_room_source("laundry", "alexa", True)
        await d.set_input_gain("arylic", 8)
        await d.set_input_agc("birds", True)
        await d.set_input_agc_settings("birds", {"thresholdDb": -25, "targetDb": 0, "responseS": 2, "maxGainDb": 5})
        s = d.state()
        self.assertEqual((s["rooms"][0]["gainDb"], s["rooms"][0]["muted"], s["rooms"][0]["playing"]), (-37.0, True, []))
        self.assertTrue(s["rooms"][2]["mix"][2]["on"])
        self.assertEqual([c["gainDb"] for c in s["inputs"][0]["channels"]], [8.0, 8.0])  # M1 and M2 together
        self.assertTrue(s["inputs"][1]["agc"])
        self.assertEqual(s["inputs"][1]["channels"][0]["agcSettings"]["maxGainDb"], 5.0)
        writes = [l for l in self.fake.received if re.search(r" (-?[0-9.]+ A|[0-9]|[0-9.]+ [0-9.]+)$", l)
                  and not l.startswith("#D0 LABEL")]
        self.assertEqual(writes, ["#D0 GAIN 1 O -37.0 A", "#D0 MUTE 1 O 1", "#D0 MTRX 4 M 3 O 3",
                                  "#D0 GAIN 1 M 8.0 A", "#D0 GAIN 2 M 8.0 A", "#D0 AGC 3 M 1",
                                  "#D0 AGCSET 3 M -25 0 2.00 5.00"])
        d.close()

    async def test_validation_rejects_before_sending(self) -> None:
        d = await self.make()
        n = len(self.fake.received)
        bad = [d.set_room_gain("toilet", -20), d.set_room_gain("toilet", -61), d.set_room_gain("toilet", True),
               d.set_room_gain("nope", -40), d.set_room_mute("toilet", 1), d.set_room_source("toilet", "x", True),
               d.set_room_source("toilet", "birds", "yes"), d.set_input_gain("birds", 16), d.set_input_agc("birds", 1),
               d.set_input_agc_settings("birds", {"thresholdDb": -25.5, "targetDb": 0, "responseS": 2, "maxGainDb": 5}),
               d.set_input_agc_settings("birds", {"thresholdDb": -25, "targetDb": 0, "responseS": 2, "maxGainDb": 19}),
               d.set_input_agc_settings("birds", None)]
        for coro in bad:
            with self.assertRaises(ClearOneError):
                await coro
        self.assertEqual(len(self.fake.received), n)
        with self.assertRaisesRegex(ClearOneError, "Cap must be"):
            d.set_cap("toilet", 1)
        saved = []
        d.on_caps_changed = saved.append
        d.set_cap("toilet", -30)
        self.assertEqual(saved[-1]["toilet"], -30)
        with self.assertRaisesRegex(ClearOneError, "Volume must be"):
            await d.set_room_gain("toilet", -28)  # above the new cap
        d.close()

    async def test_unconfirmed_write_is_an_error(self) -> None:
        d = await self.make(apply_writes=False)
        with self.assertRaisesRegex(ClearOneError, "Readback did not confirm"):
            await d.set_room_gain("toilet", -40)
        self.assertEqual(d.state()["rooms"][0]["gainDb"], -35.0)  # shows the real value
        d.close()

    async def test_scenes_save_apply_update_delete(self) -> None:
        d = await self.make()
        saved = []
        d.on_scenes_changed = saved.append
        sid = d.save_scene("Downstairs", ["kitchen-ext", "laundry"])
        self.assertEqual(saved[-1][0]["rooms"]["laundry"], {"gainDb": -30.0, "muted": False,
                         "sources": {"arylic": True, "birds": False, "alexa": False}})
        for bad in [lambda: d.save_scene("downstairs", ["laundry"]), lambda: d.save_scene("", ["laundry"]),
                    lambda: d.save_scene("X", []), lambda: d.save_scene("Y", ["nope"]), lambda: d.update_scene("nope")]:
            with self.assertRaises(ClearOneError):
                bad()
        # Change the rooms, then apply: only differing values are written, mute before sources, unmute last.
        await d.set_room_source("laundry", "alexa", True)
        await d.set_room_gain("laundry", -45)
        await d.set_room_mute("kitchen-ext", True)
        n = len(self.fake.received)
        await d.apply_scene(sid)
        writes = [l for l in self.fake.received[n:] if re.search(r" (-?[0-9.]+ A|[0-9])$", l) and " O " in l and "LABEL" not in l and not re.fullmatch(r"#D0 (GAIN|MUTE) [0-9] O|#D0 MTRX \S+ \S+ [0-9] O", l)]
        self.assertEqual(writes, ["#D0 MUTE 2 O 0", "#D0 MTRX 4 M 3 O 0", "#D0 GAIN 3 O -30.0 A"])
        s = d.state()
        self.assertEqual((s["rooms"][2]["gainDb"], s["rooms"][1]["muted"]), (-30.0, False))
        self.assertEqual(s["scenes"][0]["rooms"][1], {"id": "laundry", "name": "Laundry room", "gainDb": -30.0, "muted": False, "sources": ["Arylic"]})
        # A scene volume above today's cap is clamped to the cap.
        d.scenes[0]["rooms"]["laundry"]["gainDb"] = -10.0
        await d.apply_scene(sid)
        self.assertEqual(d.room("laundry")["gainDb"], -20.0)
        d.update_scene(sid, name="Beneden", capture=True)
        self.assertEqual((d.scenes[0]["name"], d.scenes[0]["rooms"]["laundry"]["gainDb"]), ("Beneden", -20.0))
        d.delete_scene(sid)
        self.assertEqual((d.scenes, saved[-1]), ([], []))
        d.close()

    async def test_run_loop_recovers_after_device_restart(self) -> None:
        self.fake = FakeClearOne()
        port = await self.fake.start()
        d = MultiroomDevice("127.0.0.1", port, "u", "p", timeout=0.5)
        task = asyncio.create_task(d.run())
        for _ in range(50):
            await asyncio.sleep(0.05)
            if d.status == "ready":
                break
        self.assertEqual(d.status, "ready")
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task


if __name__ == "__main__":
    unittest.main()
