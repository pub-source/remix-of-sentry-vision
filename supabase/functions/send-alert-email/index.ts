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
    const snapshotInfo = String((raw as any).snapshotInfo ?? '').slice(0, 300);
    const snapshotDataUrl = String((raw as any).snapshotDataUrl ?? '');
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

    const SEV_COLOR: Record<string, string> = {
      low: '#2563eb', medium: '#d97706', high: '#ea580c', critical: '#dc2626',
    };
    const accent = SEV_COLOR[severity] ?? '#dc2626';

    const rows: [string, string][] = [
      ['Severity', severity.toUpperCase()],
      ['Detection', alertType],
      ...(cameraLabel ? [['Camera', cameraLabel] as [string, string]] : []),
      ['Detected at (UTC)', occurredAt.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')],
      ...(Number.isFinite(confidence) ? [['Model confidence', `${Math.round(confidence * 100)}%`] as [string, string]] : []),
      ...(Number.isFinite(saliencyScore) ? [['Saliency score', `${Math.round(saliencyScore)}/100`] as [string, string]] : []),
      ...(trigger ? [['Trigger', trigger] as [string, string]] : []),
      ...(snapshotInfo ? [['Snapshot', snapshotInfo] as [string, string]] : []),
      ...details,
      ...(alertId ? [['Alert ID', alertId] as [string, string]] : []),
    ];

    const rowsHtml = rows
      .map(([k, v], i) => `<tr style="background:${i % 2 ? '#ffffff' : '#f7f8fa'}">
            <td style="padding:8px 12px;color:#475569;white-space:nowrap">${escapeHtml(k)}</td>
            <td style="padding:8px 12px;color:#0f172a;font-weight:600">${escapeHtml(v)}</td>
          </tr>`)
      .join('');

    const htmlContent = `<div style="font-family:Inter,Arial,sans-serif;font-size:16px;line-height:1.6;color:#0f172a;max-width:640px">
          <div style="border-left:6px solid ${accent};padding:4px 0 4px 14px;margin-bottom:16px">
            <h2 style="margin:0;font-size:22px">${escapeHtml(alertType)}</h2>
            <p style="margin:4px 0 0;color:${accent};font-weight:700;letter-spacing:.04em">${escapeHtml(severity.toUpperCase())} PRIORITY ALERT</p>
          </div>
          <p style="margin:0 0 16px;padding:14px;background:#f1f5f9;border-radius:10px;font-size:17px">${escapeHtml(message)}</p>
          <table style="border-collapse:collapse;width:100%;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;font-size:15px">
            ${rowsHtml}
          </table>
          <p style="margin:18px 0 0;font-size:13px;color:#64748b">
            Sent automatically by MSDS Sentry Vision. Repeated alerts of the same type are grouped
            for a few minutes to avoid flooding your inbox. Manage recipients and the severity
            threshold on the Household page.
          </p>
        </div>`;

    // Attach only a bounded, well-formed image. The report always sends even
    // when capture is unavailable, cross-origin tainted, or too large.
    const snapshotMatch = snapshotDataUrl.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
    const attachment = snapshotMatch && snapshotMatch[2].length <= 1_400_000
      ? [{ name: `alert-${alertId || occurredAt.getTime()}.${snapshotMatch[1] === 'jpeg' ? 'jpg' : 'png'}`, content: snapshotMatch[2] }]
      : undefined;

    const textContent = rows.map(([key, value]) => `${key}: ${value}`).join('\n');
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to,
        subject: subject.slice(0, 200),
        htmlContent,
        textContent: `${message}\n\n${textContent}`,
        ...(attachment ? { attachment } : {}),
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
