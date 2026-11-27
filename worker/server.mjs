// SwiftBuild AI: persistent build worker (Node 20+). No per-request time limit.
// Same API as the Supabase `build-app` function: POST / {action: start|status|resume, ...}
// Uses the same tables (build_jobs, build_files, projects, profiles) and adjust_credits RPC.
import http from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { collectCompletion, looksComplete, parseJsonStrict, stripFence } from './sse.mjs';
import { BACKEND_SYSTEM, REVIEW_SYSTEM, TEST_SYSTEM, runTests, staticCheck } from './agents.mjs';
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

for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY']) {
  if (!env[k]) { console.error(`Missing env ${k}`); process.exit(1); }
}
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const PLAN_SYSTEM = `You are SwiftBuild AI's architect. Break the user's request into a set of separate files (3 to ${MAX_FILES} files), so each file can be written on its own. Good examples: index.html, styles.css, app.js, components like Sidebar.js, GameBoard.js, PricingCard.js, GameLogic.js, data.js. Keep each file focused on one job. Plain HTML/CSS/vanilla JavaScript only, no build tools, no npm. First classify the request: "quick_edit" (a small tweak or tiny single-page change) or "full_build" (a new or large project). For quick_edit list only index.html. Also decide "backend": true only if the project needs saved data, accounts, forms that store data, or API/WhatsApp integrations (a data layer file data.js will then be written by a separate Backend Agent; do not list data.js yourself). Reply ONLY JSON: {"mode": "quick_edit"|"full_build", "backend": boolean, "title": string (max 5 words), "files": [{"name": string, "lang": "html"|"css"|"js", "purpose": string (one sentence)}]}. The first file must be index.html, which loads every other file (CSS via <link>, JS via <script src>).`;
const FILE_SYSTEM = `You are SwiftBuild AI, an expert front-end engineer. Write ONE complete file for the project described. The file must be real, working, polished and responsive, with real specific content for the user's request, never lorem ipsum, never a placeholder. Other files in the same project are listed for context; reference them by exact name. Reply with ONLY the raw complete file text: no JSON, no markdown fences, no commentary. No code comments. Never stop early and never leave a section unfinished.
QUALITY BAR: build a complete, premium, fully working interactive single-page app on the level of Bolt.new and Lovable, never a short page of a few lines. Rules:
- Load Tailwind CSS from https://cdn.tailwindcss.com, Lucide icons from https://unpkg.com/lucide@latest (call lucide.createIcons() after every render), and Google Fonts (Plus Jakarta Sans for headings, Inter for body) in index.html.
- Include: a modern sticky navigation bar, an eye-catching hero section, a search box plus category filter chips that really filter the items, 6 to 8 product/service cards with real high-quality photos from https://images.unsplash.com/photo-... (use real Unsplash photo URLs with ?auto=format&fit=crop&w=800&q=80), prices, discount badges, an interactive cart drawer (add, remove, quantity, running total, persisted in JavaScript state), and a complete footer. Add hover micro-interactions and responsive layout for mobile, tablet and desktop.
- All behaviour is written in real JavaScript, with realistic specific content and data for the user's business.
- If the user gives a phone or WhatsApp number, wire it in directly: every product gets an "Agiza kwa WhatsApp" / "Order on WhatsApp" button opening https://wa.me/<digits only, with country code>?text=<encodeURIComponent of a neat message with product name and price>, the cart has a checkout button sending the whole order list and total the same way, plus a green floating WhatsApp button fixed at bottom right.
- Write ALL website text in the same language the user wrote in (if Swahili, pure natural Swahili everywhere: nav, buttons, cards, footer, messages).
- If the project is split in several files, keep this behaviour but put it in the files assigned to it; index.html must still render a full page.`;

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
    if (!job || job.status === 'done' || job.status === 'error') return;
    const userId = job.user_id;
    const prompt = String(job.prompt || '');
    let { data: rows } = await db.from('build_files').select('idx,name,lang,purpose,status,content').eq('job_id', jobId).order('idx');
    let title = String(job.title || 'New project');

    if (!rows || rows.length === 0) {
      await setJob({ status: 'planning', stage: 'Planning Agent', current_step: 'orchestrator' });
      await ag('planning', 'running', 'Analysing your request and planning files');
      let plan = null, planErr = null;
      for (let a = 1; a <= 3 && !plan; a++) {
        try { plan = parseJsonStrict(await streamText(PLAN_SYSTEM + rules, prompt, 800, true, PLAN_MODEL)); } catch (e) { planErr = e; }
      }
      if (!plan) throw planErr || new Error('Planning failed.');
      const quick = plan.mode === 'quick_edit';
      const planned = (plan.files || []).filter((f) => f && typeof f.name === 'string').slice(0, quick ? 1 : MAX_FILES)
        .map((f) => ({ name: cleanName(f.name), lang: LANG_OF(String(f.name)), purpose: String(f.purpose || '').slice(0, 200) }));
      if (!planned.some((f) => f.name === 'index.html')) throw new Error('The planner returned no index.html.');
      // Central Orchestrator: the Backend Agent only runs for full builds that need a data layer.
      if (!quick && plan.backend === true && !planned.some((f) => f.name === 'data.js')) {
        planned.push({ name: 'data.js', lang: 'js', purpose: 'Data layer (window.AppData): storage, validation and integrations. Load it with <script src="data.js"></script> BEFORE other scripts and use window.AppData.' });
      }
      await ag('planning', 'done', `${quick ? 'Quick Edit' : 'Full Build'}: ${planned.length} file(s) planned${planned.some((f) => f.name === 'data.js') ? ', backend needed' : ''}`);
      title = String(plan.title || 'New project').slice(0, 60);
      await db.from('build_files').insert(planned.map((f, i) => ({ job_id: jobId, user_id: userId, idx: i, name: f.name, lang: f.lang, purpose: f.purpose, status: 'pending', content: f.name === 'index.html' ? baseHtml(title) : null })));
      await setJob({ status: 'writing', stage: 'Coding Agent & Backend Manager', current_step: 'coding', title, total_files: planned.length });
      ({ data: rows } = await db.from('build_files').select('idx,name,lang,purpose,status,content').eq('job_id', jobId).order('idx'));
    } else {
      await setJob({ status: 'writing', stage: 'Resuming build', current_step: 'coding' });
      await ag('planning', 'done', 'Plan restored from saved files');
    }
    const hasBackend = (rows || []).some((f) => f.name === 'data.js');

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
          content = stripFence(await streamText((f.name === 'data.js' && hasBackend ? BACKEND_SYSTEM : FILE_SYSTEM) + rules, user, 16000, false, CODE_MODEL));
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
    // Coding Agent and Backend Agent run in parallel on disjoint files (no shared file is written twice).
    const group = async (key, list, label) => {
      if (!list.length) { await ag(key, 'skipped', 'Not needed for this request'); return []; }
      await ag(key, 'running', label);
      const rs = await Promise.allSettled(list.map(writeOne));
      const bad = rs.find((r) => r.status === 'rejected');
      await ag(key, bad ? 'failed' : 'done', bad ? bad.reason?.message : `${list.length} file(s) written`);
      return rs;
    };
    const isBE = (f) => hasBackend && f.name === 'data.js';
    const groups = await Promise.all([
      group('coding', all.filter((f) => !isBE(f)), 'Writing pages, components and styles'),
      group('backend', all.filter(isBE), 'Writing the data layer and integrations'),
    ]);
    const failed = groups.flat().find((r) => r.status === 'rejected');
    if (failed) throw failed.reason;
    written.sort((a, b) => all.findIndex((x) => x.name === a.name) - all.findIndex((x) => x.name === b.name));

    // Review Agent: skipped for light edits (one file) to save time and cost.
    const light = written.length <= 1;
    let issues = [];
    if (light) {
      await ag('review', 'skipped', 'Quick Edit: lightweight path');
    } else {
      await setJob({ stage: 'Review Agent', current_step: 'debug' });
      await ag('review', 'running', 'Reviewing code against the plan');
      try {
        const body = written.map((w) => `=== ${w.name} ===\n${w.content.slice(0, 12000)}`).join('\n\n');
        const rv = parseJsonStrict(await streamText(REVIEW_SYSTEM, `Request: ${prompt}\n\nPlan:\n${manifest}\n\n${body}`, 1200, true, PLAN_MODEL));
        issues = (Array.isArray(rv.issues) ? rv.issues : []).filter((i) => i && written.some((w) => w.name === i.file)).slice(0, 6).map((i) => ({ file: i.file, problem: String(i.problem || '').slice(0, 300) }));
        await ag('review', 'done', issues.length ? `${issues.length} issue(s) sent to the Debug Agent` : 'Approved: code matches the plan');
      } catch (e) {
        await ag('review', 'failed', `Review could not complete: ${e.message}`);
      }
    }

    // Debug Agent: real syntax/reference checks plus review issues; max 2 repair rounds, never keeps a worse file.
    await setJob({ stage: 'Debug Agent', current_step: 'debug' });
    DEL.generated = 'passed';
    await ag('debug', 'running', 'Checking syntax, references and runtime errors');
    await ag('engine', 'running', 'Sandbox: installing dependencies, building, serving and running the app');
    let sb = await runSandbox(written);
    const sbProblems = () => (sb.infra ? [] : sb.problems);
    let problems = [...issues, ...staticCheck(written), ...sbProblems()];
    const firstCount = problems.length;
    let lastSig = '';
    for (let round = 1; round <= 2 && problems.length; round++) {
      const sig = problems.map((p) => `${p.file}|${p.problem}`).sort().join('\n');
      if (sig === lastSig) break; // the last repair changed nothing: do not loop
      lastSig = sig;
      await ag('debug', 'running', `Repair round ${round}/2: ${problems.length} problem(s)`);
      const byFile = new Map();
      for (const p of problems) byFile.set(p.file, [...(byFile.get(p.file) || []), p.problem]);
      await Promise.allSettled([...byFile].map(async ([name, list]) => {
        const w = written.find((x) => x.name === name);
        if (!w) return;
        try {
          const out = stripFence(await streamText(DEBUG_SYSTEM, `File: ${name}\nProblems found (fix exactly these, change nothing unrelated):\n- ${list.join('\n- ')}\nOther files:\n${manifest}\n\n${w.content}`, 16000, false, DEBUG_MODEL));
          if (!out || /^OK\.?$/i.test(out.trim())) return;
          if (out.length < w.content.length * 0.7 || !looksComplete(name, out)) return;
          const next = name === 'index.html' ? ensureHtml(out, title) : out;
          const others = written.filter((x) => x.name !== name);
          if (staticCheck([...others, { name, content: next }]).length > staticCheck(written).length) return;
          w.content = next;
          await db.from('build_files').update({ content: next }).eq('job_id', jobId).eq('name', name);
        } catch { /* keep the working version */ }
      }));
      await ag('engine', 'running', `Sandbox: re-running build and tests after repair ${round}/2`);
      sb = await runSandbox(written);
      problems = [...staticCheck(written), ...sbProblems()];
    }
    const remaining = [...staticCheck(written), ...sbProblems()];
    await ag('debug', remaining.length ? 'failed' : 'done', remaining.length ? `${remaining.length} problem(s) remain: ${remaining[0].file}: ${remaining[0].problem}` : firstCount ? `Fixed ${firstCount} problem(s)` : 'No errors found');

    // Testing Agent: automated tests are authoritative; the AI only reports on user flows.
    await setJob({ stage: 'Testing Agent', current_step: 'debug' });
    await ag('testing', 'running', 'Running automated checks');
    const tr = runTests(written);
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
    const passedN = tr.checks.filter((c) => c.ok).length;
    // Real execution evidence decides delivery. Generated code alone is never "success".
    const rt = sb.runtime || {};
    const buildOk = !sb.infra && !(sb.install?.ran && !sb.install.ok) && !(sb.build?.ran && !sb.build.ok);
    DEL.build = buildOk ? 'passed' : 'failed';
    const sandboxNote = sb.infra ? sb.problems[0].problem : `Sandbox: HTTP ${sb.http?.index ?? '-'}, ${sb.http?.assets ?? 0} local assets, CDN ${sb.http?.cdn ?? 'n/a'}, ${rt.clicks ?? 0} clicks, ${rt.inputs ?? 0} inputs, ${rt.errors ?? 0} runtime error(s).`;
    const testsOk = tr.passed && sb.ok;
    DEL.tests = testsOk ? 'passed' : 'failed';
    await ag('testing', testsOk ? 'done' : 'failed', `${passedN}/${tr.checks.length} static checks.${flowNote} ${sandboxNote}`);
    if (!testsOk) {
      const all = [...tr.probs, ...sbProblems()];
      const first = (all[0] ? `${all[0].file}: ${all[0].problem}` : sb.infra ? sb.problems[0].problem : 'Automated tests failed.');
      await ag('engine', 'failed', sb.infra ? first : `Build/tests failed after the repair attempts. ${first}`);
      DEL.preview = 'failed';
      await ag('preview', 'pending', 'Not verified: the build or tests failed');
      throw new Error(`Build or tests failed after 2 repair attempts, so this project was not delivered. Error: ${first}. Your generated files are kept as a draft and you were not charged.`);
    }
    await ag('engine', 'done', sandboxNote);

    // Preview verification BEFORE any charge: read the stored files back and run them through the preview server again.
    await ag('preview', 'running', 'Loading the saved project from storage over HTTP');
    const { data: saved } = await db.from('build_files').select('name,content').eq('job_id', jobId);
    const pv = await runSandbox((saved || []).map((s) => ({ name: s.name, content: s.content || '' })));
    if (!pv.ok) {
      DEL.preview = 'failed';
      const why = pv.problems[0]?.problem || 'unknown error';
      await ag('preview', 'failed', `Preview did not load: ${why}`);
      throw new Error(`Preview verification failed: ${why}. Your generated files are kept as a draft and you were not charged.`);
    }
    DEL.preview = 'passed';
    // Charge only after success, never more than the balance.
    const { data: prof } = await db.from('profiles').select('credits').eq('id', userId).single();
    const fullCost = Math.max(0, buildCost(prompt, written));
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
    await ag('engine', 'done', `${written.length} file(s) built, tested in the sandbox and saved. ${sandboxNote}`);
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
