// SwiftBuild AI: persistent build worker (Node 20+). No per-request time limit.
// Same API as the Supabase `build-app` function: POST / {action: start|status|resume, ...}
// Uses the same tables (build_jobs, build_files, projects, profiles) and adjust_credits RPC.
import http from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { collectCompletion, looksComplete, parseJsonStrict, stripFence } from './sse.mjs';

const env = process.env;
const PORT = Number(env.PORT || 8787);
const MODEL = env.OPENAI_MODEL || 'gpt-6.1-sol';
const OPENAI_KEY = env.OPENAI_API_KEY;
const ALLOWED_ORIGIN = env.ALLOWED_ORIGIN || '*';
const MAX_FILES = Number(env.MAX_FILES || 6);
const IDLE_MS = 60_000; // abort only if the AI stream goes silent
const TOTAL_MS = 5 * 60_000; // generous cap per file
const STALE_MS = 30_000;

for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY']) {
  if (!env[k]) { console.error(`Missing env ${k}`); process.exit(1); }
}
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const PLAN_SYSTEM = `You are SwiftBuild AI's architect. Break the user's request into a set of separate files (3 to ${MAX_FILES} files), so each file can be written on its own. Good examples: index.html, styles.css, app.js, components like Sidebar.js, GameBoard.js, PricingCard.js, GameLogic.js, data.js. Keep each file focused on one job. Plain HTML/CSS/vanilla JavaScript only, no build tools, no npm. First classify the request: "quick_edit" (a small tweak or tiny single-page change) or "full_build" (a new or large project). For quick_edit list only index.html. Reply ONLY JSON: {"mode": "quick_edit"|"full_build", "title": string (max 5 words), "files": [{"name": string, "lang": "html"|"css"|"js", "purpose": string (one sentence)}]}. The first file must be index.html, which loads every other file (CSS via <link>, JS via <script src>).`;
const FILE_SYSTEM = `You are SwiftBuild AI, an expert front-end engineer. Write ONE complete file for the project described. The file must be real, working, polished and responsive, with real specific content for the user's request, never lorem ipsum, never a placeholder. Other files in the same project are listed for context; reference them by exact name. Reply with ONLY the raw complete file text: no JSON, no markdown fences, no commentary. Keep code concise, no comments. For data files include at most 12 short entries.`;

const PLAN_MODEL = env.PLAN_MODEL || 'gpt-4o-mini';
const CODE_MODEL = env.CODE_MODEL || 'gpt-4o';
const DEBUG_MODEL = env.DEBUG_MODEL || 'gpt-4o-mini';
const DEBUG_SYSTEM = `You are a Debug Agent and build tester. You get ONE project file. Check it for syntax errors, unclosed tags/brackets/strings, truncated endings, and references to missing files or undefined functions. If it is fine, reply exactly: OK. Otherwise reply with ONLY the complete corrected file text: no markdown fences, no commentary. Never shorten or remove working features.`;

async function streamText(system, user, maxTokens, asJson, model = MODEL) {
  const ctl = new AbortController();
  let idle;
  const bump = () => { clearTimeout(idle); idle = setTimeout(() => ctl.abort(new Error('The AI stopped responding (timeout).')), IDLE_MS); };
  const total = setTimeout(() => ctl.abort(new Error('The AI took too long (timeout).')), TOTAL_MS);
  let reader;
  try {
    bump();
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model,
        stream: true,
        prompt_cache_key: 'swiftbuild-build-files',
        ...(asJson ? { response_format: { type: 'json_object' } } : {}),
        max_completion_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    if (!r.ok || !r.body) {
      const d = await r.json().catch(() => ({}));
      throw new Error(`OpenAI error: ${d?.error?.message || r.status}`);
    }
    reader = r.body.getReader();
    async function* chunks() {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        bump();
        if (value) yield value;
      }
    }
    return (await collectCompletion(chunks())).text;
  } catch (e) {
    const reason = ctl.signal.aborted ? ctl.signal.reason : null;
    throw reason instanceof Error ? reason : e;
  } finally {
    clearTimeout(idle);
    clearTimeout(total);
    try { await reader?.cancel(); } catch { /* closed */ }
  }
}

const baseHtml = (title, extra = '') =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${title.replace(/[<>&]/g, '')}</title>\n</head>\n<body style="margin:0">\n<div id="root"></div>\n${extra}</body>\n</html>`;
function ensureHtml(content, title) {
  const c = (content || '').trim();
  if (!c) return baseHtml(title);
  if (/id=["']root["']/.test(c)) return c;
  if (/<body[^>]*>/i.test(c)) return c.replace(/<body[^>]*>/i, (m) => `${m}\n<div id="root"></div>`);
  return baseHtml(title, c + '\n');
}
const LANG_OF = (n) => (n.endsWith('.css') ? 'css' : n.endsWith('.js') ? 'js' : n.endsWith('.md') ? 'md' : 'html');
const cleanName = (n) => String(n).replace(/[^\w.\-\/]/g, '').slice(0, 60) || 'file.txt';

function buildCost(prompt, files) {
  const words = prompt.split(/\s+/).filter(Boolean).length;
  const chars = files.reduce((n, f) => n + f.content.length, 0);
  const count = files.length;
  if (count <= 3 && chars < 6000) return words <= 10 ? 1 : 2;
  const jsChars = files.reduce((n, f) => n + (/\.(js|jsx|ts|tsx)$/.test(f.name || '') ? f.content.length : 0), 0);
  const raw = 1 + chars / 8000 + count * 0.3 + jsChars / 20000 + words / 150;
  return Math.max(3, Math.min(25, Math.round(raw)));
}

const running = new Set();

async function runJob(jobId, rules) {
  if (running.has(jobId)) return;
  running.add(jobId);
  const setJob = (patch) => db.from('build_jobs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', jobId);
  const beat = setInterval(() => { void setJob({}); }, 8000);
  try {
    const { data: job } = await db.from('build_jobs').select('*').eq('id', jobId).single();
    if (!job || job.status === 'done' || job.status === 'error') return;
    const userId = job.user_id;
    const prompt = String(job.prompt || '');
    let { data: rows } = await db.from('build_files').select('idx,name,lang,purpose,status,content').eq('job_id', jobId).order('idx');
    let title = String(job.title || 'New project');

    if (!rows || rows.length === 0) {
      await setJob({ status: 'planning', stage: 'AI Orchestrator & Planning AI', current_step: 'orchestrator' });
      let plan = null, planErr = null;
      for (let a = 1; a <= 3 && !plan; a++) {
        try { plan = parseJsonStrict(await streamText(PLAN_SYSTEM + rules, prompt, 800, true, PLAN_MODEL)); } catch (e) { planErr = e; }
      }
      if (!plan) throw planErr || new Error('Planning failed.');
      const quick = plan.mode === 'quick_edit';
      const planned = (plan.files || []).filter((f) => f && typeof f.name === 'string').slice(0, quick ? 1 : MAX_FILES)
        .map((f) => ({ name: cleanName(f.name), lang: LANG_OF(String(f.name)), purpose: String(f.purpose || '').slice(0, 200) }));
      if (!planned.some((f) => f.name === 'index.html')) throw new Error('The planner returned no index.html.');
      title = String(plan.title || 'New project').slice(0, 60);
      await db.from('build_files').insert(planned.map((f, i) => ({ job_id: jobId, user_id: userId, idx: i, name: f.name, lang: f.lang, purpose: f.purpose, status: 'pending', content: f.name === 'index.html' ? baseHtml(title) : null })));
      await setJob({ status: 'writing', stage: 'Coding Agent & Backend Manager', current_step: 'coding', title, total_files: planned.length });
      ({ data: rows } = await db.from('build_files').select('idx,name,lang,purpose,status,content').eq('job_id', jobId).order('idx'));
    } else {
      await setJob({ status: 'writing', stage: 'Resuming build', current_step: 'coding' });
    }

    const all = rows || [];
    const manifest = all.map((f) => `- ${f.name}: ${f.purpose}`).join('\n');
    const written = all.filter((f) => f.status === 'done' && f.content).map((f) => ({ name: f.name, lang: f.lang, content: f.content }));

    const writeOne = async (f) => {
      if (f.status === 'done' && f.content) return;
      await db.from('build_files').update({ status: 'writing' }).eq('job_id', jobId).eq('idx', f.idx);
      await setJob({ stage: `Writing ${f.name}` });
      const user = `Project request: ${prompt}\n\nAll files in this project:\n${manifest}\n\nNow write the file: ${f.name}\nIts purpose: ${f.purpose}`;
      let content = '', lastErr = null;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          if (attempt > 1) {
            await setJob({ stage: `Retrying ${f.name} (attempt ${attempt}/4)` });
            await new Promise((r) => setTimeout(r, 1500 * (attempt - 1)));
          }
          content = stripFence(await streamText(FILE_SYSTEM + rules, user, 8000, false, CODE_MODEL));
          if (f.name === 'index.html') content = ensureHtml(content, title);
          if (!looksComplete(f.name, content)) throw new Error(`${f.name} looks truncated or empty.`);
          lastErr = null;
          break;
        } catch (e) { lastErr = e; }
      }
      if (lastErr) {
        await db.from('build_files').update({ status: 'failed' }).eq('job_id', jobId).eq('idx', f.idx);
        throw new Error(`${f.name} failed after 4 attempts: ${lastErr.message}`);
      }
      written.push({ name: f.name, lang: f.lang, content });
      await db.from('build_files').update({ content, status: 'done' }).eq('job_id', jobId).eq('idx', f.idx);
      await setJob({ done_files: written.length });
    };
    const results = await Promise.allSettled(all.map(writeOne));
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) throw failed.reason;
    written.sort((a, b) => all.findIndex((x) => x.name === a.name) - all.findIndex((x) => x.name === b.name));

    // Step 3: Debug Agent & Build Test Engine. Best effort: a failed check keeps the original file.
    await setJob({ stage: 'Debug & Build Engine', current_step: 'debug' });
    await Promise.allSettled(written.map(async (w) => {
      try {
        const out = stripFence(await streamText(DEBUG_SYSTEM, `File: ${w.name}\nOther files:\n${manifest}\n\n${w.content}`, 8000, false, DEBUG_MODEL));
        if (!out || /^OK\.?$/i.test(out.trim())) return;
        if (out.length < w.content.length * 0.7 || !looksComplete(w.name, out)) return;
        w.content = w.name === 'index.html' ? ensureHtml(out, title) : out;
        await db.from('build_files').update({ content: w.content }).eq('job_id', jobId).eq('name', w.name);
      } catch { /* keep original */ }
    }));
    await setJob({ stage: 'Live Preview Ready', current_step: 'preview' });

    // Charge only after success, never more than the balance.
    const { data: prof } = await db.from('profiles').select('credits').eq('id', userId).single();
    const cost = Math.max(0, Math.min(buildCost(prompt, written), prof?.credits ?? 0));
    if (cost > 0) {
      const { data: balance } = await db.rpc('adjust_credits', { p_user: userId, p_delta: -cost, p_reason: `Build: ${prompt.slice(0, 60)}` });
      if (balance === null || balance === undefined) throw new Error('Not enough credits. You were not charged.');
    }
    const files = written.map((w) => ({ name: w.name, lang: w.lang, content: w.content }));
    const { data: row } = await db.from('projects').insert({ user_id: userId, title, prompt, mode: 'build', files, cost }).select('id').single();
    await setJob({ status: 'done', stage: 'Finished', current_step: 'done', cost, project_id: row?.id ?? null, title });
  } catch (err) {
    await setJob({ status: 'error', error: err.message || 'Build failed.', stage: 'Stopped' });
  } finally {
    clearInterval(beat);
    running.delete(jobId);
  }
}

async function rulesFor(userId) {
  const { data } = await db.from('user_settings').select('custom_instructions').eq('user_id', userId).maybeSingle();
  const custom = String(data?.custom_instructions || '').trim().slice(0, 4000);
  return custom ? `\n\nThe user's permanent custom instructions (always follow them):\n${custom}` : '';
}

async function handle(b, user) {
  const action = String(b.action || 'start');
  if (action === 'status') {
    const jobId = String(b.jobId || '');
    const { data: job } = await db.from('build_jobs').select('*').eq('id', jobId).eq('user_id', user.id).maybeSingle();
    if (!job) return [404, { error: 'Build not found.' }];
    const { data: files } = await db.from('build_files').select('idx,name,lang,purpose,status,content').eq('job_id', jobId).order('idx');
    return [200, { job, files: files || [] }];
  }
  if (action === 'resume') {
    const jobId = String(b.jobId || '');
    const { data: job } = await db.from('build_jobs').select('id,status,updated_at').eq('id', jobId).eq('user_id', user.id).maybeSingle();
    if (!job) return [404, { error: 'Build not found.' }];
    if (job.status === 'done') return [200, { resumed: false, status: job.status }];
    if (job.status === 'error') {
      if (!b.force) return [200, { resumed: false, status: job.status }];
      await db.from('build_files').update({ status: 'pending' }).eq('job_id', jobId).in('status', ['failed', 'writing']);
      await db.from('build_jobs').update({ status: 'writing', error: null, stage: 'Continuing from saved files', updated_at: new Date().toISOString() }).eq('id', jobId);
      void runJob(jobId, await rulesFor(user.id));
      return [200, { resumed: true, revived: true }];
    }
    if (running.has(jobId) || Date.now() - new Date(job.updated_at).getTime() < STALE_MS) return [200, { resumed: false, alive: true }];
    void runJob(jobId, await rulesFor(user.id));
    return [200, { resumed: true }];
  }
  const prompt = String(b.prompt || '').trim().slice(0, 4000);
  if (!prompt) return [400, { error: 'Describe what to build.' }];
  const { data: prof } = await db.from('profiles').select('credits').eq('id', user.id).single();
  if (!prof || prof.credits < 2) return [402, { error: 'Not enough credits.', credits: prof?.credits ?? 0, status: 402 }];
  const { data: job, error } = await db.from('build_jobs').insert({ user_id: user.id, session_id: b.sessionId || null, prompt, status: 'queued', stage: 'Queued' }).select('id').single();
  if (error || !job) return [500, { error: error?.message || 'Could not start the build.' }];
  void runJob(job.id, await rulesFor(user.id));
  return [200, { jobId: job.id, status: 'queued' }];
}

const readBody = (req) => new Promise((res) => {
  let s = '';
  req.on('data', (c) => { s += c; if (s.length > 1e6) req.destroy(); });
  req.on('end', () => { try { res(JSON.parse(s || '{}')); } catch { res({}); } });
});

http.createServer(async (req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  };
  const send = (code, data) => {
    if (code === 204) { res.writeHead(204, cors); return res.end(); }
    res.writeHead(code, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify(data));
  };
  if (req.method === 'OPTIONS') return send(204, {});
  if (req.method === 'GET') return send(200, { ok: true, running: running.size });
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const { data } = token ? await db.auth.getUser(token) : { data: {} };
    if (!data.user) return send(401, { error: 'Please sign in again.' });
    const [code, body] = await handle(await readBody(req), data.user);
    send(code, body);
  } catch (e) {
    send(500, { error: e.message || 'Server error.' });
  }
}).listen(PORT, () => console.log(`SwiftBuild worker listening on :${PORT}`));

// On boot, pick up builds that a previous process left half-done.
(async () => {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const { data } = await db.from('build_jobs').select('id,user_id').in('status', ['queued', 'planning', 'writing']).lt('updated_at', cutoff);
  for (const j of data || []) void rulesFor(j.user_id).then((r) => runJob(j.id, r));
})();
