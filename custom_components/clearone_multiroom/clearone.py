"""Telnet client for the ClearOne CONVERGE Pro 880T.

No Home Assistant imports, so it can be tested on its own. Every outgoing command must
fully match an explicit whitelist: QUERY for reads, WRITE for the few settings the
integration may change. Only the login lines bypass this.
"""
from __future__ import annotations

import asyncio
import re

_CH = r"(?:[1-9]|1[0-2])"
QUERY = re.compile(
    rf"#D[0-9AB] (?:VER|DID|ADPRESENT|(?:GAIN|MUTE) {_CH} O|GAIN {_CH} [ML]|(?:AGC|AGCSET) {_CH} [ML]"
    rf"|MTRX {_CH} [ML] {_CH} O|MTRX [A-H] P {_CH} O|LABEL {_CH} [OML] 0)"
)
WRITE = re.compile(
    r"#D[0-9AB] (?:GAIN [1-3] O -?[0-9]{1,2}\.[0-9] A|MUTE [1-3] O [01]"
    r"|MTRX A P [1-3] O [01]|MTRX [34] M [1-3] O [03]"
    r"|GAIN [1-4] M -?[0-9]{1,2}\.[0-9] A|AGC [1-4] M [01]"
    r"|AGCSET [1-4] M -?[0-9]{1,2} -?[0-9]{1,2} [0-9]{1,2}\.[0-9]{2} [0-9]{1,2}\.[0-9]{2})"
)

IAC, DONT, DO, WONT, WILL, SB, SE = 255, 254, 253, 252, 251, 250, 240
MAX_BUFFER = 16384


class ClearOneError(Exception):
    """Communication failure, timeout or refused command."""


class ClearOneAuthError(ClearOneError):
    """Login rejected."""


class ClearOneTelnet:
    """One authenticated Telnet session. Requests are serialized."""

    def __init__(self, host: str, port: int = 23, timeout: float = 3.0) -> None:
        self.host, self.port, self.timeout = host, port, timeout
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None
        self._text = ""
        self._iac: list[int] = []
        self._lock = asyncio.Lock()

    @property
    def connected(self) -> bool:
        return self._writer is not None and not self._writer.is_closing()

    async def connect(self, user: str, password: str) -> None:
        try:
            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port), self.timeout * 2
            )
        except (OSError, asyncio.TimeoutError) as err:
            raise ClearOneError(f"Cannot reach {self.host}:{self.port}: {str(err) or 'timeout'}") from err
        self._text, self._iac = "", []
        try:
            await self._wait(lambda: re.search(r"user:\s*$", self._text, re.I) is not None)
            self._send(user + "\r")
            await self._wait(lambda: re.search(r"pass:\s*$", self._text, re.I) is not None)
            self._text = ""
            self._send(password + "\r")
            await self._wait(
                lambda: "Authenticated." in self._text
                or re.search(r"fail|invalid|denied|incorrect|user:\s*$", self._text, re.I) is not None
            )
            if "Authenticated." not in self._text:
                raise ClearOneAuthError("Login rejected by the ClearOne")
        except BaseException:
            self.close()
            raise

    async def query(self, command: str) -> str:
        """Send a whitelisted query; return the value after the echoed command."""
        if not QUERY.fullmatch(command):
            raise ClearOneError(f"Refused non-query command: {command[:40]}")
        prefix = command + " "
        async with self._lock:
            self._text = ""
            self._send(command + "\r")
            result: list[str] = []

            def hit() -> bool:
                if not re.search(r"OK>\s*$", self._text):
                    return False
                for line in re.split(r"[\r\n]+", self._text):
                    line = re.sub(r"^(?:OK>\s*)+", "", line).strip()
                    if line.startswith(prefix):
                        result.append(line[len(prefix):])
                        return True
                return False

            await self._wait(hit)
            return result[0]

    async def write(self, command: str) -> None:
        """Send a whitelisted write once. Callers must confirm it with a separate query."""
        if not WRITE.fullmatch(command):
            raise ClearOneError(f"Refused write: {command[:40]}")
        async with self._lock:
            self._text = ""
            self._send(command + "\r")
            # Consume the reply so it cannot be mistaken for the readback.
            try:
                await self._wait(lambda: re.search(r"OK>\s*$", self._text) is not None)
            except ClearOneError:
                if not self.connected:
                    raise
            self._text = ""

    def close(self) -> None:
        if self._writer is not None:
            self._writer.close()
        self._writer = self._reader = None

    def _send(self, text: str) -> None:
        if not self.connected:
            raise ClearOneError("Connection closed")
        self._writer.write(text.encode("ascii"))

    async def _wait(self, test) -> None:
        async def loop() -> None:
            while not test():
                if self._reader is None:
                    raise ClearOneError("Connection closed")
                data = await self._reader.read(4096)
                if not data:
                    self.close()
                    raise ClearOneError("Connection closed")
                self._feed(data)

        try:
            await asyncio.wait_for(loop(), self.timeout)
        except asyncio.TimeoutError as err:
            raise ClearOneError("Device timeout") from err

    def _feed(self, data: bytes) -> None:
        """Strip Telnet negotiation and refuse every option (DO -> WONT, WILL -> DONT)."""
        out = []
        for b in data:
            s = self._iac
            if not s:
                if b == IAC:
                    s.append(b)
                else:
                    out.append(chr(b))
            elif len(s) >= 2 and s[1] == SB:
                s.append(b)
                if b == SE and s[-2] == IAC:
                    self._iac = []
            elif len(s) == 1:
                if b == IAC:
                    out.append(chr(255))
                    self._iac = []
                elif b == SB or WILL <= b <= DONT:
                    s.append(b)
                else:
                    self._iac = []
            else:
                if s[1] == DO and self._writer:
                    self._writer.write(bytes([IAC, WONT, b]))
                elif s[1] == WILL and self._writer:
                    self._writer.write(bytes([IAC, DONT, b]))
                self._iac = []
        self._text += "".join(out)
        if len(self._text) > MAX_BUFFER:
            self._text = ""
            self.close()
            raise ClearOneError("Reply buffer overflow")
