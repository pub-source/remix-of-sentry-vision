import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Users, Database, Download, ShieldAlert, FileJson, FileSpreadsheet, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type Tab = 'users' | 'sessions' | 'feedback' | 'export';

interface FeedbackRow {
  id: string;
  household_id: string | null;
  event_type: string;
  label: string;
  confidence: number | null;
  audio_event: string | null;
  sub_label: string | null;
  raw_scores: unknown;
  visual_context: unknown;
  created_at: string;
}

export default function Admin() {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('feedback');
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [sessions, setSessions] = useState<Record<string, unknown>[]>([]);
  const [members, setMembers] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  // Role check via has_role RPC (falls back to direct table)
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    (async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      setIsAdmin(!!data);
    })();
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    setBusy(true);
    (async () => {
      const [fb, sess, mem] = await Promise.all([
        supabase.from('detection_feedback').select('*').order('created_at', { ascending: false }).limit(1000),
        supabase.from('detection_sessions').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('household_members').select('*').limit(500),
      ]);
      setFeedback((fb.data ?? []) as FeedbackRow[]);
      setSessions(sess.data ?? []);
      setMembers(mem.data ?? []);
      setBusy(false);
    })();
  }, [isAdmin]);

  const filteredFeedback = useMemo(
    () => filter === 'all' ? feedback : feedback.filter(f => f.event_type === filter),
    [feedback, filter],
  );
  const eventTypes = useMemo(
    () => Array.from(new Set(feedback.map(f => f.event_type))).sort(),
    [feedback],
  );

  if (loading || isAdmin === null) {
    return <CenterMsg><Loader2 className="w-6 h-6 animate-spin text-primary" /></CenterMsg>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) {
    return (
      <CenterMsg>
        <ShieldAlert className="w-10 h-10 text-destructive" />
        <h2 className="text-xl font-bold">Admin access required</h2>
        <p className="text-base text-muted-foreground max-w-md text-center">
          Your account is not marked as admin. Ask an existing admin to add you via the <code className="font-mono text-sm">user_roles</code> table.
        </p>
        <Link to="/" className="text-primary hover:underline">Back to home</Link>
      </CenterMsg>
    );
  }

  function download(name: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportJSON() {
    download(`msds-labeled-${Date.now()}.json`, JSON.stringify(feedback, null, 2), 'application/json');
  }
  function exportCSV() {
    const headers = ['id','household_id','event_type','label','sub_label','confidence','audio_event','created_at'];
    const rows = feedback.map(f =>
      headers.map(h => JSON.stringify((f as any)[h] ?? '')).join(',')
    );
    download(`msds-labeled-${Date.now()}.csv`, [headers.join(','), ...rows].join('\n'), 'text/csv');
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" /><span>Back</span>
          </Link>
          <h1 className="text-xl font-bold flex items-center gap-2"><Database className="w-5 h-5 text-primary" /> Data Admin</h1>
          <span className="text-sm text-muted-foreground">{user.email}</span>
        </div>
      </header>

      <nav className="max-w-6xl mx-auto px-6 pt-6 flex gap-2 flex-wrap">
        {(['feedback','sessions','users','export'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-base font-medium capitalize ${
              tab === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'feedback' ? 'Labeled data' : t}
          </button>
        ))}
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {busy && <p className="text-sm text-muted-foreground">Loading...</p>}

        {tab === 'feedback' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Filter:</span>
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1 rounded-full text-sm ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
                >all ({feedback.length})</button>
                {eventTypes.map(t => (
                  <button
                    key={t}
                    onClick={() => setFilter(t)}
                    className={`px-3 py-1 rounded-full text-sm ${filter === t ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
                  >{t}</button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                Showing {filteredFeedback.length} labeled sample(s)
              </p>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">When</th>
                    <th className="text-left px-3 py-2">Event</th>
                    <th className="text-left px-3 py-2">Sub</th>
                    <th className="text-left px-3 py-2">Label</th>
                    <th className="text-left px-3 py-2">Conf</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFeedback.slice(0, 300).map(f => (
                    <tr key={f.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{new Date(f.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2">{f.event_type}</td>
                      <td className="px-3 py-2 text-muted-foreground">{f.sub_label ?? '—'}</td>
                      <td className={`px-3 py-2 font-semibold ${f.label === 'correct' ? 'text-success' : 'text-destructive'}`}>{f.label}</td>
                      <td className="px-3 py-2 font-mono text-xs">{f.confidence?.toFixed(2) ?? '—'}</td>
                    </tr>
                  ))}
                  {filteredFeedback.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No labeled data yet. Feedback thumbs on the dashboard will appear here.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'sessions' && (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-muted-foreground">
                <tr><th className="text-left px-3 py-2">Session ID</th><th className="text-left px-3 py-2">Started</th><th className="text-left px-3 py-2">Household</th></tr>
              </thead>
              <tbody>
                {sessions.map((s: any) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">{s.id?.slice(0, 8)}...</td>
                    <td className="px-3 py-2">{new Date(s.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-xs">{s.household_id?.slice(0, 8)}...</td>
                  </tr>
                ))}
                {sessions.length === 0 && <tr><td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">No sessions yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'users' && (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-muted-foreground">
                <tr><th className="text-left px-3 py-2">User ID</th><th className="text-left px-3 py-2">Household</th><th className="text-left px-3 py-2">Role</th></tr>
              </thead>
              <tbody>
                {members.map((m: any) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">{m.user_id?.slice(0, 8)}...</td>
                    <td className="px-3 py-2 font-mono text-xs">{m.household_id?.slice(0, 8)}...</td>
                    <td className="px-3 py-2">{m.role ?? '—'}</td>
                  </tr>
                ))}
                {members.length === 0 && <tr><td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">No household members visible.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'export' && (
          <div className="grid md:grid-cols-2 gap-4">
            <button onClick={exportJSON} className="flex items-center gap-3 p-6 rounded-2xl border border-border bg-card hover:border-primary transition text-left">
              <FileJson className="w-8 h-8 text-primary" />
              <div>
                <h3 className="text-lg font-bold">Export JSON</h3>
                <p className="text-sm text-muted-foreground">Full labeled corpus ({feedback.length} rows) with raw_scores + visual_context.</p>
              </div>
            </button>
            <button onClick={exportCSV} className="flex items-center gap-3 p-6 rounded-2xl border border-border bg-card hover:border-primary transition text-left">
              <FileSpreadsheet className="w-8 h-8 text-primary" />
              <div>
                <h3 className="text-lg font-bold">Export CSV</h3>
                <p className="text-sm text-muted-foreground">Flat table for spreadsheets, pandas, or scikit-learn ingestion.</p>
              </div>
            </button>
            <div className="md:col-span-2 rounded-2xl border border-dashed border-border p-6">
              <div className="flex items-start gap-3">
                <Download className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div className="space-y-1">
                  <p className="text-base font-semibold">How to use this data</p>
                  <p className="text-sm text-muted-foreground">
                    Each row is a user-labeled detection sample. Rows marked <span className="text-success font-semibold">correct</span> become
                    positive training examples; <span className="text-destructive font-semibold">false_positive</span> rows become hard-negative examples.
                    Point a fine-tuning script (e.g. TensorFlow / PyTorch) at the export and re-train, then swap the model URL in the corresponding hook.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function CenterMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4">{children}</div>
    </div>
  );
}
