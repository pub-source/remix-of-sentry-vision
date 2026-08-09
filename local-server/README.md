# MSD Local Camera Server

Bridges an RTSP CCTV into a browser-playable HLS stream for the MSDSystem dashboard.

```
CCTV (RTSP) -> ffmpeg -> MediaMTX -> HLS http://<pc-ip>:8888/cam1/index.m3u8
```

## 1. Install (Windows — recommended)

From a terminal in this folder:

```bat
setup_windows.bat
```

This creates a local `.venv`, installs everything in `requirements.txt`
(FastAPI, uvicorn, psutil, python-multipart, **faster-whisper**) into *that*
interpreter, and checks that `ffmpeg`/`ffprobe` are on PATH.

Then always start the server with:

```bat
start_server.bat
```

`start_server.bat` runs `.venv\Scripts\python.exe camera_server.py` and
re-installs requirements automatically if `faster_whisper` is missing, so the
package can never end up in a different Python environment.

To activate the venv manually:

```bat
.venv\Scripts\activate
python camera_server.py
```

### Manual / macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python camera_server.py
```

You also need [MediaMTX](https://github.com/bluenviron/mediamtx/releases)
(`mediamtx.exe` next to this script, or `MEDIAMTX_EXE`) and
[ffmpeg](https://ffmpeg.org/download.html)
(`winget install Gyan.FFmpeg`, or set `FFMPEG_EXE`).

### Whisper / CCTV wake words

`faster-whisper` powers CCTV microphone transcription. On first use it
downloads the model named by `MSD_WHISPER_MODEL` (default `base`; use `tiny`
for a smaller download), so the machine needs internet access once.

The server never dies when audio is unavailable — video keeps streaming — and
`/status` plus the startup banner tell you exactly which of the three failure
modes you hit:

| `whisper_state`   | meaning                                                  |
| ----------------- | -------------------------------------------------------- |
| `package_missing` | faster-whisper is not installed in the running Python. The message includes `sys.executable` and a copy-pasteable `"<python>" -m pip install -r requirements.txt`. |
| `model_error`     | package present, but the model failed to download/load.   |
| `ready`           | transcription is running.                                 |

Missing FFmpeg is reported separately in `ffmpeg_path` / `error`.

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
