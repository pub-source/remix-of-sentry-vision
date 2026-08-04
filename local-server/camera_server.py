"""
MSD Camera Server
=================
Local bridge that turns an RTSP CCTV stream into a browser-playable HLS stream.

    CCTV (RTSP)  ->  ffmpeg  ->  MediaMTX (rtsp://127.0.0.1:8554/camera)
                                     |
                                     +--> HLS  http://<this-pc>:8888/camera/index.m3u8

Run this on the SAME machine/Wi-Fi as the camera, then open the MSDSystem
dashboard, press "Connect" and use the "Local camera server" panel.

Setup
-----
    pip install fastapi uvicorn psutil
    python camera_server.py

Then in the dashboard set the server URL to  http://127.0.0.1:5000
(or http://<this-pc-ip>:5000 when the dashboard runs on another device).
"""

import os
import socket
import signal
import subprocess
import time
from typing import Optional

import psutil
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ==========================
# CONFIGURATION (env-overridable)
# ==========================

MEDIAMTX_EXE = os.environ.get(
    "MEDIAMTX_EXE", r"D:\sample test\mediamtx_v1.19.3_windows_amd64\mediamtx.exe"
)
FFMPEG_EXE = os.environ.get("FFMPEG_EXE", r"C:\ffmpeg\bin\ffmpeg.exe")

CAMERA_RTSP = os.environ.get("CAMERA_RTSP", "rtsp://192.168.18.98:554/live/ch00_1")
LOCAL_RTSP = os.environ.get("LOCAL_RTSP", "rtsp://127.0.0.1:8554/camera")
HLS_PORT = int(os.environ.get("HLS_PORT", "8888"))
STREAM_PATH = os.environ.get("STREAM_PATH", "camera")
SERVER_PORT = int(os.environ.get("SERVER_PORT", "5000"))

app = FastAPI(title="MSD Camera Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

mediamtx_process: Optional[subprocess.Popen] = None
ffmpeg_process: Optional[subprocess.Popen] = None
last_error: Optional[str] = None


def lan_ip() -> str:
    """Best-effort local IP so a phone/tablet can reach the HLS stream."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def hls_url(host: Optional[str] = None) -> str:
    return f"http://{host or lan_ip()}:{HLS_PORT}/{STREAM_PATH}/index.m3u8"


def process_running(name: str) -> bool:
    for p in psutil.process_iter(["name"]):
        try:
            if p.info["name"] and name.lower() in p.info["name"].lower():
                return True
        except Exception:
            pass
    return False


def is_port_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=1):
            return True
    except Exception:
        return False


def wait_for_port(port: int, timeout: int = 15) -> bool:
    start = time.time()
    while time.time() - start < timeout:
        if is_port_open("127.0.0.1", port):
            return True
        time.sleep(0.5)
    return False


def start_mediamtx():
    global mediamtx_process
    if process_running("mediamtx") or is_port_open("127.0.0.1", 8554):
        return
    if not os.path.exists(MEDIAMTX_EXE):
        raise RuntimeError(f"MediaMTX not found at {MEDIAMTX_EXE}")
    mediamtx_process = subprocess.Popen([MEDIAMTX_EXE])
    if not wait_for_port(8554):
        raise RuntimeError("MediaMTX failed to start (port 8554 never opened)")


def start_ffmpeg(source: str):
    global ffmpeg_process
    if ffmpeg_process is not None and ffmpeg_process.poll() is None:
        return
    if not os.path.exists(FFMPEG_EXE):
        raise RuntimeError(f"ffmpeg not found at {FFMPEG_EXE}")
    cmd = [
        FFMPEG_EXE,
        "-rtsp_transport", "tcp",
        "-i", source,
        "-c:v", "copy",
        "-c:a", "aac",
        "-ar", "16000",
        "-ac", "1",
        "-f", "rtsp",
        LOCAL_RTSP,
    ]
    ffmpeg_process = subprocess.Popen(cmd)


def stop_process(proc: Optional[subprocess.Popen]):
    if proc is None:
        return
    try:
        proc.terminate()
        proc.wait(timeout=5)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


class StartRequest(BaseModel):
    rtsp: Optional[str] = None


@app.get("/")
def root():
    return {"service": "camera_server", "status": "running", "version": 2}


@app.get("/status")
def status():
    return {
        "mediamtx": process_running("mediamtx") or is_port_open("127.0.0.1", 8554),
        "ffmpeg": ffmpeg_process is not None and ffmpeg_process.poll() is None,
        "hls_ready": is_port_open("127.0.0.1", HLS_PORT),
        "camera_rtsp": CAMERA_RTSP,
        "stream": hls_url(),
        "stream_local": hls_url("127.0.0.1"),
        "lan_ip": lan_ip(),
        "error": last_error,
    }


@app.post("/start-monitoring")
def start_monitoring(body: StartRequest | None = None):
    global CAMERA_RTSP, last_error
    last_error = None
    if body and body.rtsp:
        CAMERA_RTSP = body.rtsp
    try:
        start_mediamtx()
        start_ffmpeg(CAMERA_RTSP)
        wait_for_port(HLS_PORT, timeout=10)
    except Exception as exc:  # surfaced to the dashboard
        last_error = str(exc)
        return {"success": False, "error": last_error}
    return {
        "success": True,
        "stream": hls_url(),
        "stream_local": hls_url("127.0.0.1"),
        "camera_rtsp": CAMERA_RTSP,
        "message": "Monitoring started.",
    }


@app.post("/stop-monitoring")
def stop_monitoring():
    global mediamtx_process, ffmpeg_process
    stop_process(ffmpeg_process)
    stop_process(mediamtx_process)
    ffmpeg_process = None
    mediamtx_process = None
    return {"success": True}


if __name__ == "__main__":
    import uvicorn

    print(f"MSD Camera Server -> http://{lan_ip()}:{SERVER_PORT}")
    print(f"HLS stream will be at {hls_url()}")
    uvicorn.run(app, host="0.0.0.0", port=SERVER_PORT)
