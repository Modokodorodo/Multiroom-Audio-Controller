"""Constants and the room/source mapping of this installation (see docs/MAPPING.md)."""
from __future__ import annotations

DOMAIN = "clearone_multiroom"
CONF_DEVICE_ID = "device_id"
OPT_CAPS = "caps"
OPT_ARYLIC_ENTITY = "arylic_entity"
OPT_SCENES = "scenes"
OPT_POWER_ENTITY = "power_entity"
# Automatic power (needs the power switch); see power.py.
OPT_AUTO_ON = "auto_on"
OPT_HOLD_PLAYBACK = "hold_playback"
OPT_AUTO_OFF = "auto_off"
OPT_IDLE_MINUTES = "idle_minutes"
OPT_THRESHOLD = "sound_threshold_db"
OPT_IGNORED_SOURCES = "ignored_sources"
DEFAULTS = {OPT_AUTO_ON: True, OPT_HOLD_PLAYBACK: True, OPT_AUTO_OFF: True, OPT_IDLE_MINUTES: 20,
            OPT_THRESHOLD: -45.0, OPT_IGNORED_SOURCES: []}
ARYLIC_SOURCE_ID = "arylic"
PANEL_URL = "multiroom"
PANEL_COMPONENT = "clearone-multiroom-panel"
STATIC_URL = "/clearone_multiroom_static"

# Rooms: one mono output each. Caps can be changed in the panel (stored in the config entry options).
ROOMS = [
    {"id": "toilet", "name": "Toilet", "output": 1, "minDb": -60.0, "maxDb": -25.0},
    {"id": "kitchen-ext", "name": "Kitchen extension", "output": 2, "minDb": -60.0, "maxDb": -15.0},
    {"id": "laundry", "name": "Laundry room", "output": 3, "minDb": -60.0, "maxDb": -20.0},
    # Added 2026-11-02. Caps are proposed defaults; change them in the panel's Settings.
    {"id": "kitchen", "name": "Kitchen", "output": 4, "minDb": -60.0, "maxDb": -15.0},
    {"id": "dining-room", "name": "Dining room", "output": 5, "minDb": -60.0, "maxDb": -15.0},
    {"id": "terrace", "name": "Terrace", "output": 6, "minDb": -60.0, "maxDb": -15.0},
]

# Sources: the matrix route into the rooms, the value that switches it on, and the inputs
# whose gain/AGC belong to the source. Arylic L/R are summed in processing block A.
SOURCES = [
    {"id": "arylic", "name": "Arylic", "channel": "A", "group": "P", "onMode": 1,
     "inputs": [{"channel": 1, "group": "M"}, {"channel": 2, "group": "M"}]},
    {"id": "birds", "name": "Birds", "channel": 3, "group": "M", "onMode": 3,
     "inputs": [{"channel": 3, "group": "M"}]},
    {"id": "alexa", "name": "Alexa", "channel": 4, "group": "M", "onMode": 3,
     "inputs": [{"channel": 4, "group": "M"}]},
]

INPUT_GAIN_RANGE = {"min": -40.0, "max": 15.0}
