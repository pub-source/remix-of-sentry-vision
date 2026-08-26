"""One fully independent pipeline per camera (video + audio + Whisper)."""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
from dataclasses import dataclass, field
from typing import List, Optional

from .binaries import MissingExecutable, install_hint, need_exe, no_window_flags, now_iso
from .config import AUDIO_CHUNK_SECONDS, HLS_PORT, HLS_PROBE_TTL, RTSP_PORT, match_distress
from .whisper_engine import WHISPER


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
    audio_connected: bool = False
    audio_chunks: int = 0
    audio_bytes: int = 0
    audio_error: Optional[str] = None
    audio_ffmpeg_error: Optional[str] = None
    last_audio_chunk_at: Optional[str] = None
    last_transcription_at: Optional[str] = None
    last_transcript: str = ""
    _hls_ok: bool = False
    _hls_checked: float = 0.0

    # ---- video: RTSP -> MediaMTX (copy, low CPU) --------------------------- #
    def _capture_video_errors(self, proc: subprocess.Popen):
        if not proc.stderr:
            return
        try:
            for raw in iter(proc.stderr.readline, b""):
                line = raw.decode("utf-8", errors="replace").strip()
                if line:
                    print(f"[FFmpeg {self.id}] {line}", flush=True)
                    with self.lock:
                        self.stderr_lines = (self.stderr_lines + [line])[-50:]
        except Exception:
            pass

    def last_video_error(self) -> str:
        with self.lock:
            return self.stderr_lines[-1] if self.stderr_lines else "RTSP stream ended"

    def start_video(self):
        if self.video_proc and self.video_proc.poll() is None:
            return

        ffmpeg = need_exe("ffmpeg", "FFMPEG_EXE")
        cmd = [
            ffmpeg,
            "-nostdin", "-hide_banner", "-loglevel", "warning",
            "-fflags", "+genpts+discardcorrupt",
            "-rtsp_transport", "tcp",
            "-i", self.rtsp,
            "-map", "0:v:0", "-map", "0:a:0?",
            "-c:v", "copy",
            "-c:a", "aac", "-ar", "16000", "-ac", "1",
            "-f", "rtsp",
            f"rtsp://127.0.0.1:{RTSP_PORT}/{self.path}",
        ]

        with self.lock:
            self.stderr_lines = []
        self.error = None
        self.started_at = time.time()

        self.video_proc = subprocess.Popen(
            cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
            creationflags=no_window_flags(),
        )
        threading.Thread(target=self._capture_video_errors,
                         args=(self.video_proc,), daemon=True).start()

    # ---- audio: RTSP audio -> 5s WAV chunks -> Whisper --------------------- #
    def _audio_loop(self):
        tmpdir = tempfile.mkdtemp(prefix=f"msd-audio-{self.path}-")
        try:
            while not self.stop_flag.is_set():
                try:
                    ffmpeg = need_exe("ffmpeg", "FFMPEG_EXE")
                except MissingExecutable as exc:
                    self.audio_connected = False
                    self.audio_error = str(exc)
                    self.error = self.audio_error
                    self.stop_flag.wait(5)
                    continue

                wav = os.path.join(tmpdir, f"chunk-{int(time.time())}.wav")
                cmd = [
                    ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "warning",
                    "-rtsp_transport", "tcp", "-rw_timeout", "15000000", "-i", self.rtsp,
                    "-map", "0:a:0", "-vn", "-acodec", "pcm_s16le",
                    "-ac", "1", "-ar", "16000", "-f", "wav",
                    "-t", str(AUDIO_CHUNK_SECONDS), "-y", wav,
                ]
                try:
                    self.audio_proc = subprocess.Popen(
                        cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                        creationflags=no_window_flags(),
                    )
                    _out, stderr = self.audio_proc.communicate(timeout=AUDIO_CHUNK_SECONDS + 15)
                    error_text = stderr.decode("utf-8", errors="replace").strip() if stderr else ""
                    self.audio_ffmpeg_error = error_text[-1000:] or None
                    if self.audio_proc.returncode != 0:
                        self.audio_connected = False
                        self.audio_error = (
                            f"FFmpeg audio extraction failed ({self.audio_proc.returncode}): "
                            f"{error_text[-500:] or 'unknown error'}"
                        )
                except subprocess.TimeoutExpired:
                    if self.audio_proc and self.audio_proc.poll() is None:
                        self.audio_proc.kill()
                        self.audio_proc.communicate()
                    self.audio_connected = False
                    self.audio_error = "FFmpeg audio extraction timed out; retrying"
                except (OSError, subprocess.SubprocessError) as exc:
                    self.audio_connected = False
                    self.audio_error = (f"Could not start FFmpeg audio extraction: {exc}. "
                                        f"{install_hint('ffmpeg', 'FFMPEG_EXE')}")
                    self.error = self.audio_error

                if self.stop_flag.is_set():
                    break

                if os.path.exists(wav) and os.path.getsize(wav) > 4000:
                    self.audio_connected = True
                    self.audio_chunks += 1
                    self.audio_bytes += os.path.getsize(wav)
                    self.last_audio_chunk_at = now_iso()
                    self.audio_error = None
                    try:
                        transcript = WHISPER.transcribe(wav)
                    except Exception as exc:  # keep this camera alive
                        transcript = ""
                        self.audio_error = f"Whisper transcription failed: {exc}"
                        self.error = self.audio_error
                    if transcript:
                        keyword, confidence = match_distress(transcript)
                        timestamp = now_iso()
                        self.last_transcription_at = timestamp
                        self.last_transcript = transcript
                        # Publish every transcript; the frontend owns custom
                        # household wake-word matching.
                        with self.lock:
                            self.events.append({
                                "camera_id": self.id,
                                "timestamp": timestamp,
                                "transcript": transcript,
                                "keyword": keyword,
                                "confidence": confidence,
                            })
                            self.events = self.events[-200:]
                        print(f"[Audio {self.id}] transcript: {transcript}", flush=True)
                else:
                    self.audio_connected = False
                    if not self.audio_error:
                        self.audio_error = ("No valid audio chunk received "
                                            "(camera may have no RTSP audio track)")
                try:
                    os.remove(wav)
                except OSError:
                    pass
                if self.audio_error and not self.stop_flag.is_set():
                    self.stop_flag.wait(2)
        finally:
            self.audio_connected = False
            shutil.rmtree(tmpdir, ignore_errors=True)

    # ---- lifecycle --------------------------------------------------------- #
    def start(self):
        # A reconnect may happen immediately after stop(). Never clear the old
        # worker's stop flag while that worker is still winding down.
        if self.audio_thread and self.audio_thread.is_alive():
            if self.running():
                return
            self.stop_flag.set()
            self.audio_thread.join(timeout=AUDIO_CHUNK_SECONDS + 3)
            if self.audio_thread.is_alive():
                raise RuntimeError("Previous camera audio session is still stopping")
            self.audio_thread = None
        self.stop_flag.clear()
        self.error = None
        self.start_video()
        if WHISPER.available and (self.audio_thread is None or not self.audio_thread.is_alive()):
            self.audio_thread = threading.Thread(target=self._audio_loop, daemon=True)
            self.audio_thread.start()
        elif not WHISPER.available:
            self.audio_error = WHISPER.error or "Whisper is unavailable"

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
        thread = self.audio_thread
        if thread and thread.is_alive() and thread is not threading.current_thread():
            thread.join(timeout=AUDIO_CHUNK_SECONDS + 3)
        self.audio_thread = None
        self.audio_connected = False
        self._hls_ok = False
        self._hls_checked = 0.0

    def running(self) -> bool:
        return bool(self.video_proc and self.video_proc.poll() is None)

    def hls_ready(self, force: bool = False) -> bool:
        if not self.running():
            self._hls_ok = False
            return False
        now = time.time()
        if not force and self._hls_ok and now - self._hls_checked < HLS_PROBE_TTL:
            return True
        try:
            with urllib.request.urlopen(
                f"http://127.0.0.1:{HLS_PORT}/{self.path}/index.m3u8", timeout=1.5
            ) as response:
                self._hls_ok = response.status == 200 and b"#EXTM3U" in response.read(128)
        except Exception:
            self._hls_ok = False
        self._hls_checked = now
        return self._hls_ok

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
            "audio": self.audio_status(),
        }

    def audio_status(self) -> dict:
        return {
            "thread_running": bool(self.audio_thread and self.audio_thread.is_alive()),
            "connected": self.audio_connected,
            "chunks_received": self.audio_chunks,
            "bytes_received": self.audio_bytes,
            "last_chunk_at": self.last_audio_chunk_at,
            "last_transcription_at": self.last_transcription_at,
            "last_transcript": self.last_transcript,
            "error": self.audio_error or WHISPER.error,
            "ffmpeg_error": self.audio_ffmpeg_error,
        }
