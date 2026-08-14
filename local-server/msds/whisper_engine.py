"""Shared, lazily-loaded Whisper engine (one model for all cameras)."""
from __future__ import annotations

import sys
import threading
from typing import Optional

from .binaries import pip_install_command
from .config import WHISPER_MODEL


class WhisperEngine:
    """`state` distinguishes:
      - "package_missing"  -> faster-whisper is not installed in THIS interpreter
      - "model_error"      -> package present but model download/load failed
      - "ready" / "idle"   -> usable
    """

    def __init__(self) -> None:
        self.model = None
        self.available = False
        self.state = "idle"
        self.error: Optional[str] = None
        self.lock = threading.Lock()
        try:
            from faster_whisper import WhisperModel  # noqa: F401
            self.available = True
        except Exception as exc:
            self.available = False
            self.state = "package_missing"
            self.error = (
                f"faster-whisper is not installed in this Python ({sys.executable}): {exc}. "
                f"Install it into the SAME interpreter with:  {pip_install_command()}"
            )

    def load(self):
        if self.model is not None:
            return self.model
        with self.lock:
            if self.model is None:
                from faster_whisper import WhisperModel
                try:
                    self.model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
                    self.error = None
                    self.state = "ready"
                except Exception as exc:
                    self.state = "model_error"
                    self.error = (
                        f"Whisper model '{WHISPER_MODEL}' could not be loaded/downloaded: {exc}. "
                        "The first run needs internet access to fetch the model; "
                        "set MSD_WHISPER_MODEL=tiny for a smaller download."
                    )
                    raise RuntimeError(self.error) from exc
        return self.model

    def transcribe(self, wav_path: str) -> str:
        if not self.available:
            return ""
        model = self.load()
        with self.lock:
            segments, _info = model.transcribe(wav_path, language="en", vad_filter=True)
            return " ".join(seg.text.strip() for seg in segments).strip()


WHISPER = WhisperEngine()
