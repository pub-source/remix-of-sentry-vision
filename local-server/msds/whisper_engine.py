"""Shared, lazily-loaded Whisper engine (one model for all cameras)."""
from __future__ import annotations

import sys
import threading
from typing import Optional

import re

from .binaries import pip_install_command
from .config import WHISPER_MODEL

# Languages the household actually speaks. Anything else detected with low
# confidence is treated as noise rather than speech.
ALLOWED_LANGUAGES = {"en", "tl", "fil"}

# Phrases Whisper famously invents when it hears silence, hum or static.
HALLUCINATION_PATTERNS = [
    r"^there'?s? (is )?something (in|over) there\.?$",
    r"^thank(s| you)( for watching| very much)?[.!]?$",
    r"^thanks for watching[.!]?$",
    r"^please subscribe.*$",
    r"^subtitles? by.*$",
    r"^amara\.org.*$",
    r"^sub(title)?s? (by|provided).*$",
    r"^you[.!]?$",
    r"^bye[.!]?$",
    r"^\.*$",
    r"^(mm+|hm+|uh+|ah+|oh+)[.!]?$",
    r"^\[.*\]$",
    r"^\(.*\)$",
    r"^♪+.*♪*$",
    r"^salamat sa panonood.*$",
    r"^mag-?subscribe.*$",
]
_HALLUCINATION_RE = [re.compile(p, re.IGNORECASE) for p in HALLUCINATION_PATTERNS]


def is_hallucination(text: str) -> bool:
    stripped = text.strip()
    if len(stripped) < 2:
        return True
    return any(rx.match(stripped) for rx in _HALLUCINATION_RE)


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
        """Multilingual (English + Tagalog) transcription with hallucination guards.

        Whisper invents filler sentences on silence/noise, so we run a strict VAD,
        drop low-confidence / high no-speech segments, and filter known phantom
        phrases before returning anything.
        """
        if not self.available:
            return ""
        model = self.load()
        with self.lock:
            segments, info = model.transcribe(
                wav_path,
                language=None,              # auto-detect (Tagalog, English, ...)
                task="transcribe",          # never translate — keep "tulong" as "tulong"
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 400, "threshold": 0.6},
                condition_on_previous_text=False,  # stops repeat/echo hallucinations
                no_speech_threshold=0.5,
                log_prob_threshold=-0.8,
                temperature=0.0,
                beam_size=5,
            )
            lang = getattr(info, "language", "") or ""
            lang_prob = getattr(info, "language_probability", 1.0) or 0.0
            # Unrecognisable audio usually detects as a random language with low
            # confidence — that is where the phantom sentences come from.
            if lang not in ALLOWED_LANGUAGES and lang_prob < 0.6:
                return ""

            kept = []
            for seg in segments:
                text = (seg.text or "").strip()
                if not text:
                    continue
                if getattr(seg, "no_speech_prob", 0.0) > 0.6:
                    continue
                if getattr(seg, "avg_logprob", 0.0) < -1.0:
                    continue
                if is_hallucination(text):
                    continue
                kept.append(text)
            return " ".join(kept).strip()


WHISPER = WhisperEngine()
