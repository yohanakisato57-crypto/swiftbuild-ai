// SwiftBuild AI: persistent build worker (Node 20+). No per-request time limit.
// Same API as the Supabase `build-app` function: POST / {action: start|status|resume, ...}
// Uses the same tables (build_jobs, build_files, projects, profiles) and adjust_credits RPC.
import http from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { collectCompletion, looksComplete, parseJsonStrict, stripFence } from './sse.mjs';
import { BACKEND_SYSTEM, REVIEW_SYSTEM, TEST_SYSTEM, runTests, staticCheck } from './agents.mjs';
import { checkImageUrls, withImageFallback } from './consistency.mjs';
import { runSandbox } from './sandbox.mjs';

const env = process.env;
const PORT = Number(env.PORT || 8787);
const MODEL = env.OPENAI_MODEL || 'gpt-6.1-sol';
const OPENAI_KEY = env.OPENAI_API_KEY;
const ALLOWED_ORIGIN = env.ALLOWED_ORIGIN || '*';
const MAX_FILES = Number(env.MAX_FILES || 6);
const IDLE_MS = 60_000; // abort only if the AI stream goes silent
const TOTAL_MS = 5 * 60_000; // generous cap per file
const STALE_MS = 30_000;
const MAX_CONCURRENT_BUILDS = Math.max(1, Number(env.MAX_CONCURRENT_BUILDS || 2)); // jobs running at once; the rest wait in a queue
const MAX_SANDBOX = Math.max(1, Number(env.MAX_SANDBOX || 1)); // sandbox runs (npm + jsdom) at once: they are the heavy part
const MAX_ACTIVE_PER_USER = Math.max(1, Number(env.MAX_ACTIVE_PER_USER || 2));
const JOB_MAX_MS = Number(env.JOB_MAX_MS || 25 * 60_000); // a job older than this is marked timed out
const ACTIVE = ['queued', 'planning', 'writing'];

for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY']) {
  if (!env[k]) { console.error(`Missing env ${k}`); process.exit(1); }
}
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SPEC_FORMAT = `"spec": {"dom_ids": [element ids that scripts look up], "css_classes": [class names several files share], "js_api": [{"file": string, "name": string (a global function or object other files call)}], "data_shapes": {"Name": [property names of each data record]}, "storage_keys": [localStorage keys]} (the shared contract between files: include only what files truly share, empty arrays are fine, do not assume any particular kind of project)`;
const PLAN_SYSTEM = `You are SwiftBuild AI's architect. Break the user's request into a set of separate files (3 to ${MAX_FILES} files), so each file can be written on its own. Good examples: index.html, styles.css, app.js, components like Sidebar.js, GameBoard.js, PricingCard.js, GameLogic.js, data.js. Keep each file focused on one job. Plain HTML/CSS/vanilla JavaScript only, no build tools, no npm. First classify the request: "quick_edit" (a small tweak or tiny single-page change) or "full_build" (a new or large project). For quick_edit list only index.html. Also decide "backend": true only if the project needs saved data, accounts, forms that store data, or API/WhatsApp integrations (a data layer file data.js will then be written by a separate Backend Agent; do not list data.js yourself). Reply ONLY JSON: {"mode": "quick_edit"|"full_build", "backend": boolean, "title": string (max 5 words), "files": [{"name": string, "lang": "html"|"css"|"js", "purpose": string (one sentence)}], ${SPEC_FORMAT}}. The first file must be index.html, which loads every other file (CSS via <link>, JS via <script src>).`;
const EDIT_PLAN_SYSTEM = `You are SwiftBuild AI's architect working on an EXISTING project. You get the user's request and the project's files (name, size, beginning of each). Classify the request: "bug_fix" (something is broken), "quick_edit" (a small tweak: text, colours, spacing, one section) or "feature_addition" (a new capability). Choose the MINIMUM set of files that must change. Prefer modifying existing files; create a new file only when a feature truly needs one. Never list files that do not need to change and never rebuild the project from scratch. Reply ONLY JSON: {"mode": "bug_fix"|"quick_edit"|"feature_addition", "title": string (max 5 words; keep the project's current name unless asked), "files": [{"name": string (an exact existing file name, or a new name when creating), "action": "modify"|"create", "lang": "html"|"css"|"js", "purpose": string (what exactly to change, one or two sentences)}], ${SPEC_FORMAT} describing the whole project as it will be after the change, taken from the existing code}. At most ${MAX_FILES} files.`;
const FILE_SYSTEM = `You are SwiftBuild AI, an expert front-end engineer. Write ONE complete file for the project described. The file must be real, working, polished and responsive, with real specific content for the user's request, never lorem ipsum, never a placeholder. Other files in the same project are listed for context; reference them by exact name. Reply with ONLY the raw complete file text: no JSON, no markdown fences, no commentary. No code comments. Never stop early and never leave a section unfinished.
QUALITY BAR: build a complete, premium, fully working interactive app on the level of Bolt.new and Lovable, never a short page of a few lines. Rules:
- Fit the PROJECT TYPE the user asked for (shop, dashboard, game, portfolio, SaaS landing, blog, booking, tool...). Use the sections and features that type really needs. Add product cards, a cart drawer and prices ONLY when the request is a shop, store, menu, catalogue or listing. Dashboards need real tables, charts and state; games need a working game loop and controls; portfolios need projects and a contact section; SaaS pages need features, pricing and FAQ.
- Load Tailwind CSS from https://cdn.tailwindcss.com, Lucide icons from https://unpkg.com/lucide@latest (call lucide.createIcons() after every render) and Google Fonts (Plus Jakarta Sans for headings, Inter for body) in index.html.
- Include a modern sticky navigation, a strong first section, hover micro-interactions and a responsive layout for mobile, tablet and desktop. Search and filter chips that really filter whenever the page shows a list of items. A complete footer on website-style pages.
- Photos: use only real Unsplash photo URLs you are sure of, in the form https://images.unsplash.com/photo-<id>?auto=format&fit=crop&w=800&q=80. Every <img> has alt text and a fixed aspect ratio. Never invent other image hosts or local image file names. The platform shows a safe placeholder if an image fails.
- All behaviour is written in real JavaScript, with realistic specific content and data for the user's business or topic.
- CONTRACT: obey the shared project specification you are given. Every element id your JavaScript looks up must exist in the HTML; every function called from an inline handler must be defined (prefer addEventListener); only reference files that are listed in the project; never rename ids, classes or functions that the specification names.
- If the user gives a phone or WhatsApp number, wire it in directly: every orderable item gets an "Agiza kwa WhatsApp" / "Order on WhatsApp" button opening https://wa.me/<digits only, with country code>?text=<encodeURIComponent of a neat message with the item name and price>, a checkout/cart sends the whole order list and total the same way, plus a green floating WhatsApp button fixed at bottom right.
- Write ALL website text in the same language the user wrote in (if Swahili, pure natural Swahili everywhere: nav, buttons, cards, footer, messages).
- If the project is split in several files, keep this behaviour but put it in the files assigned to it; index.html must still render a full page.`;
const EDIT_FILE_SYSTEM = `You are SwiftBuild AI editing ONE file of an EXISTING project. You get the CURRENT text of the file, the user's request, and a digest of the other files. Apply ONLY the requested change. Keep every unrelated line exactly as it is: all content, ids, classes, functions, styles, working features and existing image URLs. Never rename an id, class or function that another file uses. For a bug fix, find the root cause and fix it with the smallest change. Obey the shared specification. Reply with ONLY the COMPLETE updated file text: no JSON, no markdown fences, no commentary, no code comments added.`;

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
    const r = await fetch(`${env.OPENAI_BASE_URL || 'https://api.openai.com'}/v1/chat/completions`, {
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
/** New pages get a root container; edited pages are left as they are. Both get the safe broken-image fallback. */
const finalizeHtml = (content, title, edit) => withImageFallback(edit ? String(content || '').trim() : ensureHtml(content, title));
const LANG_OF = (n) => (n.endsWith('.css') ? 'css' : n.endsWith('.js') ? 'js' : n.endsWith('.md') ? 'md' : 'html');
const cleanName = (n) => String(n).replace(/[^\w.\-\/]/g, '').replace(/^\/+/, '').replace(/\.\.+/g, '.').slice(0, 60) || 'file.txt';

const strList = (a, n) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.length < 80).slice(0, n) : []);
function cleanSpec(s) {
  if (!s || typeof s !== 'object') return null;
  const shapes = {};
  if (s.data_shapes && typeof s.data_shapes === 'object') for (const [k, v] of Object.entries(s.data_shapes).slice(0, 12)) shapes[String(k).slice(0, 40)] = strList(v, 20);
  return {
    dom_ids: strList(s.dom_ids, 60),
    css_classes: strList(s.css_classes, 60),
    js_api: (Array.isArray(s.js_api) ? s.js_api : []).filter((a) => a && typeof a.name === 'string').slice(0, 40).map((a) => ({ file: String(a.file || '').slice(0, 60), name: a.name.slice(0, 80) })),
    data_shapes: shapes,
    storage_keys: strList(s.storage_keys, 20),
  };
}

function buildCost(prompt, files) {
  const words = prompt.split(/\s+/).filter(Boolean).length;
  const chars = files.reduce((n, f) => n + f.content.length, 0);
  const count = files.length;
  if (count <= 3 && chars < 6000) return words <= 10 ? 1 : 2;
  const jsChars = files.reduce((n, f) => n + (/\.(js|jsx|ts|tsx)$/.test(f.name || '') ? f.content.length : 0), 0);
  const raw = 1 + chars / 8000 + count * 0.3 + jsChars / 20000 + words / 150;
  return Math.max(3, Math.min(25, Math.round(raw)));
}

// ---------------------------------------------------------------- concurrency: limiter, per-user lock
function makeLimiter(n) {
  let active = 0;
  const q = [];
  const next = () => { while (active < n && q.length) { active++; q.shift()(); } };
  return {
    get waiting() { return q.length; },
    async run(fn, onWait) {
      if (active >= n) { await new Promise((r) => { q.push(r); onWait?.(q.length); }); } else active++;
      try { return await fn(); } finally { active--; next(); }
    },
  };
}
const buildLimiter = makeLimiter(MAX_CONCURRENT_BUILDS);
const sandboxLimiter = makeLimiter(MAX_SANDBOX);
const sandbox = (files) => sandboxLimiter.run(() => runSandbox(files));

/** Runs fn alone for this user: two jobs of one user can never read the balance and charge at the same moment. */
const userLocks = new Map();
async function withUserLock(userId, fn) {
  const prev = userLocks.get(userId) || Promise.resolve();
  let release;
  const mine = new Promise((r) => { release = r; });
  const tail = prev.then(() => mine);
  userLocks.set(userId, tail);
  await prev;
  try { return await fn(); } finally {
    release();
    if (userLocks.get(userId) === tail) userLocks.delete(userId);
  }
}

const running = new Set(); // jobs executing now
const pending = new Set(); // jobs waiting for a free slot

/** Waits for a free build slot (queue), keeps the job's heartbeat alive meanwhile, then runs it. */
async function queueJob(jobId, rules) {
  if (running.has(jobId) || pending.has(jobId)) return;
  pending.add(jobId);
  const touch = () => { void db.from('build_jobs').update({ updated_at: new Date().toISOString() }).eq('id', jobId); };
  const hb = setInterval(touch, 8000);
  try {
    await buildLimiter.run(
      async () => { clearInterval(hb); pending.delete(jobId); await runJob(jobId, rules); },
      (pos) => { void db.from('build_jobs').update({ stage: `Waiting in the build queue (position ${pos})`, updated_at: new Date().toISOString() }).eq('id', jobId).in('status', ACTIVE); },
    );
  } finally { clearInterval(hb); pending.delete(jobId); }
}

async function runJob(jobId, rules) {
  if (running.has(jobId)) return;
  running.add(jobId);
  const setJob = async (patch) => { await db.from('build_jobs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', jobId); };
  const beat = setInterval(() => { void setJob({}); }, 8000);
  // Real per-agent status, written to build_jobs.agent_status and read by the Chat pipeline card.
  const AG = { planning: 'pending', coding: 'pending', review: 'pending', backend: 'pending', debug: 'pending', testing: 'pending', engine: 'pending', preview: 'pending' };
  const AGMSG = {};
  // Distinct delivery states: code generated / build / tests / preview loaded / deployed. Each is set only from real evidence.
  const DEL = { generated: 'pending', build: 'pending', tests: 'pending', preview: 'pending', deployed: 'not_deployed' };
  const ag = (k, s, m) => { AG[k] = s; if (m !== undefined) AGMSG[k] = String(m).slice(0, 240); return setJob({ agent_status: { state: { ...AG }, msg: { ...AGMSG }, delivery: { ...DEL } } }); };
  try {
    const { data: job } = await db.from('build_jobs').select('*').eq('id', jobId).single();
    if (!job || ['done', 'error', 'charging'].includes(job.status)) return;
    const userId = job.user_id;
    const prompt = String(job.prompt || '');
    // Existing project (Quick Edit / Bug Fix / Feature Addition): the complete current files are the starting point.
    const base = Array.isArray(job.base_files?.files) ? job.base_files.files.filter((f) => f && typeof f.name === 'string' && typeof f.content === 'string') : [];
    const edit = base.length > 0;
    const baseMap = new Map(base.map((f) => [f.name, f]));
    let jobMode = job.job_mode || null;
    let spec = job.spec || null;
    let { data: rows } = await db.from('build_files').select('idx,name,lang,purpose,status,content').eq('job_id', jobId).order('idx');
    let title = String(job.title || 'New project');

    if (!rows || rows.length === 0) {
      await setJob({ status: 'planning', stage: 'Planning Agent', current_step: 'orchestrator' });
      await ag('planning', 'running', edit ? 'Reading your existing project and planning the smallest change' : 'Analysing your request and planning files');
      const planUser = edit
        ? `Request: ${prompt}\n\nExisting project files:\n${(() => { let budget = 24000; return base.map((f) => { const head = f.content.slice(0, Math.max(300, Math.min(2000, budget))); budget -= head.length; return `--- ${f.name} (${f.content.length} chars) ---\n${head}`; }).join('\n\n'); })()}`
        : prompt;
      let plan = null, planErr = null;
      for (let a = 1; a <= 3 && !plan; a++) {
        try { plan = parseJsonStrict(await streamText((edit ? EDIT_PLAN_SYSTEM : PLAN_SYSTEM) + rules, planUser, edit ? 1400 : 1400, true, PLAN_MODEL)); } catch (e) { planErr = e; }
      }
      if (!plan) throw planErr || new Error('Planning failed.');
      let planned;
      if (edit) {
        jobMode = ['bug_fix', 'quick_edit', 'feature_addition'].includes(plan.mode) ? plan.mode : 'quick_edit';
        planned = (plan.files || []).filter((f) => f && typeof f.name === 'string').slice(0, MAX_FILES)
          .map((f) => { const name = baseMap.has(f.name) ? f.name : cleanName(f.name); return { name, lang: baseMap.get(name)?.lang || LANG_OF(name), purpose: String(f.purpose || prompt).slice(0, 300) }; })
          .filter((f, i, a) => a.findIndex((x) => x.name === f.name) === i);
        if (jobMode !== 'feature_addition') planned = planned.slice(0, 3);
        if (!planned.length) { const t = baseMap.has('index.html') ? 'index.html' : base[0].name; planned = [{ name: t, lang: baseMap.get(t).lang || LANG_OF(t), purpose: prompt.slice(0, 300) }]; }
      } else {
        jobMode = plan.mode === 'quick_edit' ? 'quick_edit' : 'full_build';
        planned = (plan.files || []).filter((f) => f && typeof f.name === 'string').slice(0, jobMode === 'quick_edit' ? 1 : MAX_FILES)
          .map((f) => ({ name: cleanName(f.name), lang: LANG_OF(String(f.name)), purpose: String(f.purpose || '').slice(0, 200) }));
        if (!planned.some((f) => f.name === 'index.html')) throw new Error('The planner returned no index.html.');
        // Central Orchestrator: the Backend Agent only runs for full builds that need a data layer.
        if (jobMode !== 'quick_edit' && plan.backend === true && !planned.some((f) => f.name === 'data.js')) {
          planned.push({ name: 'data.js', lang: 'js', purpose: 'Data layer (window.AppData): storage, validation and integrations. Load it with <script src="data.js"></script> BEFORE other scripts and use window.AppData.' });
        }
      }
      spec = cleanSpec(plan.spec);
      const label = { quick_edit: 'Quick Edit', bug_fix: 'Bug Fix', feature_addition: 'Feature Addition', full_build: 'Full Build' }[jobMode];
      await ag('planning', 'done', edit
        ? `${label}: changing ${planned.map((f) => f.name).join(', ')}; the other ${Math.max(0, base.length - planned.filter((f) => baseMap.has(f.name)).length)} existing file(s) are kept as they are`
        : `${label}: ${planned.length} file(s) planned${planned.some((f) => f.name === 'data.js') ? ', backend needed' : ''}`);
      title = edit ? String(job.title || plan.title || 'Project').slice(0, 60) : String(plan.title || 'New project').slice(0, 60);
      await db.from('build_files').insert(planned.map((f, i) => ({ job_id: jobId, user_id: userId, idx: i, name: f.name, lang: f.lang, purpose: f.purpose, status: 'pending', content: !edit && f.name === 'index.html' ? baseHtml(title) : null })));
      await setJob({ status: 'writing', stage: 'Coding Agent & Backend Manager', current_step: 'coding', title, total_files: planned.length, job_mode: jobMode, spec });
      ({ data: rows } = await db.from('build_files').select('idx,name,lang,purpose,status,content').eq('job_id', jobId).order('idx'));
    } else {
      await setJob({ status: 'writing', stage: 'Resuming build', current_step: 'coding' });
      await ag('planning', 'done', 'Plan restored from saved files');
    }
    const hasBackend = !edit && (rows || []).some((f) => f.name === 'data.js');
    const isQuick = jobMode ? ['quick_edit', 'bug_fix'].includes(jobMode) : (rows || []).length <= 1;

    const all = rows || [];
    const manifest = (edit ? base.map((b) => `- ${b.name}: ${all.find((f) => f.name === b.name)?.purpose || '(unchanged)'}`).concat(all.filter((f) => !baseMap.has(f.name)).map((f) => `- ${f.name} (new): ${f.purpose}`)) : all.map((f) => `- ${f.name}: ${f.purpose}`)).join('\n');
    const specText = spec ? `\n\nShared project specification (binding contract between the files; use these exact ids, class names, function names and data fields):\n${JSON.stringify(spec)}` : '';
    const written = all.filter((f) => f.status === 'done' && f.content).map((f) => ({ name: f.name, lang: f.lang, content: f.content }));
    const digestFor = (name) => { let budget = 14000; return base.filter((b) => b.name !== name).map((b) => { const s = b.content.slice(0, Math.max(0, Math.min(3000, budget))); budget -= s.length; return s ? `--- ${b.name} ---\n${s}` : ''; }).filter(Boolean).join('\n\n'); };

    const writeOne = async (f) => {
      if (f.status === 'done' && f.content) return;
      await db.from('build_files').update({ status: 'writing' }).eq('job_id', jobId).eq('idx', f.idx);
      await setJob({ stage: `Writing ${f.name}` });
      const orig = baseMap.get(f.name);
      const user = orig
        ? `Request: ${prompt}\nTask type: ${jobMode}\n\nWhat to change in ${f.name}: ${f.purpose}\n\nAll files in this project:\n${manifest}${specText}\n\nDigest of the other files:\n${digestFor(f.name)}\n\nCURRENT ${f.name}:\n${orig.content}`
        : `Project request: ${prompt}\n\nAll files in this project:\n${manifest}${specText}${edit ? `\n\nDigest of the existing files:\n${digestFor(f.name)}` : ''}\n\nNow write the file: ${f.name}\nIts purpose: ${f.purpose}`;
      let content = '', lastErr = null;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          if (attempt > 1) {
            await setJob({ stage: `Retrying ${f.name} (attempt ${attempt}/4)` });
            await new Promise((r) => setTimeout(r, 1500 * (attempt - 1)));
          }
          content = stripFence(await streamText((orig ? EDIT_FILE_SYSTEM : f.name === 'data.js' && hasBackend ? BACKEND_SYSTEM : FILE_SYSTEM) + rules, user, 16000, false, CODE_MODEL));
          if (f.name === 'index.html') content = finalizeHtml(content, title, edit);
          if (!looksComplete(f.name, content)) throw new Error(`${f.name} looks truncated or empty.`);
          if (orig && isQuick && content.length < orig.content.length * 0.5) throw new Error(`${f.name} came back much shorter than the original (${content.length} vs ${orig.content.length} chars); a small edit must not delete the file's content.`);
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
    // Coding Agent and Backend Agent run in parallel on disjoint files (no shared file is written twice).
    const group = async (key, list, label) => {
      if (!list.length) { await ag(key, 'skipped', 'Not needed for this request'); return []; }
      await ag(key, 'running', label);
      const rs = await Promise.allSettled(list.map(writeOne));
      const bad = rs.find((r) => r.status === 'rejected');
      await ag(key, bad ? 'failed' : 'done', bad ? bad.reason?.message : `${list.length} file(s) ${edit ? 'updated' : 'written'}`);
      return rs;
    };
    const isBE = (f) => hasBackend && f.name === 'data.js';
    const groups = await Promise.all([
      group('coding', all.filter((f) => !isBE(f)), edit ? 'Applying the change to the relevant files' : 'Writing pages, components and styles'),
      group('backend', all.filter(isBE), 'Writing the data layer and integrations'),
    ]);
    const failed = groups.flat().find((r) => r.status === 'rejected');
    if (failed) throw failed.reason;
    written.sort((a, b) => all.findIndex((x) => x.name === a.name) - all.findIndex((x) => x.name === b.name));

    // Generated/changed files (billing input, unchanged from before) vs the complete project (what is tested and saved).
    const generated = [...written];
    const touched = new Set(generated.map((g) => g.name));
    if (edit) {
      const merged = base.map((b) => generated.find((g) => g.name === b.name) || { name: b.name, lang: b.lang, content: b.content });
      for (const g of generated) if (!baseMap.has(g.name)) merged.push(g);
      written.length = 0;
      written.push(...merged);
    }

    // Review Agent: skipped for light edits to save time and cost.
    const light = isQuick || written.length <= 1;
    let issues = [];
    if (light) {
      await ag('review', 'skipped', 'Quick Edit: lightweight path');
    } else {
      await setJob({ stage: 'Review Agent', current_step: 'debug' });
      await ag('review', 'running', 'Reviewing code against the plan');
      try {
        const body = (edit ? written.filter((w) => touched.has(w.name)) : written).map((w) => `=== ${w.name} ===\n${w.content.slice(0, 12000)}`).join('\n\n');
        const rv = parseJsonStrict(await streamText(REVIEW_SYSTEM, `Request: ${prompt}\n\nPlan:\n${manifest}${specText}\n\n${body}`, 1200, true, PLAN_MODEL));
        issues = (Array.isArray(rv.issues) ? rv.issues : []).filter((i) => i && written.some((w) => w.name === i.file)).slice(0, 6).map((i) => ({ file: i.file, problem: String(i.problem || '').slice(0, 300) }));
        await ag('review', 'done', issues.length ? `${issues.length} issue(s) sent to the Debug Agent` : 'Approved: code matches the plan');
      } catch (e) {
        await ag('review', 'failed', `Review could not complete: ${e.message}`);
      }
    }

    // Edits judge only NEW problems: a defect that already existed before this edit does not block it (a Bug Fix is judged on everything).
    const sig = (p) => `${p.file}|${p.problem}`;
    let baseSigs = null;
    const ensureBase = async () => {
      if (baseSigs) return;
      baseSigs = new Set();
      if (!edit || jobMode === 'bug_fix') return;
      for (const p of staticCheck(base, spec)) baseSigs.add(sig(p));
      const b = await sandbox(base);
      if (!b.infra) for (const p of b.problems) baseSigs.add(sig(p));
    };
    const fresh = (list) => (baseSigs ? list.filter((p) => !baseSigs.has(sig(p))) : list);

    // Debug Agent: real syntax/reference checks plus review issues; max 2 repair rounds, never keeps a worse file.
    await setJob({ stage: 'Debug Agent', current_step: 'debug' });
    DEL.generated = 'passed';
    await ag('debug', 'running', 'Checking syntax, references and runtime errors');
    await ag('engine', 'running', 'Sandbox: installing dependencies, building, serving and running the app');
    let sb = await sandbox(written);
    const sbProblems = () => (sb.infra ? [] : sb.problems);
    let problems = [...issues, ...staticCheck(written, spec), ...sbProblems()];
    if (problems.length) { await ensureBase(); problems = fresh(problems); }
    const firstCount = problems.length;
    let lastSig = '';
    for (let round = 1; round <= 2 && problems.length; round++) {
      const sg = problems.map(sig).sort().join('\n');
      if (sg === lastSig) break; // the last repair changed nothing: do not loop
      lastSig = sg;
      await ag('debug', 'running', `Repair round ${round}/2: ${problems.length} problem(s)`);
      const byFile = new Map();
      for (const p of problems) byFile.set(p.file, [...(byFile.get(p.file) || []), p.problem]);
      await Promise.allSettled([...byFile].map(async ([name, list]) => {
        const w = written.find((x) => x.name === name);
        if (!w) return;
        try {
          const out = stripFence(await streamText(DEBUG_SYSTEM + specText, `File: ${name}\nProblems found (fix exactly these, change nothing unrelated):\n- ${list.join('\n- ')}\nOther files:\n${manifest}\n\n${w.content}`, 16000, false, DEBUG_MODEL));
          if (!out || /^OK\.?$/i.test(out.trim())) return;
          if (out.length < w.content.length * 0.7 || !looksComplete(name, out)) return;
          const next = name === 'index.html' ? finalizeHtml(out, title, edit) : out;
          const others = written.filter((x) => x.name !== name);
          if (staticCheck([...others, { name, content: next }], spec).length > staticCheck(written, spec).length) return;
          w.content = next;
          await db.from('build_files').update({ content: next }).eq('job_id', jobId).eq('name', name);
        } catch { /* keep the working version */ }
      }));
      await ag('engine', 'running', `Sandbox: re-running build and tests after repair ${round}/2`);
      sb = await sandbox(written);
      problems = fresh([...staticCheck(written, spec), ...sbProblems()]);
    }
    const remaining = fresh([...staticCheck(written, spec), ...sbProblems()]);
    await ag('debug', remaining.length ? 'failed' : 'done', remaining.length ? `${remaining.length} problem(s) remain: ${remaining[0].file}: ${remaining[0].problem}` : firstCount ? `Fixed ${firstCount} problem(s)` : 'No errors found');

    // Testing Agent: automated tests are authoritative; the AI only reports on user flows.
    await setJob({ stage: 'Testing Agent', current_step: 'debug' });
    await ag('testing', 'running', 'Running automated checks');
    const tr = runTests(written, spec);
    const trFresh = fresh(tr.probs);
    let flowNote = '';
    if (!light) {
      try {
        const idx = written.find((w) => w.name === 'index.html');
        const res = parseJsonStrict(await streamText(TEST_SYSTEM, `Automated results:\n${tr.checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'} ${c.name}`).join('\n')}\n\nFiles: ${written.map((w) => w.name).join(', ')}\n\nindex.html:\n${(idx?.content || '').slice(0, 14000)}`, 900, true, PLAN_MODEL));
        const flows = Array.isArray(res.flows) ? res.flows : [];
        const bad = flows.filter((f) => f && f.ok === false);
        flowNote = ` Flows: ${flows.length - bad.length}/${flows.length} wired${bad[0] ? ` (not wired: ${String(bad[0].name).slice(0, 60)})` : ''}.`;
      } catch { /* flow report is optional */ }
    }
    // Real image check: HTTP requests to every external image URL in the changed files. Broken ones get the safe fallback, never an invented URL.
    let imgNote = '';
    try {
      const im = await checkImageUrls(edit ? generated : written);
      if (im.checked) imgNote = ` Images: ${im.ok}/${im.checked} verified${im.broken.length ? `, ${im.broken.length} broken (shown with a safe placeholder)` : ''}${im.unverified ? `, ${im.unverified} could not be verified from the server` : ''}.`;
    } catch { imgNote = ' Images: check could not run.'; }
    const passedN = tr.checks.filter((c) => c.ok).length;
    // Real execution evidence decides delivery. Generated code alone is never "success".
    const rt = sb.runtime || {};
    const buildOk = !sb.infra && !(sb.install?.ran && !sb.install.ok) && !(sb.build?.ran && !sb.build.ok);
    DEL.build = buildOk ? 'passed' : 'failed';
    const sandboxNote = sb.infra ? sb.problems[0].problem : `Sandbox: HTTP ${sb.http?.index ?? '-'}, ${sb.http?.assets ?? 0} local assets, CDN ${sb.http?.cdn ?? 'n/a'}, ${rt.clicks ?? 0} clicks, ${rt.inputs ?? 0} inputs, ${rt.errors ?? 0} runtime error(s).`;
    const sbFresh = fresh(sbProblems());
    const testsOk = trFresh.length === 0 && !sb.infra && sbFresh.length === 0;
    DEL.tests = testsOk ? 'passed' : 'failed';
    await ag('testing', testsOk ? 'done' : 'failed', `${passedN}/${tr.checks.length} static checks${tr.warnings.length ? `, ${tr.warnings.length} warning(s)` : ''}.${flowNote}${imgNote} ${sandboxNote}`);
    if (!testsOk) {
      const allp = [...trFresh, ...sbFresh];
      const first = (allp[0] ? `${allp[0].file}: ${allp[0].problem}` : sb.infra ? sb.problems[0].problem : 'Automated tests failed.');
      await ag('engine', 'failed', sb.infra ? first : `Build/tests failed after the repair attempts. ${first}`);
      DEL.preview = 'failed';
      await ag('preview', 'pending', 'Not verified: the build or tests failed');
      throw new Error(`Build or tests failed after 2 repair attempts, so this project was not delivered. Error: ${first}. Your generated files are kept as a draft and you were not charged.`);
    }
    await ag('engine', 'done', sandboxNote);

    // Preview verification BEFORE any charge: read the stored files back and run them through the preview server again.
    await ag('preview', 'running', 'Loading the saved project from storage over HTTP');
    const { data: saved } = await db.from('build_files').select('name,content').eq('job_id', jobId);
    const savedMap = new Map((saved || []).map((s) => [s.name, s.content || '']));
    const verifyFiles = edit ? written.map((w) => ({ name: w.name, content: touched.has(w.name) && savedMap.has(w.name) ? savedMap.get(w.name) : w.content })) : (saved || []).map((s) => ({ name: s.name, content: s.content || '' }));
    const pv = await sandbox(verifyFiles);
    const pvProblems = fresh(pv.problems);
    if (pv.infra || pvProblems.length) {
      DEL.preview = 'failed';
      const why = (pv.infra ? pv.problems : pvProblems)[0]?.problem || 'unknown error';
      await ag('preview', 'failed', `Preview did not load: ${why}`);
      throw new Error(`Preview verification failed: ${why}. Your generated files are kept as a draft and you were not charged.`);
    }
    DEL.preview = 'passed';

    // Everything below runs alone for this user. The job is claimed first (queued/planning/writing -> charging), so a job that
    // was already finished, timed out or double-started can never charge twice. The charge itself is unchanged.
    const result = await withUserLock(userId, async () => {
      const { data: claimed } = await db.from('build_jobs').update({ status: 'charging', stage: 'Saving', updated_at: new Date().toISOString() }).eq('id', jobId).in('status', ACTIVE).select('id');
      if (!claimed || claimed.length === 0) throw new Error('This build was already finished, timed out or cancelled, so nothing was charged.');
      // Charge only after success, never more than the balance.
      const { data: prof } = await db.from('profiles').select('credits').eq('id', userId).single();
      const fullCost = Math.max(0, buildCost(prompt, generated));
      const owed = fullCost > (prof?.credits ?? 0) ? fullCost : 0;
      const cost = owed ? 0 : fullCost;
      if (cost > 0) {
        const { data: balance } = await db.rpc('adjust_credits', { p_user: userId, p_delta: -cost, p_reason: `Build: ${prompt.slice(0, 60)}` });
        if (balance === null || balance === undefined) throw new Error('Not enough credits. You were not charged.');
      }
      // Not enough credits: the project is finished but locked until the user pays.
      const files = owed ? [] : written.map((w) => ({ name: w.name, lang: w.lang, content: w.content }));
      await setJob({ stage: 'Project Execution Engine', current_step: 'preview' });
      await ag('engine', 'running', 'Saving the verified project');
      const { data: row, error: saveErr } = await db.from('projects').insert({ user_id: userId, title, prompt, mode: 'build', files, cost, owed_credits: owed }).select('id').single();
      if (saveErr || !row) throw new Error(`Saving the project failed: ${saveErr?.message || 'no row returned'}`);
      return { row, cost, owed };
    });
    const { row, cost, owed } = result;
    const changedNames = edit ? written.filter((w) => w.content !== baseMap.get(w.name)?.content).map((w) => w.name) : [];
    const keptN = edit ? base.filter((b) => !changedNames.includes(b.name)).length : 0;
    const editNote = edit ? ` ${changedNames.length} file(s) changed (${changedNames.join(', ')}); ${keptN} existing file(s) kept identical.` : '';
    await ag('engine', 'done', `${written.length} file(s) built, tested in the sandbox and saved.${editNote} ${sandboxNote}`);
    await ag('preview', 'done', `Verified: saved files served over HTTP and loaded (${pv.runtime?.elements ?? 0} elements, ${pv.runtime?.errors ?? 0} errors).${owed ? ' Locked until the owed credits are paid.' : ''}`);
    await setJob({ status: 'done', stage: 'Finished', current_step: 'done', cost, owed_credits: owed, project_id: row?.id ?? null, title });
  } catch (err) {
    for (const k of Object.keys(AG)) if (AG[k] === 'running') { try { await ag(k, 'failed', err.message || 'Build failed.'); } catch { /* ignore */ } }
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
  if (action === 'unlock') {
    const jobId = String(b.jobId || '');
    // Serialised per user and re-read inside the lock: a double click can never charge twice.
    return withUserLock(user.id, async () => {
      const { data: job } = await db.from('build_jobs').select('id,owed_credits,project_id,prompt').eq('id', jobId).eq('user_id', user.id).maybeSingle();
      if (!job) return [404, { error: 'Build not found.' }];
      const { data: files } = await db.from('build_files').select('idx,name,lang,content').eq('job_id', jobId).order('idx');
      const out = (files || []).map((f) => ({ name: f.name, lang: f.lang, content: f.content || '' }));
      if (!(job.owed_credits > 0)) return [200, { files: out, unlocked: true }];
      const { data: prof } = await db.from('profiles').select('credits').eq('id', user.id).single();
      if (!prof || prof.credits < job.owed_credits) return [402, { error: `You need ${job.owed_credits} credits to unlock this project.`, owed: job.owed_credits, credits: prof?.credits ?? 0, status: 402 }];
      const { data: balance } = await db.rpc('adjust_credits', { p_user: user.id, p_delta: -job.owed_credits, p_reason: `Unlock: ${String(job.prompt || '').slice(0, 60)}` });
      if (balance === null || balance === undefined) return [402, { error: 'Not enough credits.', owed: job.owed_credits, status: 402 }];
      if (job.project_id) await db.from('projects').update({ files: out, cost: job.owed_credits, owed_credits: 0 }).eq('id', job.project_id);
      await db.from('build_jobs').update({ cost: job.owed_credits, owed_credits: 0 }).eq('id', jobId);
      return [200, { files: out, unlocked: true, credits: balance }];
    });
  }
  if (action === 'resume') {
    const jobId = String(b.jobId || '');
    const { data: job } = await db.from('build_jobs').select('id,status,updated_at').eq('id', jobId).eq('user_id', user.id).maybeSingle();
    if (!job) return [404, { error: 'Build not found.' }];
    if (job.status === 'done') return [200, { resumed: false, status: job.status }];
    if (job.status === 'charging') return [200, { resumed: false, alive: true }];
    if (job.status === 'error') {
      if (!b.force) return [200, { resumed: false, status: job.status }];
      if (running.has(jobId) || pending.has(jobId)) return [200, { resumed: false, alive: true }];
      await db.from('build_files').update({ status: 'pending' }).eq('job_id', jobId).in('status', ['failed', 'writing']);
      await db.from('build_jobs').update({ status: 'writing', error: null, stage: 'Continuing from saved files', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', jobId);
      void queueJob(jobId, await rulesFor(user.id));
      return [200, { resumed: true, revived: true }];
    }
    if (running.has(jobId) || pending.has(jobId) || Date.now() - new Date(job.updated_at).getTime() < STALE_MS) return [200, { resumed: false, alive: true }];
    void queueJob(jobId, await rulesFor(user.id));
    return [200, { resumed: true }];
  }
  const prompt = String(b.prompt || '').trim().slice(0, 4000);
  if (!prompt) return [400, { error: 'Describe what to build.' }];
  const { data: prof } = await db.from('profiles').select('credits').eq('id', user.id).single();
  if (!prof || prof.credits < 2) return [402, { error: 'Not enough credits.', credits: prof?.credits ?? 0, status: 402 }];
  // Fair use: a user can have only a few builds in flight (live ones; abandoned jobs older than two minutes do not count).
  const { count: activeN } = await db.from('build_jobs').select('id', { count: 'exact', head: true }).eq('user_id', user.id).in('status', [...ACTIVE, 'charging']).gt('updated_at', new Date(Date.now() - 120_000).toISOString());
  if ((activeN || 0) >= MAX_ACTIVE_PER_USER) return [429, { error: `You already have ${activeN} builds running. Wait for one to finish, then try again.`, status: 429 }];
  // Existing project files (Quick Edit / Bug Fix): validated, size-limited, stored with the job.
  let baseFiles = null;
  if (Array.isArray(b.baseFiles) && b.baseFiles.length) {
    let bytes = 0;
    baseFiles = [];
    for (const f of b.baseFiles.slice(0, 60)) {
      if (!f || typeof f.name !== 'string' || typeof f.content !== 'string') continue;
      const name = cleanName(f.name);
      bytes += f.content.length;
      if (bytes > 1_500_000) return [413, { error: 'This project is too large to edit in one request.' }];
      baseFiles.push({ name, lang: ['html', 'css', 'js'].includes(f.lang) ? f.lang : LANG_OF(name), content: f.content });
    }
    if (!baseFiles.length) baseFiles = null;
  }
  const { data: job, error } = await db.from('build_jobs').insert({ user_id: user.id, session_id: b.sessionId || null, prompt, status: 'queued', stage: 'Queued', ...(baseFiles ? { base_files: { files: baseFiles } } : {}) }).select('id').single();
  if (error || !job) return [500, { error: error?.message || 'Could not start the build.' }];
  void queueJob(job.id, await rulesFor(user.id));
  return [200, { jobId: job.id, status: 'queued' }];
}

const readBody = (req) => new Promise((res) => {
  let s = '';
  req.on('data', (c) => { s += c; if (s.length > 4e6) req.destroy(); });
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
  if (req.method === 'GET') return send(200, { ok: true, running: running.size, queued: pending.size, maxConcurrent: MAX_CONCURRENT_BUILDS });
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

// Abandoned and overdue jobs: resume stale ones, time out the overdue ones. Runs on boot and every minute.
async function sweep(staleMs = STALE_MS * 2) {
  try {
    const now = Date.now();
    const { data } = await db.from('build_jobs').select('id,user_id,status,created_at,updated_at').in('status', [...ACTIVE, 'charging']).lt('updated_at', new Date(now - staleMs).toISOString()).limit(50);
    for (const j of data || []) {
      if (running.has(j.id) || pending.has(j.id)) continue;
      if (j.status === 'charging') {
        await db.from('build_jobs').update({ status: 'error', error: 'The build was interrupted while saving. Check your Credits history before retrying.', stage: 'Stopped', updated_at: new Date().toISOString() }).eq('id', j.id).eq('status', 'charging');
      } else if (now - new Date(j.created_at).getTime() > JOB_MAX_MS) {
        await db.from('build_jobs').update({ status: 'error', error: 'The build timed out and was stopped. You were not charged.', stage: 'Stopped', updated_at: new Date().toISOString() }).eq('id', j.id).in('status', ACTIVE);
      } else void rulesFor(j.user_id).then((r) => queueJob(j.id, r));
    }
    // A job that has been running far too long is stopped; it can no longer pass the charge claim.
    await db.from('build_jobs').update({ status: 'error', error: 'The build timed out and was stopped. You were not charged.', stage: 'Stopped', updated_at: new Date().toISOString() }).in('status', ACTIVE).lt('created_at', new Date(now - JOB_MAX_MS).toISOString());
  } catch (e) { console.error('sweep failed:', e.message); }
}
void sweep(STALE_MS);
setInterval(() => { void sweep(); }, 60_000).unref?.();
