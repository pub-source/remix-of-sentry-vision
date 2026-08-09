
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
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import FastAPI, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

API_PORT = int(os.environ.get("MSD_API_PORT", 5000))
HLS_PORT = int(os.environ.get("MSD_HLS_PORT", 8888))
RTSP_PORT = int(os.environ.get("MSD_RTSP_PORT", 8554))
MAX_CAMERAS = 16
AUDIO_CHUNK_SECONDS = 5
WHISPER_MODEL = os.environ.get("MSD_WHISPER_MODEL", "base")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

IS_WINDOWS = os.name == "nt"


class MissingExecutable(RuntimeError):
    """Raised when an external binary (ffmpeg/ffprobe/mediamtx) cannot be found."""


def resolve_exe(name: str, env_var: str) -> Optional[str]:
    """Find an external binary.

    Order: explicit env var -> next to this script -> system PATH.
    Returns an absolute path, or None when the binary is genuinely missing.
    Never returns a non-existent guess (that is what caused
    "[WinError 2] The system cannot find the file specified").
    """
    candidates: List[str] = []
    override = os.environ.get(env_var)
    if override:
        candidates.append(override)
        # allow FFMPEG_EXE to point at a folder
        candidates.append(os.path.join(override, name + (".exe" if IS_WINDOWS else "")))
    local_names = [name + ".exe", name] if IS_WINDOWS else [name]
    for n in local_names:
        candidates.append(os.path.join(BASE_DIR, n))
        candidates.append(os.path.join(BASE_DIR, "bin", n))

    for cand in candidates:
        if cand and os.path.isfile(cand) and os.access(cand, os.X_OK if not IS_WINDOWS else os.F_OK):
            return os.path.abspath(cand)

    found = shutil.which(override) if override else None
    return found or shutil.which(name)


def install_hint(name: str, env_var: str) -> str:
    if name == "mediamtx":
        how = ("download mediamtx from https://github.com/bluenviron/mediamtx/releases "
               f"and put {name}{'.exe' if IS_WINDOWS else ''} next to camera_server.py")
    elif IS_WINDOWS:
        how = ("install it with  winget install Gyan.FFmpeg  (or download from "
               "https://www.gyan.dev/ffmpeg/builds/ and add the bin folder to PATH)")
    else:
        how = "install it with  sudo apt install ffmpeg  (or brew install ffmpeg)"
    return (f"'{name}' was not found. {how}. "
            f"Alternatively set the {env_var} environment variable to its full path.")


def need_exe(name: str, env_var: str) -> str:
    path = resolve_exe(name, env_var)
    if not path:
        raise MissingExecutable(install_hint(name, env_var))
    return path


FFMPEG_EXE = resolve_exe("ffmpeg", "FFMPEG_EXE")
FFPROBE_EXE = resolve_exe("ffprobe", "FFPROBE_EXE")
MEDIAMTX_EXE = resolve_exe("mediamtx", "MEDIAMTX_EXE")

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

def which(binary: Optional[str]) -> bool:
    return bool(binary) and (os.path.isfile(binary) or shutil.which(binary) is not None)



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
    stderr_lines: List[str] = field(default_factory=list)
    started_at: float = 0.0

    def _capture_video_errors(self, proc: subprocess.Popen):
        if not proc.stderr:
            return
        try:
            for raw in iter(proc.stderr.readline, b""):
                line = raw.decode("utf-8", errors="replace").strip()
                if line:
                    print(f"[FFmpeg] {line}", flush=True)
                    with self.lock:
                        self.stderr_lines = (self.stderr_lines + [line])[-50:]
        except Exception:
            pass

    def last_video_error(self) -> str:
        with self.lock:
            return self.stderr_lines[-1] if self.stderr_lines else "RTSP stream ended"

    # ---- video: RTSP -> MediaMTX (copy, low CPU; transcode fallback) ------- #
    def start_video(self):
        if self.video_proc and self.video_proc.poll() is None:
            return

        target = f"rtsp://127.0.0.1:{RTSP_PORT}/{self.path}"
        ffmpeg = need_exe("ffmpeg", "FFMPEG_EXE")

        cmd = [
            ffmpeg,

            "-nostdin",
            "-hide_banner",
            "-loglevel", "warning",
            "-rtsp_transport", "tcp",
            "-i", self.rtsp,
            "-map", "0:v:0",
            "-map", "0:a:0?",
            "-c:v", "copy",
            "-c:a", "aac",
            "-ar", "16000",
            "-ac", "1",
            "-f", "rtsp",
            f"rtsp://127.0.0.1:{RTSP_PORT}/{self.path}",
        ]

        print("\n========== FFMPEG COMMAND ==========")
        print(" ".join(cmd))
        print("===================================\n")

        with self.lock:
            self.stderr_lines = []

        self.error = None
        self.started_at = time.time()

        self.video_proc = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )

        def _wait_ffmpeg():
            code = self.video_proc.wait()
            print(f"FFmpeg exited with code {code}", flush=True)

        threading.Thread(target=_wait_ffmpeg, daemon=True).start()

        threading.Thread(
            target=self._capture_video_errors,
            args=(self.video_proc,),
            daemon=True,
        ).start()

    # ---- audio: RTSP audio -> 5s WAV chunks -> Whisper --------------------- #
    def _audio_loop(self):
        try:
            ffmpeg = need_exe("ffmpeg", "FFMPEG_EXE")
        except MissingExecutable as exc:
            self.error = str(exc)
            return
        tmpdir = tempfile.mkdtemp(prefix=f"msd-audio-{self.path}-")
        try:
            while not self.stop_flag.is_set():
                wav = os.path.join(tmpdir, f"chunk-{int(time.time())}.wav")
                cmd = [
                    ffmpeg, "-nostdin", "-loglevel", "error",

                    "-rtsp_transport", "tcp", "-rw_timeout", "15000000", "-i", self.rtsp,
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

    def hls_ready(self) -> bool:
        if not self.running():
            return False
        try:
            with urllib.request.urlopen(
                f"http://127.0.0.1:{HLS_PORT}/{self.path}/index.m3u8", timeout=1.5
            ) as response:
                return response.status == 200 and b"#EXTM3U" in response.read(128)
        except Exception:
            return False

    def status(self, host: str) -> dict:
        return {
            "id": self.id,
            "path": self.path,
            "name": self.name,
            "enabled": self.enabled,
            "ffmpeg": self.running(),
            "hls_ready": self.hls_ready(),
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
    exe = resolve_exe("mediamtx", "MEDIAMTX_EXE")
    if not exe:
        print(install_hint("mediamtx", "MEDIAMTX_EXE"), flush=True)
        return
    MEDIAMTX = subprocess.Popen([exe], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
                reason = cam.last_video_error()
                cam.error = f"Stream disconnected: {reason}. Reconnecting…"
                try:
                    time.sleep(min(5, max(1, cam.restarts)))
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
    ffmpeg = resolve_exe("ffmpeg", "FFMPEG_EXE")
    ffprobe = resolve_exe("ffprobe", "FFPROBE_EXE")
    problems = []
    if not ffmpeg:
        problems.append(install_hint("ffmpeg", "FFMPEG_EXE"))
    if not ffprobe:
        problems.append(install_hint("ffprobe", "FFPROBE_EXE"))
    return {
        "mediamtx": bool(MEDIAMTX and MEDIAMTX.poll() is None),
        "hls_port": HLS_PORT,
        "lan_ip": host,
        "whisper": WHISPER.available,
        "cameras": cams,
        "ffmpeg_path": ffmpeg,
        "ffprobe_path": ffprobe,
        "error": " ".join(problems) or None,
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
        deadline = time.time() + 8
        while time.time() < deadline and cam.running() and not cam.hls_ready():
            time.sleep(0.4)
        if not cam.running():
            return {"success": False, "error": cam.last_video_error()}
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


@app.post("/cameras/{camera_id}/talk")
async def talk_to_camera(camera_id: str, audio: UploadFile = File(...)):
    """Push-to-talk: send laptop microphone audio out of the CCTV speaker.

    The clip is transcoded to the codec ONVIF back-channel cameras expect
    (G.711 mu-law, 8 kHz mono) and pushed to the camera's RTSP audio path.
    """
    cam = CAMERAS.get(camera_id)
    if not cam:
        return {"success": False, "error": "camera not connected"}
    if not which(FFMPEG_EXE):
        return {"success": False, "error": "ffmpeg not installed"}
    data = await audio.read()
    if not data:
        return {"success": False, "error": "empty audio"}

    tmp = os.path.join(tempfile.gettempdir(), f"msds_talk_{camera_id}.webm")
    with open(tmp, "wb") as fh:
        fh.write(data)

    # Most V380 / ONVIF cameras expose the back-channel on the same RTSP url.
    target = cam.rtsp
    try:
        out = subprocess.run(
            [FFMPEG_EXE, "-hide_banner", "-loglevel", "error", "-re", "-i", tmp,
             "-vn", "-acodec", "pcm_mulaw", "-ar", "8000", "-ac", "1",
             "-f", "rtsp", "-rtsp_transport", "tcp", target],
            capture_output=True, text=True, timeout=30,
        )
        if out.returncode != 0:
            return {"success": False,
                    "error": (out.stderr.strip()[:300] or "camera rejected the audio back-channel")}
        return {"success": True}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "timed out sending audio to the camera"}
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


@app.post("/test-connection")
async def test_connection(request: Request):
    body = await request.json()
    rtsp = body.get("rtsp", "")
    if not rtsp:
        return {"success": False, "error": "missing rtsp url"}
    ffprobe = resolve_exe("ffprobe", "FFPROBE_EXE")
    if not ffprobe:
        return {"success": False, "error": install_hint("ffprobe", "FFPROBE_EXE")}
    try:
        out = subprocess.run(
            [ffprobe, "-v", "error", "-rtsp_transport", "tcp", "-rw_timeout", "15000000",

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
