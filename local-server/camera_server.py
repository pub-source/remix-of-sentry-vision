"""
MSDSystem multi-camera bridge.

Runs MediaMTX + one independent FFmpeg pipeline per CCTV camera:

  RTSP camera  --ffmpeg--> MediaMTX (rtsp://127.0.0.1:8554/<path>)  --> HLS :8888
               \--ffmpeg--> 5s WAV chunks --> Whisper --> audio distress events

Audio ALWAYS comes from the camera's own RTSP audio track. The laptop
microphone is never used.

Run:
    pip install fastapi uvicorn faster-whisper
    python camera_server.py
"""

from __future__ import annotations

import os
import re
import json
import queue
import shutil
import socket
import signal
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

API_PORT = int(os.environ.get("MSD_API_PORT", 5000))
HLS_PORT = int(os.environ.get("MSD_HLS_PORT", 8888))
RTSP_PORT = int(os.environ.get("MSD_RTSP_PORT", 8554))
MAX_CAMERAS = 16
AUDIO_CHUNK_SECONDS = 5
WHISPER_MODEL = os.environ.get("MSD_WHISPER_MODEL", "base")

DISTRESS_KEYWORDS = {
    "help": 0.95, "help me": 0.98, "fire": 0.97, "emergency": 0.95,
    "call 911": 0.98, "someone help": 0.97, "i fell": 0.93, "i can't breathe": 0.98,
    "stop": 0.8, "get away": 0.9, "don't hurt me": 0.97, "please stop": 0.92,
    "ambulance": 0.95, "police": 0.9, "i'm hurt": 0.95, "save me": 0.97,
}

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    finally:
        s.close()

def which(binary: str) -> bool:
    return shutil.which(binary) is not None


# --------------------------------------------------------------------------- #
# Whisper (loaded lazily, shared across cameras, one worker thread)
# --------------------------------------------------------------------------- #
class WhisperEngine:
    def __init__(self) -> None:
        self.model = None
        self.available = False
        self.lock = threading.Lock()
        try:
            from faster_whisper import WhisperModel  # noqa: F401
            self.available = True
        except Exception:
            self.available = False

    def load(self):
        if self.model is not None:
            return self.model
        with self.lock:
            if self.model is None:
                from faster_whisper import WhisperModel
                self.model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
        return self.model

    def transcribe(self, wav_path: str) -> str:
        if not self.available:
            return ""
        model = self.load()
        with self.lock:
            segments, _info = model.transcribe(wav_path, language="en", vad_filter=True)
            return " ".join(seg.text.strip() for seg in segments).strip()


WHISPER = WhisperEngine()


def match_distress(transcript: str):
    text = transcript.lower()
    best, score = "", 0.0
    for kw, conf in DISTRESS_KEYWORDS.items():
        if kw in text and conf > score:
            best, score = kw, conf
    return best, score


# --------------------------------------------------------------------------- #
# One independent pipeline per camera
# --------------------------------------------------------------------------- #
@dataclass
class Camera:
    id: str
    path: str
    name: str
    rtsp: str
    enabled: bool = True

    video_proc: Optional[subprocess.Popen] = None
    audio_proc: Optional[subprocess.Popen] = None
    audio_thread: Optional[threading.Thread] = None
    stop_flag: threading.Event = field(default_factory=threading.Event)
    restarts: int = 0
    error: Optional[str] = None
    events: List[dict] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)

    # ---- video: RTSP -> MediaMTX (copy, low CPU; transcode fallback) ------- #
    def start_video(self):
        if self.video_proc and self.video_proc.poll() is None:
            return
        target = f"rtsp://127.0.0.1:{RTSP_PORT}/{self.path}"
        cmd = [
            "ffmpeg", "-nostdin", "-loglevel", "error",
            "-rtsp_transport", "tcp", "-stimeout", "5000000",
            "-i", self.rtsp,
            "-c:v", "copy", "-c:a", "aac", "-ar", "16000", "-ac", "1",
            "-f", "rtsp", "-rtsp_transport", "tcp", target,
        ]
        self.video_proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

    # ---- audio: RTSP audio -> 5s WAV chunks -> Whisper --------------------- #
    def _audio_loop(self):
        tmpdir = tempfile.mkdtemp(prefix=f"msd-audio-{self.path}-")
        try:
            while not self.stop_flag.is_set():
                wav = os.path.join(tmpdir, f"chunk-{int(time.time())}.wav")
                cmd = [
                    "ffmpeg", "-nostdin", "-loglevel", "error",
                    "-rtsp_transport", "tcp", "-i", self.rtsp,
                    "-vn", "-ac", "1", "-ar", "16000",
                    "-t", str(AUDIO_CHUNK_SECONDS), "-y", wav,
                ]
                try:
                    self.audio_proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    self.audio_proc.wait(timeout=AUDIO_CHUNK_SECONDS + 15)
                except Exception:
                    pass
                if self.stop_flag.is_set():
                    break
                if os.path.exists(wav) and os.path.getsize(wav) > 4000:
                    try:
                        transcript = WHISPER.transcribe(wav)
                    except Exception as exc:  # keep this camera alive
                        transcript = ""
                        self.error = f"whisper: {exc}"
                    if transcript:
                        keyword, confidence = match_distress(transcript)
                        if keyword:
                            with self.lock:
                                self.events.append({
                                    "camera_id": self.id,
                                    "timestamp": now_iso(),
                                    "transcript": transcript,
                                    "keyword": keyword,
                                    "confidence": confidence,
                                })
                                self.events = self.events[-200:]
                try:
                    os.remove(wav)
                except OSError:
                    pass
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    def start(self):
        self.stop_flag.clear()
        self.error = None
        self.start_video()
        if WHISPER.available and (self.audio_thread is None or not self.audio_thread.is_alive()):
            self.audio_thread = threading.Thread(target=self._audio_loop, daemon=True)
            self.audio_thread.start()

    def stop(self):
        self.stop_flag.set()
        for proc in (self.video_proc, self.audio_proc):
            if proc and proc.poll() is None:
                try:
                    proc.terminate()
                    proc.wait(timeout=5)
                except Exception:
                    proc.kill()
        self.video_proc = None
        self.audio_proc = None

    def running(self) -> bool:
        return bool(self.video_proc and self.video_proc.poll() is None)

    def status(self, host: str) -> dict:
        return {
            "id": self.id,
            "path": self.path,
            "name": self.name,
            "enabled": self.enabled,
            "ffmpeg": self.running(),
            "hls_ready": self.running(),
            "stream": f"http://{host}:{HLS_PORT}/{self.path}/index.m3u8",
            "stream_local": f"http://127.0.0.1:{HLS_PORT}/{self.path}/index.m3u8",
            "restarts": self.restarts,
            "error": self.error,
        }


CAMERAS: Dict[str, Camera] = {}
CAM_LOCK = threading.Lock()
MEDIAMTX: Optional[subprocess.Popen] = None


def start_mediamtx():
    global MEDIAMTX
    if MEDIAMTX and MEDIAMTX.poll() is None:
        return
    if not which("mediamtx"):
        return
    MEDIAMTX = subprocess.Popen(["mediamtx"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)


def watchdog():
    """Restart only the camera that died — never touch the others."""
    while True:
        time.sleep(5)
        with CAM_LOCK:
            cams = list(CAMERAS.values())
        for cam in cams:
            if cam.enabled and not cam.stop_flag.is_set() and cam.video_proc and cam.video_proc.poll() is not None:
                cam.restarts += 1
                cam.error = "stream dropped — reconnecting"
                try:
                    cam.start_video()
                except Exception as exc:
                    cam.error = str(exc)


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #
app = FastAPI(title="MSDSystem multi-camera bridge")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


@app.get("/status")
def status():
    host = lan_ip()
    with CAM_LOCK:
        cams = [c.status(host) for c in CAMERAS.values()]
    return {
        "mediamtx": bool(MEDIAMTX and MEDIAMTX.poll() is None) or which("mediamtx"),
        "hls_port": HLS_PORT,
        "lan_ip": host,
        "whisper": WHISPER.available,
        "cameras": cams,
        "error": None if which("ffmpeg") else "ffmpeg not found in PATH",
    }


@app.post("/cameras/sync")
async def sync(request: Request):
    body = await request.json()
    incoming = body.get("cameras", [])[:MAX_CAMERAS]
    with CAM_LOCK:
        keep = set()
        for item in incoming:
            cid = item["id"]
            keep.add(cid)
            path = re.sub(r"[^a-zA-Z0-9_-]", "-", item.get("path") or cid)
            cam = CAMERAS.get(cid)
            if cam is None:
                CAMERAS[cid] = Camera(
                    id=cid, path=path, name=item.get("name", cid),
                    rtsp=item.get("rtsp", ""), enabled=bool(item.get("enabled", True)),
                )
            else:
                changed = cam.rtsp != item.get("rtsp", "") or cam.path != path
                cam.name = item.get("name", cam.name)
                cam.rtsp = item.get("rtsp", cam.rtsp)
                cam.path = path
                cam.enabled = bool(item.get("enabled", True))
                if changed and cam.running():
                    cam.stop()
                    cam.start()
        for cid in list(CAMERAS):
            if cid not in keep:
                CAMERAS[cid].stop()
                del CAMERAS[cid]
    return {"success": True, "count": len(CAMERAS)}


@app.post("/cameras/{camera_id}/start")
def start_one(camera_id: str):
    cam = CAMERAS.get(camera_id)
    if not cam:
        return {"success": False, "error": "unknown camera"}
    start_mediamtx()
    try:
        cam.start()
    except Exception as exc:
        return {"success": False, "error": str(exc)}
    return {"success": True, "stream": cam.status(lan_ip())["stream"]}


@app.post("/cameras/{camera_id}/stop")
def stop_one(camera_id: str):
    cam = CAMERAS.get(camera_id)
    if cam:
        cam.stop()
    return {"success": True}


@app.post("/start-all")
def start_all():
    start_mediamtx()
    with CAM_LOCK:
        cams = [c for c in CAMERAS.values() if c.enabled]
    for cam in cams:
        try:
            cam.start()
        except Exception as exc:
            cam.error = str(exc)
    return {"success": True, "started": len(cams)}


@app.post("/stop-all")
def stop_all():
    with CAM_LOCK:
        cams = list(CAMERAS.values())
    for cam in cams:
        cam.stop()
    return {"success": True}


@app.get("/cameras/{camera_id}/audio-events")
def audio_events(camera_id: str, since: Optional[str] = None):
    cam = CAMERAS.get(camera_id)
    if not cam:
        return {"events": []}
    with cam.lock:
        events = list(cam.events)
    if since:
        events = [e for e in events if e["timestamp"] > since]
    return {"events": events}


@app.post("/test-connection")
async def test_connection(request: Request):
    body = await request.json()
    rtsp = body.get("rtsp", "")
    if not rtsp:
        return {"success": False, "error": "missing rtsp url"}
    if not which("ffprobe"):
        return {"success": False, "error": "ffprobe not installed"}
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-rtsp_transport", "tcp",
             "-show_entries", "stream=codec_name,width,height",
             "-of", "json", rtsp],
            capture_output=True, text=True, timeout=20,
        )
        if out.returncode != 0:
            return {"success": False, "error": out.stderr.strip()[:300] or "connection failed"}
        return {"success": True, "info": out.stdout[:500]}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "timed out reaching camera"}


def shutdown(*_args):
    with CAM_LOCK:
        for cam in CAMERAS.values():
            cam.stop()
    if MEDIAMTX and MEDIAMTX.poll() is None:
        MEDIAMTX.terminate()
    raise SystemExit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)
    threading.Thread(target=watchdog, daemon=True).start()
    start_mediamtx()
    print(f"MSDSystem multi-camera bridge on http://0.0.0.0:{API_PORT} (HLS :{HLS_PORT})")
    print(f"Whisper available: {WHISPER.available}")
    uvicorn.run(app, host="0.0.0.0", port=API_PORT, log_level="warning")
