import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioEvents } from '@/lib/multiCamServer';

/**
 * Speech coming from the CCTV camera itself.
 *
 * The laptop microphone is never used here — the backend transcribes the
 * camera's RTSP audio with Whisper and we poll those transcripts.
 */
export function useCctvSpeech(server: string, cameraId: string, enabled: boolean) {
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const sinceRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!enabled) { setListening(false); return; }
    let cancelled = false;
    setListening(true);

    const tick = async () => {
      try {
        const res = await getAudioEvents(server, cameraId, sinceRef.current);
        const events = res?.events ?? [];
        if (cancelled || !events.length) return;
        sinceRef.current = events[events.length - 1].timestamp;
        const text = events.map(e => e.transcript).filter(Boolean).join(' ').trim();
        if (text) setTranscript(prev => `${prev} ${text}`.trim().slice(-600));
      } catch {
        /* backend not reachable yet — keep polling */
      }
    };

    void tick();
    const id = window.setInterval(tick, 1500);
    return () => { cancelled = true; setListening(false); window.clearInterval(id); };
  }, [server, cameraId, enabled]);

  const clear = useCallback(() => setTranscript(''), []);

  return { transcript, listening, clear };
}
