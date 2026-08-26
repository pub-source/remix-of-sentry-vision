import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SEVERITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const apiKey = Deno.env.get('BREVO_API_KEY');
    if (!apiKey) return respond({ error: 'Email provider not configured' }, 503);

    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return respond({ error: 'Unauthorized' }, 401);

    const raw = await req.json().catch(() => null);
    if (!raw || typeof raw !== 'object') return respond({ error: 'Invalid JSON body' }, 400);

    const householdId = String((raw as any).householdId ?? '');
    const severity = String((raw as any).severity ?? 'high').toLowerCase();
    const alertType = String((raw as any).alertType ?? 'alert').slice(0, 80);
    const message = String((raw as any).message ?? '').slice(0, 2000);
    const cameraLabel = String((raw as any).cameraLabel ?? '').slice(0, 120);
    const alertId = String((raw as any).alertId ?? '').slice(0, 64);
    const trigger = String((raw as any).trigger ?? '').slice(0, 300);
    const occurredAtRaw = String((raw as any).occurredAt ?? '');
    const occurredAt = occurredAtRaw && !Number.isNaN(Date.parse(occurredAtRaw))
      ? new Date(occurredAtRaw)
      : new Date();
    const confidence = Number((raw as any).confidence);
    const saliencyScore = Number((raw as any).saliencyScore);
    const rawDetails = (raw as any).details;
    const details: [string, string][] =
      rawDetails && typeof rawDetails === 'object' && !Array.isArray(rawDetails)
        ? Object.entries(rawDetails).slice(0, 20).map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 200)])
        : [];

    if (!/^[0-9a-f-]{36}$/i.test(householdId)) return respond({ error: 'householdId must be a valid id' }, 400);
    if (!(severity in SEVERITY_RANK)) return respond({ error: 'Invalid severity' }, 400);
    if (!message.trim()) return respond({ error: 'message is required' }, 400);


    // Membership check — RLS-scoped read
    const { data: settings, error: settingsErr } = await supabase
      .from('notification_settings')
      .select('email_enabled, severity_threshold')
      .eq('household_id', householdId)
      .maybeSingle();
    if (settingsErr) return respond({ error: settingsErr.message }, 403);
    if (!settings?.email_enabled) return respond({ sent: false, reason: 'email_disabled' });
    if (SEVERITY_RANK[severity] < SEVERITY_RANK[settings.severity_threshold ?? 'high']) {
      return respond({ sent: false, reason: 'below_threshold' });
    }

    const { data: recipients } = await supabase
      .from('notification_recipients')
      .select('email')
      .eq('household_id', householdId)
      .eq('enabled', true);

    const to = (recipients ?? [])
      .map((r) => String(r.email).trim())
      .filter((e) => EMAIL_RE.test(e))
      .slice(0, 25)
      .map((email) => ({ email }));

    if (!to.length) return respond({ sent: false, reason: 'no_recipients' });

    const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL') ?? 'alerts@msds-sentry.app';
    const senderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'MSDS Sentry Vision';
    const subject = `[${severity.toUpperCase()}] ${alertType}${cameraLabel ? ` — ${cameraLabel}` : ''}`;

    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to,
        subject: subject.slice(0, 200),
        htmlContent: `<div style="font-family:Inter,Arial,sans-serif;font-size:16px;line-height:1.6">
          <h2 style="margin:0 0 12px">${escapeHtml(alertType)}</h2>
          <p style="margin:0 0 8px"><strong>Severity:</strong> ${escapeHtml(severity.toUpperCase())}</p>
          ${cameraLabel ? `<p style="margin:0 0 8px"><strong>Camera:</strong> ${escapeHtml(cameraLabel)}</p>` : ''}
          <p style="margin:0 0 8px"><strong>Time:</strong> ${new Date().toISOString()}</p>
          <p style="margin:16px 0 0;padding:12px;background:#f5f5f5;border-radius:8px">${escapeHtml(message)}</p>
        </div>`,
      }),
    });

    if (!res.ok) {
      const details = await res.text();
      console.error(`Brevo request failed [${res.status}]: ${details}`);
      return respond({ error: 'Email provider request failed', status: res.status, details }, res.status);
    }

    const result = await res.json();
    return respond({ sent: true, recipients: to.length, messageId: result?.messageId ?? null });
  } catch (e) {
    console.error('send-alert-email error:', e instanceof Error ? e.message : String(e));
    return respond({ error: 'Unexpected error sending alert email' }, 500);
  }
});
