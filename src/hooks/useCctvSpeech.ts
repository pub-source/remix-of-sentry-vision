import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioEvents, type CctvAudioStatus } from '@/lib/multiCamServer';

export interface CctvSpeechDiagnostics {
  polling: boolean;
  backendReachable: boolean;
  audioConnected: boolean;
  chunksReceived: number;
  lastTranscriptionAt: string | null;
  lastTranscript: string;
  error: string | null;
}

/**
 * Speech coming from the CCTV camera itself.
 *
 * The laptop microphone is never used here — the backend transcribes the
 * camera's RTSP audio with Whisper and we poll those transcripts.
 */
export function useCctvSpeech(server: string, cameraId: string, enabled: boolean) {
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [diagnostics, setDiagnostics] = useState<CctvSpeechDiagnostics>({
    polling: false, backendReachable: false, audioConnected: false,
    chunksReceived: 0, lastTranscriptionAt: null, lastTranscript: '', error: null,
  });
  const sinceRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setListening(false);
      setDiagnostics(prev => ({ ...prev, polling: false }));
      return;
    }
    let cancelled = false;
    let inFlight = false;
    setListening(true);
    setDiagnostics(prev => ({ ...prev, polling: true, error: null }));

    const applyStatus = (status: CctvAudioStatus) => {
      setDiagnostics({
        polling: true,
        backendReachable: true,
        audioConnected: status.connected,
        chunksReceived: status.chunks_received ?? 0,
        lastTranscriptionAt: status.last_transcription_at,
        lastTranscript: status.last_transcript ?? '',
        error: status.error,
      });
    };

    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await getAudioEvents(server, cameraId, sinceRef.current);
        if (cancelled) return;
        applyStatus(res.status);
        const events = res?.events ?? [];
        if (!events.length) return;
        sinceRef.current = events[events.length - 1].timestamp;
        const text = events.map(e => e.transcript).filter(Boolean).join(' ').trim();
        if (text) {
          console.info(`[CCTV Speech ${cameraId}]`, text);
          setTranscript(prev => `${prev} ${text}`.trim().slice(-600));
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[CCTV Speech ${cameraId}] polling failed:`, message);
          setDiagnostics(prev => ({ ...prev, polling: true, backendReachable: false, audioConnected: false, error: message }));
        }
      } finally {
        inFlight = false;
      }
    };

    void tick();
    const id = window.setInterval(tick, 1500);
    return () => { cancelled = true; setListening(false); window.clearInterval(id); };
  }, [server, cameraId, enabled]);

  const clear = useCallback(() => setTranscript(''), []);

  return { transcript, listening, clear, diagnostics };
}
