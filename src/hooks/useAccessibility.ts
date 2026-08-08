import { useCallback, useEffect, useState } from 'react';
import { setVoiceGuide } from '@/lib/voiceGuide';

const FONT_KEY = 'safewatch-font-scale';
const HC_KEY = 'safewatch-high-contrast';
const VOICE_KEY = 'safewatch-voice-guide';

export const MIN_SCALE = 85;
export const MAX_SCALE = 160;
export const DEFAULT_SCALE = 100;

export function readFontScale(): number {
  const raw = Number(localStorage.getItem(FONT_KEY));
  if (!raw || Number.isNaN(raw)) return DEFAULT_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
}

export function readHighContrast(): boolean {
  return localStorage.getItem(HC_KEY) === 'true';
}

export function applyFontScale(scale: number) {
  // base is 16px (set in index.css); scale it proportionally
  document.documentElement.style.fontSize = `${(16 * scale) / 100}px`;
}


export function applyHighContrast(on: boolean) {
  document.documentElement.classList.toggle('hc', on);
}

/** Applies stored accessibility settings as early as possible. */
export function initAccessibility() {
  applyFontScale(readFontScale());
  applyHighContrast(readHighContrast());
}

export function useAccessibility() {
  const [fontScale, setFontScaleState] = useState(readFontScale);
  const [highContrast, setHighContrastState] = useState(readHighContrast);

  useEffect(() => {
    applyFontScale(fontScale);
    localStorage.setItem(FONT_KEY, String(fontScale));
  }, [fontScale]);

  useEffect(() => {
    applyHighContrast(highContrast);
    localStorage.setItem(HC_KEY, String(highContrast));
  }, [highContrast]);

  const setFontScale = useCallback((v: number) => {
    setFontScaleState(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(v))));
  }, []);

  const reset = useCallback(() => setFontScaleState(DEFAULT_SCALE), []);

  return { fontScale, setFontScale, highContrast, setHighContrast: setHighContrastState, reset };
}
