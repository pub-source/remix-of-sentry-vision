import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Adaptive threshold multipliers derived from per-household feedback.
 *
 * Idea: when users flag too many false positives on a given event_type,
 * raise the confidence gate locally so the same signal has to be stronger
 * to trigger again. When users confirm correct detections, keep the gate
 * where it is (or slightly lower it if lots of "correct" and no FPs).
 *
 * This is a lightweight "learn from deployment" loop that runs entirely
 * client-side — it does not re-train the underlying neural nets.
 */
export interface AdaptiveThresholds {
  fireMultiplier: number;         // multiply fire confidence threshold
  faceDistressMultiplier: number; // multiply face distress score threshold
  audioMultiplier: number;        // multiply YAMNet class score threshold
  sampleSize: number;
}

const DEFAULT: AdaptiveThresholds = {
  fireMultiplier: 1,
  faceDistressMultiplier: 1,
  audioMultiplier: 1,
  sampleSize: 0,
};

function deriveMultiplier(correct: number, wrong: number): number {
  const total = correct + wrong;
  if (total < 3) return 1;
  const fpRate = wrong / total;
  // 0% FPs -> 0.9x (a bit more sensitive)
  // 50% FPs -> 1.25x (needs stronger signal)
  // 80%+ FPs -> 1.6x (much stricter)
  if (fpRate < 0.1) return 0.9;
  if (fpRate < 0.3) return 1.0;
  if (fpRate < 0.5) return 1.15;
  if (fpRate < 0.75) return 1.35;
  return 1.6;
}

export function useAdaptiveThresholds(householdId: string | null) {
  const [thresholds, setThresholds] = useState<AdaptiveThresholds>(DEFAULT);

  useEffect(() => {
    if (!householdId) { setThresholds(DEFAULT); return; }

    let cancelled = false;
    const cacheKey = `adaptive-thresholds-${householdId}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try { setThresholds(JSON.parse(cached)); } catch {}
    }

    async function refresh() {
      const { data, error } = await supabase
        .from('detection_feedback')
        .select('event_type,label')
        .eq('household_id', householdId!)
        .order('created_at', { ascending: false })
        .limit(500);
      if (cancelled || error || !data) return;

      const buckets: Record<string, { correct: number; wrong: number }> = {};
      for (const row of data) {
        const t = row.event_type as string;
        buckets[t] ??= { correct: 0, wrong: 0 };
        if (row.label === 'correct') buckets[t].correct++;
        else if (row.label === 'false_positive') buckets[t].wrong++;
      }

      const fire = buckets['fire'] || { correct: 0, wrong: 0 };
      const smoke = buckets['smoke_emergency'] || { correct: 0, wrong: 0 };
      const face = buckets['facial_distress'] || { correct: 0, wrong: 0 };
      const audio = buckets['audio_scream'] || { correct: 0, wrong: 0 };

      const next: AdaptiveThresholds = {
        fireMultiplier: deriveMultiplier(fire.correct + smoke.correct, fire.wrong + smoke.wrong),
        faceDistressMultiplier: deriveMultiplier(face.correct, face.wrong),
        audioMultiplier: deriveMultiplier(audio.correct, audio.wrong),
        sampleSize: data.length,
      };
      setThresholds(next);
      sessionStorage.setItem(cacheKey, JSON.stringify(next));
    }

    refresh();
    const iv = setInterval(refresh, 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [householdId]);

  return thresholds;
}
