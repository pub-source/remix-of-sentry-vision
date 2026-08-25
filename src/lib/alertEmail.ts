import { supabase } from '@/integrations/supabase/client';

export type AlertSeverityLevel = 'low' | 'medium' | 'high' | 'critical';

const lastSent = new Map<string, number>();
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

export interface AlertEmailInput {
  householdId: string;
  alertType: string;
  message: string;
  severity: AlertSeverityLevel;
  cameraLabel?: string;
  cooldownMs?: number;
}

/**
 * Sends an alert email through the backend edge function.
 * The Brevo API key lives only on the server — never in this bundle.
 * Repeated alerts of the same type + camera are deduplicated by cooldown.
 */
export async function sendAlertEmail(input: AlertEmailInput): Promise<{ sent: boolean; reason?: string }> {
  const key = `${input.householdId}:${input.alertType}:${input.cameraLabel ?? ''}`;
  const cooldown = input.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < cooldown) return { sent: false, reason: 'cooldown' };
  lastSent.set(key, now);

  try {
    const { data, error } = await supabase.functions.invoke('send-alert-email', { body: input });
    if (error) {
      console.warn('[alertEmail] failed:', error.message);
      return { sent: false, reason: 'error' };
    }
    return { sent: Boolean((data as { sent?: boolean } | null)?.sent), reason: (data as { reason?: string } | null)?.reason };
  } catch (e) {
    console.warn('[alertEmail] unexpected failure:', e instanceof Error ? e.message : String(e));
    return { sent: false, reason: 'error' };
  }
}
