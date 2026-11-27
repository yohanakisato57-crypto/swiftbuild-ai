import { createClient } from '@supabase/supabase-js';
import type { Project } from './generator';

export const FREE_CREDITS = 15;

export interface Account {
  id: string;
  email: string;
  name: string;
  credits: number;
  provider: 'email' | 'google';
}

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(URL, KEY);

// Remember an invite code from /signup?ref=<id> until the visitor has an account.
try {
  const r = new URLSearchParams(window.location.search).get('ref');
  if (r && /^[0-9a-f-]{36}$/i.test(r)) localStorage.setItem('sb_ref', r);
} catch { /* ignore */ }

export async function loadReferralStats(): Promise<{ friends: number; credits: number }> {
  const { data } = await supabase.from('referral_rewards').select('credits');
  const rows = data || [];
  return { friends: rows.length, credits: rows.reduce((a, r) => a + (r.credits as number), 0) };
}

type Reply<T> = T & { error?: string; status?: number; stopped?: boolean };

// Optional permanent build server. When set, builds run there instead of on Supabase.
const WORKER = ((import.meta.env.VITE_BUILD_WORKER_URL as string) || '').replace(/\/+$/, '');

async function fn<T>(name: string, body: unknown, query = ''): Promise<Reply<T>> {
  const { data: s } = await supabase.auth.getSession();
  try {
    const target = name === 'build-app' && WORKER ? WORKER : `${URL}/functions/v1/${name}${query}`;
    // keepalive lets the start request finish even if the user leaves the page right away.
    const res = await fetch(target, {
      method: 'POST',
      keepalive: name === 'build-app' && (body as { action?: string })?.action === 'start',
      headers: {
        'content-type': 'application/json',
        apikey: KEY,
        Authorization: `Bearer ${s.session?.access_token || KEY}`,
      },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    let data: any;
    try { data = JSON.parse(raw); } catch { data = { error: raw.trim().slice(0, 400) || 'Server unavailable.' }; }
    if (!res.ok && !data.error) data.error = data.message || `Request failed (HTTP ${res.status}).`;
    if (typeof data.error === 'object') data.error = data.error?.message || JSON.stringify(data.error);
    data.status = res.status;
    return data;
  } catch (e) {
    const msg = (e as Error)?.message || '';
    const host = name === 'build-app' && WORKER ? WORKER : 'the server';
    return {
      error: `Could not reach ${host}${msg ? ` (${msg})` : ''}. This is usually a CORS block (check ALLOWED_ORIGIN on the Render worker), the worker is waking up or down, or you are offline.`,
      status: 0,
    } as Reply<T>;
  }
}

/** Compatibility wrapper: maps the app's calls onto Supabase Edge Functions. */
export async function api<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown } = {}): Promise<Reply<T>> {
  const b = (init.body || {}) as Record<string, unknown>;
  if (path === '/api/generate') return fn<T>('generate', b);
  if (path === '/api/pay/order') return fn<T>('pesapal', { action: 'order', packId: b.packId, origin: window.location.origin });
  if (path.startsWith('/api/pay/verify')) {
    const ref = new URLSearchParams(path.split('?')[1] || '').get('ref') || '';
    return fn<T>('pesapal', { action: 'verify', ref });
  }
  return { error: 'Unknown route.' } as Reply<T>;
}

async function loadAccount(): Promise<Account | null> {
  const { data: s } = await supabase.auth.getSession();
  const u = s.session?.user;
  if (!u) return null;
  const pending = localStorage.getItem('sb_ref');
  if (pending) {
    await supabase.rpc('claim_referral', { p_ref: pending });
    localStorage.removeItem('sb_ref');
  }
  const { data } = await supabase.from('profiles').select('email,name,credits,provider').eq('id', u.id).maybeSingle();
  if (!data) return { id: u.id, email: u.email || '', name: 'Builder', credits: 0, provider: 'email' };
  return { id: u.id, email: data.email, name: data.name, credits: data.credits, provider: data.provider === 'google' ? 'google' : 'email' };
}

export async function signUp(email: string, password: string): Promise<Account> {
  const d = await fn<{ ok: boolean }>('auth-signup', { email, password });
  if (d.error) throw new Error(d.error);
  return signIn(email, password);
}

export async function signIn(email: string, password: string): Promise<Account> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw new Error('Incorrect email or password.');
  const a = await loadAccount();
  if (!a) throw new Error('Could not load your account.');
  return a;
}

export async function signInWithGoogle(): Promise<Account> {
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/' } });
  if (error) throw new Error(error.message);
  return new Promise<Account>(() => undefined); // browser redirects to Google
}

export const getSession = loadAccount;

export async function signOut() {
  await supabase.auth.signOut();
}

/** Deduct credits in the database. Returns the new balance, or null if the balance is too low. */
export async function chargeCredits(amount: number, reason: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('spend_credits', { p_amount: amount, p_reason: reason });
  if (error) throw new Error(error.message);
  return data === null || data === undefined ? null : (data as number);
}

export async function loadProjects(): Promise<Project[]> {
  const { data } = await supabase.from('projects').select('id,title,mode,files,created_at').order('id', { ascending: false }).limit(100);
  return (data || []).map((p) => ({ id: p.id, title: p.title, mode: p.mode, files: p.files, createdAt: p.created_at })) as Project[];
}

export interface ActiveJob { id: string; session_id: string | null; title: string | null; prompt: string; stage: string | null; created_at: string; updated_at: string }

/** Background builds still running (read live from Supabase). */
export async function loadActiveJobs(): Promise<ActiveJob[]> {
  const since = new Date(Date.now() - 6 * 3600_000).toISOString();
  const { data } = await supabase
    .from('build_jobs')
    .select('id,session_id,title,prompt,stage,created_at,updated_at')
    .in('status', ['queued', 'planning', 'writing'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);
  return (data as ActiveJob[]) || [];
}

/** Permanently deletes a project row. Returns an error message, or null on success. */
export async function deleteProject(id: number | string): Promise<string | null> {
  const { error, count } = await supabase.from('projects').delete({ count: 'exact' }).eq('id', id);
  if (error) return error.message;
  return count === 0 ? 'Project was not found.' : null;
}

/** Plain JSON call to /generate (used for the free clarifying-questions step). */
export async function invokeGenerate<T>(body: Record<string, unknown>): Promise<T & { error?: string }> {
  const { data: s } = await supabase.auth.getSession();
  try {
    const res = await fetch(`${URL}/functions/v1/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: KEY, Authorization: `Bearer ${s.session?.access_token || KEY}` },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    return d as T & { error?: string };
  } catch {
    return { error: 'Network error.' } as T & { error?: string };
  }
}

export interface BuildJob {
  id: string;
  status: 'queued' | 'planning' | 'writing' | 'done' | 'error';
  stage: string | null;
  current_step?: string | null;
  agent_status?: { state?: Record<string, string>; msg?: Record<string, string>; delivery?: Record<string, string> } | null;
  title: string | null;
  total_files: number;
  done_files: number;
  cost: number;
  owed_credits?: number;
  error: string | null;
  project_id: number | string | null;
}

/** Pays the credits owed for a finished-but-locked project and returns its files. */
export async function unlockBuild(jobId: string): Promise<{ files?: { name: string; lang: string; content: string }[]; credits?: number; owed?: number; status?: number; error?: string }> {
  return fn('build-app', { action: 'unlock', jobId }) as Promise<{ files?: { name: string; lang: string; content: string }[]; credits?: number; owed?: number; status?: number; error?: string }>;
}
export interface BuildFile {
  idx: number;
  name: string;
  lang: string;
  purpose: string | null;
  status: 'pending' | 'writing' | 'done';
  content: string | null;
}

/** Starts a background build. Returns at once with a job id; the work continues on the server. */
export async function startBuild(body: Record<string, unknown>): Promise<{ jobId?: string; error?: string; status?: number }> {
  const d = await fn<{ jobId?: string }>('build-app', { action: 'start', ...body });
  return d as { jobId?: string; error?: string; status?: number };
}

/** Asks the server to continue a build whose worker stopped. Safe to call repeatedly. */
export async function resumeBuild(jobId: string, force = false): Promise<{ resumed?: boolean; alive?: boolean; error?: string }> {
  return fn<{ resumed?: boolean }>('build-app', { action: 'resume', jobId, force }) as Promise<{ resumed?: boolean; alive?: boolean; error?: string }>;
}

/** Reads the job and every file written so far. Safe to call repeatedly. */
export async function pollBuild(jobId: string): Promise<{ job?: BuildJob; files?: BuildFile[]; error?: string }> {
  return fn<{ job?: BuildJob; files?: BuildFile[] }>('build-app', { action: 'status', jobId }) as Promise<{ job?: BuildJob; files?: BuildFile[]; error?: string }>;
}

/** Streams /generate: onDelta gets text as it is written; resolves with the final result. */
export async function streamGenerate<T>(body: Record<string, unknown>, onDelta: (t: string) => void, signal?: AbortSignal): Promise<Reply<T>> {
  const { data: s } = await supabase.auth.getSession();
  try {
    const res = await fetch(`${URL}/functions/v1/generate`, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', apikey: KEY, Authorization: `Bearer ${s.session?.access_token || KEY}` },
      body: JSON.stringify(body),
    });
    if (!(res.headers.get('content-type') || '').includes('text/event-stream') || !res.body) {
      const d = await res.json().catch(() => ({ error: 'Server unavailable.' }));
      d.status = res.status;
      if (!res.ok && !d.error) d.error = 'Request failed.';
      return d;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let result: Reply<T> | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 2);
        if (!line.startsWith('data:')) continue;
        try {
          const ev = JSON.parse(line.slice(5));
          if (ev.d) onDelta(ev.d as string);
          else result = ev as Reply<T>;
        } catch { /* ignore */ }
      }
    }
    return result || ({ error: 'The connection ended early. Please try again.' } as Reply<T>);
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') return { error: 'Stopped.', status: 499, stopped: true } as unknown as Reply<T>;
    return { error: 'Network error. Check your connection.', status: 0 } as Reply<T>;
  }
}

export async function saveProject(p: Project, prompt: string, cost: number) {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return;
  await supabase.from('projects').insert({ user_id: uid, title: p.title, mode: p.mode, files: p.files, prompt, cost });
}
