# MSD Local Camera Server

Bridges an RTSP CCTV into a browser-playable HLS stream for the MSDSystem dashboard.

```
CCTV (RTSP) -> ffmpeg -> MediaMTX -> HLS http://<pc-ip>:8888/camera/index.m3u8
```

## 1. Install

- [MediaMTX](https://github.com/bluenviron/mediamtx/releases) (unzip anywhere)
- [ffmpeg](https://ffmpeg.org/download.html)
- Python deps:

```bash
pip install fastapi uvicorn psutil
```

## 2. Point it at your camera

Either edit the constants at the top of `camera_server.py`, or set env vars:

```bash
set MEDIAMTX_EXE=D:\mediamtx\mediamtx.exe
set FFMPEG_EXE=C:\ffmpeg\bin\ffmpeg.exe
set CAMERA_RTSP=rtsp://192.168.18.98:554/live/ch00_1
python camera_server.py
```

## 3. Connect from the dashboard

Open the dashboard **on the same machine or Wi-Fi**, press **Connect**, and in
**Local camera server** enter the server URL (default `http://127.0.0.1:5000`),
then press **Start monitoring** — the HLS link is filled in and connected
automatically.

### Notes

- The dashboard must be opened over `http://` (or the native app) — an HTTPS page
  cannot load a plain-HTTP local stream (mixed content).
- From a phone, use `http://<pc-lan-ip>:5000` instead of `127.0.0.1`.
- The server reports its LAN IP in `/status` so the stream URL works cross-device.
