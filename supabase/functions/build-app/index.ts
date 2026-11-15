import { admin, cors, json, userFrom } from './util.ts';
import { collectCompletion, looksComplete, parseJsonStrict, stripFence } from './sse.ts';

// Modular, RESUMABLE build pipeline. Step 1 plans a list of small files. Step 2 generates
// each file in its own short model call and saves it to Supabase as it finishes.
// The work is split into time slices: when a slice's budget is used up the function
// hands over to a fresh invocation, and if a worker is ever killed the client (or the
// next poll) resumes from the files already saved. Finished files are never rewritten.

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const MODEL_DEFAULT = 'gpt-6.1-sol';

const PLAN_SYSTEM = `You are SwiftBuild AI's architect. Break the user's request into a SMALL set of separate files (strictly 3 to 4 files, never more), so each file can be written on its own. Good examples: index.html, styles.css, app.js, components like Sidebar.js, GameBoard.js, PricingCard.js, GameLogic.js, data.js. Keep each file focused on one job. Plain HTML/CSS/vanilla JavaScript only, no build tools, no npm. Reply ONLY JSON: {"title": string (max 5 words), "files": [{"name": string, "lang": "html"|"css"|"js", "purpose": string (one sentence)}]}. The first file must be index.html, which loads every other file (CSS via <link>, JS via <script src>).`;

const FILE_SYSTEM = `You are SwiftBuild AI, an expert front-end engineer. Write ONE complete file for the project described. The file must be real, working, polished and responsive, with real specific content for the user's request, never lorem ipsum, never a placeholder. Other files in the same project are listed for context; reference them by exact name. Reply with ONLY the raw complete file text: no JSON, no markdown fences, no commentary. Keep the file compact (under about 100 lines, concise code, no comments) so it finishes within seconds. For data files (products, items, lists) include at most 8 short entries with compact one-line objects.`;

const IDLE_MS = 25_000; // abort if the stream goes silent
const TOTAL_MS = 65_000; // hard cap per model call (3 attempts must never outlive one worker)
const SLICE_MS = 55_000; // start no new file after this long in one invocation
const STALE_MS = 30_000; // no heartbeat for this long = the worker died

/** Streams one completion and returns the COMPLETE text. Throws if the stream is
 *  interrupted, truncated (finish_reason "length"), errored or empty. */
async function streamText(key: string, model: string, system: string, user: string, maxTokens: number, json: boolean): Promise<string> {
  const ctl = new AbortController();
  let idle: ReturnType<typeof setTimeout> | undefined;
  const bump = () => { clearTimeout(idle); idle = setTimeout(() => ctl.abort(new Error('The AI stopped responding (timeout).')), IDLE_MS); };
  const total = setTimeout(() => ctl.abort(new Error('The AI took too long (timeout).')), TOTAL_MS);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    bump();
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        stream: true,
        prompt_cache_key: 'swiftbuild-build-files',
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        max_completion_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!r.ok || !r.body) {
      const d = await r.json().catch(() => ({}));
      throw new Error(`OpenAI error: ${d?.error?.message || r.status}`);
    }
    reader = r.body.getReader();
    const rd = reader;
    async function* chunks() {
      for (;;) {
        const { done, value } = await rd.read();
        if (done) return;
        bump();
        if (value) yield value;
      }
    }
    const { text } = await collectCompletion(chunks());
    return text;
  } catch (e) {
    const reason = ctl.signal.aborted ? ctl.signal.reason : null;
    throw reason instanceof Error ? reason : e;
  } finally {
    clearTimeout(idle);
    clearTimeout(total);
    try { await reader?.cancel(); } catch { /* already closed */ }
  }
}

/** JSON reply (planner). Parsed only after the full stream has ended. */
async function callJson(key: string, model: string, system: string, user: string, maxTokens: number): Promise<any> {
  return parseJsonStrict(await streamText(key, model, system, user, maxTokens, true));
}

/** Raw file text (no JSON wrapper, so no escaping can corrupt or truncate it). */
async function callFile(key: string, model: string, system: string, user: string, maxTokens: number): Promise<string> {
  return stripFence(await streamText(key, model, system, user, maxTokens, false));
}

const baseHtml = (title: string, extra = '') =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${title.replace(/[<>&]/g, '')}</title>\n</head>\n<body style="margin:0">\n<div id="root"></div>\n${extra}</body>\n</html>`;

/** Guarantees index.html is never empty and always has <div id="root"></div>. */
function ensureHtml(content: string, title: string): string {
  const c = (content || '').trim();
  if (!c) return baseHtml(title);
  if (/id=["']root["']/.test(c)) return c;
  if (/<body[^>]*>/i.test(c)) return c.replace(/<body[^>]*>/i, (m) => `${m}\n<div id="root"></div>`);
  return baseHtml(title, c + '\n');
}

const LANG_OF = (name: string) => (name.endsWith('.css') ? 'css' : name.endsWith('.js') ? 'js' : name.endsWith('.md') ? 'md' : 'html');
const cleanName = (n: string) => String(n).replace(/[^\w.\-\/]/g, '').slice(0, 60) || 'file.txt';

/** Credit cost from the real output: 1–2 small, scaling up to 80 for big projects. */
export function buildCost(prompt: string, files: { content: string }[]): number {
  const words = prompt.split(/\s+/).filter(Boolean).length;
  const chars = files.reduce((n, f) => n + f.content.length, 0);
  const count = files.length;
  if (count <= 3 && chars < 6000) return words <= 10 ? 1 : 2;
  const jsChars = files.reduce((n, f) => n + (/\.(js|jsx|ts|tsx)$/.test((f as { name?: string }).name || '') ? f.content.length : 0), 0);
  const raw = 1 + chars / 8000 + count * 0.3 + jsChars / 20000 + words / 150;
  return Math.max(3, Math.min(25, Math.round(raw)));
}

interface Ctx { req: Request; key: string; model: string; rules: string }

/** Runs (or resumes) a job. Everything it needs is read back from the database. */
async function runJob(jobId: string, ctx: Ctx) {
  const db = admin();
  const started = Date.now();
  const setJob = (patch: Record<string, unknown>) => db.from('build_jobs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', jobId);
  const beat = setInterval(() => { void setJob({}); }, 8000); // heartbeat: proves this worker is alive

  try {
    const { data: job } = await db.from('build_jobs').select('*').eq('id', jobId).single();
    if (!job || job.status === 'done' || job.status === 'error') return;
    const userId = job.user_id as string;
    const prompt = String(job.prompt || '');

    let { data: rows } = await db.from('build_files').select('idx,name,lang,purpose,status,content').eq('job_id', jobId).order('idx');
    let title = String(job.title || 'New project');

    // 1. Plan (only once; a resume skips this because the file rows already exist).
    if (!rows || rows.length === 0) {
      await setJob({ status: 'planning', stage: 'Planning your project' });
      let plan: any = null;
      let planErr: Error | null = null;
      for (let a = 1; a <= 2 && !plan; a++) {
        try { plan = await callJson(ctx.key, ctx.model, PLAN_SYSTEM + ctx.rules, prompt, 500); } catch (e) { planErr = e as Error; }
      }
      if (!plan) throw planErr || new Error('Planning failed.');
      const planned = (plan.files || [])
        .filter((f: any) => f && typeof f.name === 'string')
        .slice(0, 4)
        .map((f: any) => ({ name: cleanName(f.name), lang: LANG_OF(String(f.name)), purpose: String(f.purpose || '').slice(0, 200) }));
      if (!planned.some((f: { name: string }) => f.name === 'index.html')) throw new Error('The planner returned no index.html.');
      title = String(plan.title || 'New project').slice(0, 60);
      await db.from('build_files').insert(planned.map((f: any, i: number) => ({ job_id: jobId, user_id: userId, idx: i, name: f.name, lang: f.lang, purpose: f.purpose, status: 'pending', content: f.name === 'index.html' ? baseHtml(title) : null })));
      await setJob({ status: 'writing', stage: 'Writing files', title, total_files: planned.length });
      ({ data: rows } = await db.from('build_files').select('idx,name,lang,purpose,status,content').eq('job_id', jobId).order('idx'));
    } else {
      await setJob({ status: 'writing', stage: 'Resuming build' });
    }

    const all = rows || [];
    const manifest = all.map((f) => `- ${f.name}: ${f.purpose}`).join('\n');
    const written: { name: string; lang: string; content: string }[] = all
      .filter((f) => f.status === 'done' && f.content)
      .map((f) => ({ name: f.name, lang: f.lang, content: f.content as string }));

    // 2. Write every file that is not finished yet, in order.
    // Files are written IN PARALLEL (they only need the shared manifest), which is several times faster than one by one.
    let handover = false;
    const writeOne = async (f: { idx: number; name: string; lang: string; purpose: string; status: string; content: string | null }) => {
      if (f.status === 'done' && f.content) return;
      if (handover || Date.now() - started > SLICE_MS) {
        handover = true;
        return;
      }
      await db.from('build_files').update({ status: 'writing' }).eq('job_id', jobId).eq('idx', f.idx);
      await setJob({ stage: `Writing ${f.name}` });
      // Cost control: short heads of earlier files only (names/ids/styles), capped in total.
      let budget = 2400;
      const done = written.map((w) => {
        const part = w.content.slice(0, Math.min(500, Math.max(0, budget)));
        budget -= part.length;
        return part ? `--- ${w.name} (already written, start) ---\n${part}` : `--- ${w.name} (already written) ---`;
      }).join('\n\n');
      const user = `Project request: ${prompt}\n\nAll files in this project:\n${manifest}\n\nNow write the file: ${f.name}\nIts purpose: ${f.purpose}\n${done ? `\nFiles already written, for consistent names, ids and styles:\n${done}` : ''}`;
      let content = '';
      let lastErr: Error | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (attempt > 1) {
            // A worker that has run long may be killed mid-retry: hand over to a fresh one instead of dying silently.
            if (Date.now() - started > SLICE_MS) {
              await db.from('build_files').update({ status: 'pending' }).eq('job_id', jobId).eq('idx', f.idx);
              await db.from('build_jobs').update({ stage: `Continuing ${f.name}`, updated_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq('id', jobId);
              handover = true;
              return;
            }
            await setJob({ stage: `Retrying ${f.name} (attempt ${attempt}/3)` });
            await new Promise((r) => setTimeout(r, 1500 * (attempt - 1)));
          }
          const shorter = attempt > 1 ? '\n\nIMPORTANT: keep this file SHORT (under 150 lines) so it finishes fast.' : '';
          content = await callFile(ctx.key, ctx.model, FILE_SYSTEM + ctx.rules, user + shorter, attempt > 1 ? 2500 : 3200);
          if (f.name === 'index.html') content = ensureHtml(content, title);
          if (!looksComplete(f.name, content)) throw new Error(`${f.name} looks truncated or empty.`);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e as Error;
        }
      }
      if (lastErr) {
        await db.from('build_files').update({ status: 'failed' }).eq('job_id', jobId).eq('idx', f.idx);
        throw new Error(`${f.name} failed after 3 attempts: ${lastErr.message}`);
      }
      written.push({ name: f.name, lang: f.lang, content });
      await db.from('build_files').update({ content, status: 'done' }).eq('job_id', jobId).eq('idx', f.idx);
      await setJob({ done_files: written.length });
    };
    const results = await Promise.allSettled(all.map((f) => writeOne(f as any)));
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    if (failed) throw failed.reason;
    if (handover) {
      await db.from('build_jobs').update({ stage: 'Continuing', updated_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq('id', jobId);
      void selfResume(ctx.req, jobId);
      return;
    }
    written.sort((a, b) => all.findIndex((x) => x.name === a.name) - all.findIndex((x) => x.name === b.name));

    // 3. Charge the real cost atomically, then record the project.
    // If the balance is lower than the real cost, charge what the user has and still deliver the finished work (never throw it away).
    const { data: prof } = await db.from('profiles').select('credits').eq('id', userId).single();
    const cost = Math.max(0, Math.min(buildCost(prompt, written), prof?.credits ?? 0));
    if (cost > 0) {
      const { data: balance } = await db.rpc('adjust_credits', { p_user: userId, p_delta: -cost, p_reason: `Build: ${prompt.slice(0, 60)}` });
      if (balance === null || balance === undefined) throw new Error('Not enough credits. You were not charged.');
    }
    const files = written.map((w) => ({ name: w.name, lang: w.lang, content: w.content }));
    const { data: row } = await db.from('projects').insert({ user_id: userId, title, prompt, mode: 'build', files, cost }).select('id').single();
    await setJob({ status: 'done', stage: 'Finished', cost, project_id: row?.id ?? null, title });
  } catch (err) {
    const msg = (err as Error).message || 'Build failed.';
    await setJob({ status: 'error', error: msg, stage: 'Stopped' });
  } finally {
    clearInterval(beat);
  }
}

/** Calls this same function again so a new invocation (with a fresh time budget) continues the job. */
async function selfResume(req: Request, jobId: string) {
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/build-app`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: req.headers.get('authorization') || '',
        apikey: req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '',
      },
      body: JSON.stringify({ action: 'resume', jobId }),
    });
  } catch { /* the client will resume it if this call is lost */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = await userFrom(req);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) return json({ error: 'OPENAI_API_KEY is missing from Secrets.' }, 503);
  const model = Deno.env.get('OPENAI_MODEL') || MODEL_DEFAULT;

  const b = await req.json().catch(() => ({}));
  const action = String(b.action || 'start');
  const db = admin();

  const rulesFor = async () => {
    const { data: us } = await db.from('user_settings').select('custom_instructions').eq('user_id', user.id).maybeSingle();
    const custom = String(us?.custom_instructions || '').trim().slice(0, 4000);
    return custom ? `\n\nThe user's permanent custom instructions (always follow them):\n${custom}` : '';
  };
  const launch = (jobId: string, rules: string) => {
    const work = runJob(jobId, { req, key, model, rules });
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(work);
    else void work;
  };

  // Poll: the client asks for the job's status and any files written so far.
  if (action === 'status') {
    const jobId = String(b.jobId || '');
    const { data: job } = await db.from('build_jobs').select('*').eq('id', jobId).eq('user_id', user.id).maybeSingle();
    if (!job) return json({ error: 'Build not found.' }, 404);
    const { data: files } = await db.from('build_files').select('idx,name,lang,purpose,status,content').eq('job_id', jobId).order('idx');
    return json({ job, files: files || [] });
  }

  // Resume: continue a build whose worker stopped. Only one resumer can win (compare-and-set on updated_at).
  if (action === 'resume') {
    const jobId = String(b.jobId || '');
    const { data: job } = await db.from('build_jobs').select('id,status,updated_at').eq('id', jobId).eq('user_id', user.id).maybeSingle();
    if (!job) return json({ error: 'Build not found.' }, 404);
    if (job.status === 'done') return json({ resumed: false, status: job.status });
    if (job.status === 'error') {
      // Revive a stopped build: finished files are kept (and already paid for); only the failed/unfinished files are redone.
      if (!b.force) return json({ resumed: false, status: job.status });
      const { data: rows } = await db.from('build_files').select('idx').eq('job_id', jobId);
      if (!rows || rows.length === 0) return json({ resumed: false, status: 'error' });
      await db.from('build_files').update({ status: 'pending' }).eq('job_id', jobId).in('status', ['failed', 'writing']);
      await db.from('build_jobs').update({ status: 'writing', error: null, stage: 'Continuing from saved files', updated_at: new Date().toISOString() }).eq('id', jobId);
      launch(jobId, await rulesFor());
      return json({ resumed: true, revived: true });
    }
    if (Date.now() - new Date(job.updated_at).getTime() < STALE_MS) return json({ resumed: false, status: job.status, alive: true });
    const { data: claimed } = await db.from('build_jobs').update({ updated_at: new Date().toISOString(), stage: 'Resuming build' }).eq('id', jobId).eq('updated_at', job.updated_at).select('id');
    if (!claimed || claimed.length === 0) return json({ resumed: false, alive: true });
    launch(jobId, await rulesFor());
    return json({ resumed: true });
  }

  // Start a new build job and return immediately.
  const prompt = String(b.prompt || '').trim().slice(0, 4000);
  if (!prompt) return json({ error: 'Describe what to build.' }, 400);

  const { data: prof } = await db.from('profiles').select('credits').eq('id', user.id).single();
  if (!prof || prof.credits < 2) return json({ error: 'Not enough credits.', credits: prof?.credits ?? 0, status: 402 }, 402);

  const { data: job, error } = await db
    .from('build_jobs')
    .insert({ user_id: user.id, session_id: b.sessionId || null, prompt, status: 'queued', stage: 'Queued' })
    .select('id')
    .single();
  if (error || !job) return json({ error: error?.message || 'Could not start the build.' }, 500);

  launch(job.id, await rulesFor());
  return json({ jobId: job.id, status: 'queued' });
});
