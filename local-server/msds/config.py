"""Static configuration for the MSDS local camera bridge.

Every tunable lives here so the other modules stay import-light and fast.
"""
from __future__ import annotations

import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIN_DIR = os.path.join(BASE_DIR, "bin")
IS_WINDOWS = os.name == "nt"

API_PORT = int(os.environ.get("MSD_API_PORT", 5000))
HLS_PORT = int(os.environ.get("MSD_HLS_PORT", 8888))
RTSP_PORT = int(os.environ.get("MSD_RTSP_PORT", 8554))

MAX_CAMERAS = 16
AUDIO_CHUNK_SECONDS = 5
WHISPER_MODEL = os.environ.get("MSD_WHISPER_MODEL", "base")

# How long a positive HLS probe stays valid (seconds). Avoids one HTTP request
# per camera on every /status poll — the main cost with 16 cameras.
HLS_PROBE_TTL = 3.0

MEDIAMTX_CONFIG = os.path.join(BASE_DIR, "mediamtx.yml")

DISTRESS_KEYWORDS = {
    "help": 0.95, "help me": 0.98, "fire": 0.97, "emergency": 0.95,
    "call 911": 0.98, "someone help": 0.97, "i fell": 0.93, "i can't breathe": 0.98,
    "stop": 0.8, "get away": 0.9, "don't hurt me": 0.97, "please stop": 0.92,
    "ambulance": 0.95, "police": 0.9, "i'm hurt": 0.95, "save me": 0.97,
}


def match_distress(transcript: str):
    text = transcript.lower()
    best, score = "", 0.0
    for kw, conf in DISTRESS_KEYWORDS.items():
        if kw in text and conf > score:
            best, score = kw, conf
    return best, score
