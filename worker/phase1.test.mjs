// Phase 1 end-to-end tests. Runs the REAL worker/server.mjs (and its real sandbox, jsdom, consistency checks)
// against a SIMULATED Supabase REST API and a SIMULATED OpenAI streaming API (both in this file).
// So: worker logic, queue, credits flow, edit mode and checks are executed for real; the AI answers and the database are fakes.
// Run: node worker/phase1.test.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const T = { jobs: [], files: [], projects: [], profiles: [], ledger: [], user_settings: [] };
let pid = 1, fid = 1;
const now = () => new Date().toISOString();

// ------------------------------------------------------------ fake Supabase (PostgREST subset)
function applyFilters(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'columns', 'on_conflict'].includes(k)) continue;
    const [op, ...rest] = v.split('.');
    const val = rest.join('.');
    out = out.filter((r) => {
      const x = r[k];
      if (op === 'eq') return String(x) === val;
      if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(x));
      if (op === 'lt') return String(x) < val;
      if (op === 'gt') return String(x) > val;
      return true;
    });
  }
  return out;
}
const TABLE = { build_jobs: 'jobs', build_files: 'files', projects: 'projects', profiles: 'profiles', user_settings: 'user_settings' };
const fakeDb = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const send = (code, data, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(data === undefined ? '' : JSON.stringify(data)); };
    if (u.pathname === '/auth/v1/user') {
      const t = (req.headers.authorization || '').replace('Bearer ', '');
      return t.startsWith('tok-') ? send(200, { id: t.slice(4), aud: 'authenticated', email: `${t.slice(4)}@t.io` }) : send(401, { msg: 'bad' });
    }
    if (u.pathname.startsWith('/rest/v1/rpc/adjust_credits')) {
      const a = JSON.parse(body);
      const p = T.profiles.find((x) => x.id === a.p_user);
      if (!p || p.credits + a.p_delta < 0) return send(200, null);
      p.credits += a.p_delta;
      T.ledger.push({ user_id: a.p_user, delta: a.p_delta, reason: a.p_reason, balance_after: p.credits });
      return send(200, p.credits);
    }
    const tn = TABLE[u.pathname.replace('/rest/v1/', '')];
    if (!tn) return send(404, { message: 'no table' });
    const prefer = req.headers.prefer || '';
    const single = (req.headers.accept || '').includes('vnd.pgrst.object');
    const respond = (rows) => (single ? (rows.length === 1 ? send(200, rows[0]) : send(406, { message: 'no rows', code: 'PGRST116', details: '', hint: null })) : send(200, rows));
    if (req.method === 'GET' || req.method === 'HEAD') {
      let rows = applyFilters(T[tn], u.searchParams);
      const ord = u.searchParams.get('order');
      if (ord) { const [c, d] = ord.split('.'); rows = [...rows].sort((a, b) => (a[c] > b[c] ? 1 : -1) * (d === 'desc' ? -1 : 1)); }
      if (req.method === 'HEAD') return send(200, undefined, { 'content-range': `*/${rows.length}` });
      return respond(rows);
    }
    if (req.method === 'POST') {
      const arr = [].concat(JSON.parse(body));
      const made = arr.map((r) => {
        if (tn === 'jobs') return { id: randomUUID(), status: 'queued', stage: null, title: null, total_files: 0, done_files: 0, cost: 0, owed_credits: 0, error: null, project_id: null, agent_status: null, base_files: null, spec: null, job_mode: null, created_at: now(), updated_at: now(), ...r };
        if (tn === 'files') return { id: fid++, created_at: now(), content: null, ...r };
        if (tn === 'projects') return { id: pid++, created_at: now(), ...r };
        return r;
      });
      T[tn].push(...made);
      return prefer.includes('return=representation') ? respond(made) : send(201, undefined);
    }
    if (req.method === 'PATCH') {
      const rows = applyFilters(T[tn], u.searchParams);
      for (const r of rows) Object.assign(r, JSON.parse(body));
      return prefer.includes('return=representation') ? respond(rows.map((r) => ({ ...r }))) : send(204);
    }
    send(405, {});
  });
});

// ------------------------------------------------------------ fake OpenAI (streams real SSE)
const SHOP = {
  'index.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Duka</title><script src="https://cdn.tailwindcss.com"></script><link rel="stylesheet" href="./styles.css"></head><body><div id="root"></div><h1 id="title">Duka</h1><input id="search" type="text"><div id="products"></div><span id="cart-count">0</span><script src="app.js"></script></body></html>',
  'styles.css': '.card{border:1px solid #ccc;padding:8px}\nbody{font-family:sans-serif}',
  'app.js': `var products=[1,2,3,4,5,6].map(function(i){return {id:i,name:'Bidhaa '+i}});
var cart=JSON.parse(localStorage.getItem('cart')||'[]');
function render(){document.getElementById('products').innerHTML=products.map(function(p){return '<div class="card"><img src="https://images.unsplash.com/photo-0000000000?w=100" alt="x"><b>'+p.name+'</b><button onclick="addToCart('+p.id+')">Add</button></div>'}).join('');document.getElementById('cart-count').textContent=cart.length}
function addToCart(id){cart.push(id);localStorage.setItem('cart',JSON.stringify(cart));render()}
document.getElementById('search').addEventListener('input',render);render();`,
};
let aiCalls = [];
const fakeAi = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    const j = JSON.parse(body);
    const sys = j.messages[0].content, user = j.messages[1].content;
    aiCalls.push({ model: j.model, kind: sys.slice(0, 60), user: user.slice(0, 80) });
    const stream = (text) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (let i = 0; i < text.length; i += 400) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + 400) } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
      res.end();
    };
    const spec = { dom_ids: ['title', 'search', 'products', 'cart-count'], css_classes: ['card'], js_api: [{ file: 'app.js', name: 'addToCart' }], data_shapes: { Product: ['id', 'name'] }, storage_keys: ['cart'] };
    if (sys.includes('architect working on an EXISTING')) {
      if (user.includes('FIXBUG')) return stream(JSON.stringify({ mode: 'bug_fix', title: 'Duka', files: [{ name: 'app.js', action: 'modify', lang: 'js', purpose: 'Fix the cart counter crash' }], spec }));
      return stream(JSON.stringify({ mode: 'quick_edit', title: 'Duka', files: [{ name: 'index.html', action: 'modify', lang: 'html', purpose: 'Change the shop title' }], spec }));
    }
    if (sys.includes("architect. Break")) {
      await new Promise((r) => setTimeout(r, 250));
      if (user.includes('BROKEN')) return stream(JSON.stringify({ mode: 'full_build', backend: false, title: 'Broken', files: [{ name: 'index.html', lang: 'html', purpose: 'page' }, { name: 'app.js', lang: 'js', purpose: 'logic' }], spec: null }));
      return stream(JSON.stringify({ mode: 'full_build', backend: false, title: 'Duka', files: [{ name: 'index.html', lang: 'html', purpose: 'page' }, { name: 'styles.css', lang: 'css', purpose: 'look' }, { name: 'app.js', lang: 'js', purpose: 'logic' }], spec }));
    }
    if (sys.includes('editing ONE file')) {
      const cur = user.split(/CURRENT [\w.]+:\n/)[1];
      if (user.includes('FIXBUG')) return stream(cur); // the coder fails to fix it: the Debug Agent must
      return stream(cur.replace('<h1 id="title">Duka</h1>', '<h1 id="title">Duka Kubwa</h1>'));
    }
    if (sys.includes('expert front-end engineer')) {
      const name = /Now write the file: (\S+)/.exec(user)[1];
      if (user.includes('BROKEN')) return stream(name === 'index.html' ? '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="missing.js"></script><script src="app.js"></script></body></html>' : 'var x = 1;');
      return stream(SHOP[name] || '/* */');
    }
    if (sys.includes('Review Agent')) return stream('{"approved":true,"issues":[]}');
    if (sys.includes('Testing Agent')) return stream('{"flows":[{"name":"cart","ok":true,"note":"wired"}]}');
    if (sys.includes('Debug Agent')) {
      const file = /^File: (\S+)/m.exec(user)[1];
      const cur = user.split('\n\n').slice(1).join('\n\n');
      if (user.includes('cart-cuont')) return stream(cur.replace(/cart-cuont/g, 'cart-count'));
      return stream('OK');
    }
    stream('OK');
  });
});

// ------------------------------------------------------------ harness
const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const user = (id, credits) => { T.profiles.push({ id, credits }); return 'tok-' + id; };

let WORKER;
const call = async (tok, body) => { const r = await fetch(WORKER, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) }); return { status: r.status, ...(await r.json()) }; };
async function waitJob(tok, jobId, ms = 120000) {
  const t0 = Date.now();
  for (;;) {
    const r = await call(tok, { action: 'status', jobId });
    if (r.job && ['done', 'error'].includes(r.job.status)) return r;
    if (Date.now() - t0 > ms) throw new Error('timeout waiting for job');
    await sleep(300);
  }
}

const dbPort = await listen(fakeDb);
const aiPort = await listen(fakeAi);
const wport = 20000 + Math.floor(Math.random() * 10000);
WORKER = `http://127.0.0.1:${wport}`;
// an overdue job that a dead worker left behind (tested by the timeout sweep)
const staleUser = user('stale', 10);
T.jobs.push({ id: 'stale-1', user_id: 'stale', prompt: 'old', status: 'writing', stage: 'x', created_at: new Date(Date.now() - 3 * 3600_000).toISOString(), updated_at: new Date(Date.now() - 3 * 3600_000).toISOString(), error: null, base_files: null, spec: null, job_mode: null });

const child = spawn(process.execPath, [path.join(HERE, 'server.mjs')], {
  env: { PATH: process.env.PATH, PORT: String(wport), SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'x', OPENAI_API_KEY: 'x', OPENAI_BASE_URL: `http://127.0.0.1:${aiPort}`, MAX_CONCURRENT_BUILDS: '2', MAX_SANDBOX: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));
for (let i = 0; i < 50; i++) { try { await fetch(WORKER); break; } catch { await sleep(200); } }

try {
  // ---- A. Full build: external + local CSS, JS, product cards, cart with persistent storage
  const a = user('alice', 20);
  const startA = await call(a, { action: 'start', prompt: 'SHOP build me a shop website for my phones business in Dar es Salaam with products and a cart' });
  const A = await waitJob(a, startA.jobId);
  check('A. Full build finishes as done', A.job.status === 'done', A.job.error || '');
  const projA = T.projects.find((p) => p.user_id === 'alice');
  check('A. project saved with 3 files', projA && projA.files.length === 3, projA ? projA.files.map((f) => f.name).join(',') : 'none');
  const idxA = projA?.files.find((f) => f.name === 'index.html')?.content || '';
  check('A. local CSS linked and external Tailwind CDN kept', /href="\.\/styles\.css"/.test(idxA) && /cdn\.tailwindcss\.com/.test(idxA));
  check('A. broken-image fallback injected into saved index.html', /data-sb-img-fallback/.test(idxA));
  check('A. JS + product cards ran in the sandbox (clicks, no runtime errors)', /\d+ clicks/.test(A.job.agent_status.msg.testing) && /0 runtime error/.test(A.job.agent_status.msg.testing), A.job.agent_status.msg.testing);
  check('A. delivery states all passed from evidence', ['generated', 'build', 'tests', 'preview'].every((k) => A.job.agent_status.delivery[k] === 'passed'), JSON.stringify(A.job.agent_status.delivery));
  const ledA = T.ledger.filter((l) => l.user_id === 'alice');
  check('E. success charged exactly once, matching the ledger', ledA.length === 1 && T.profiles.find((p) => p.id === 'alice').credits === 20 + ledA[0].delta && ledA[0].delta === -A.job.cost, JSON.stringify(ledA));

  // ---- B. Quick edit on the existing project
  const base = projA.files;
  aiCalls = [];
  const startB = await call(a, { action: 'start', prompt: 'EDITTITLE change the shop title to Duka Kubwa', baseFiles: base });
  const B = await waitJob(a, startB.jobId);
  check('B. Quick Edit finishes as done', B.job.status === 'done', B.job.error || '');
  const projB = T.projects.filter((p) => p.user_id === 'alice').at(-1);
  const get = (p, n) => p.files.find((f) => f.name === n)?.content;
  check('B. the requested change is applied', /Duka Kubwa/.test(get(projB, 'index.html')));
  check('B. unrelated files byte-identical (styles.css, app.js)', get(projB, 'styles.css') === get(projA, 'styles.css') && get(projB, 'app.js') === get(projA, 'app.js'));
  check('B. still 3 files (no replacement by a new index.html)', projB.files.length === 3);
  check('B. only one coding call, no full rebuild, planner used the edit prompt', aiCalls.filter((c) => c.kind.includes('editing ONE file')).length === 1 && !aiCalls.some((c) => c.kind.includes('architect. Break')), JSON.stringify(aiCalls.map((c) => c.kind.slice(0, 30))));
  const costB = T.ledger.filter((l) => l.user_id === 'alice').at(-1);
  check('E. Quick Edit charged once at the single-file rate', T.ledger.filter((l) => l.user_id === 'alice').length === 2 && costB.delta === -B.job.cost && B.job.cost <= 2, `cost ${B.job.cost}`);

  // ---- C. Bug fix: the coder leaves the bug, the Debug Agent must find and repair it
  const bugBase = projA.files.map((f) => (f.name === 'app.js' ? { ...f, content: f.content.replace("'cart-count'", "'cart-cuont'") } : f));
  aiCalls = [];
  const startC = await call(a, { action: 'start', prompt: 'FIXBUG the cart counter does not update and the page errors', baseFiles: bugBase });
  const C = await waitJob(a, startC.jobId);
  const projC = T.projects.filter((p) => p.user_id === 'alice').at(-1);
  check('C. Bug Fix finishes as done', C.job.status === 'done', C.job.error || '');
  check('C. Debug Agent was called with the real problem and repaired app.js', aiCalls.some((c) => c.kind.includes('Debug Agent')) && !/cart-cuont/.test(get(projC, 'app.js')) && /Fixed \d+ problem/.test(C.job.agent_status.msg.debug), C.job.agent_status.msg.debug);
  check('C. other files untouched by the bug fix', get(projC, 'index.html') === get(projA, 'index.html') && get(projC, 'styles.css') === get(projA, 'styles.css'));

  // ---- D/6. Failed build and missing CSS/image references: never reported as success, never charged
  const d = user('dora', 10);
  const startD = await call(d, { action: 'start', prompt: 'BROKEN build a landing page with a missing script reference' });
  const D = await waitJob(d, startD.jobId);
  check('D. broken build ends as error, not done', D.job.status === 'error', D.job.error || '');
  check('D. no project saved, balance and ledger unchanged', !T.projects.some((p) => p.user_id === 'dora') && T.profiles.find((p) => p.id === 'dora').credits === 10 && !T.ledger.some((l) => l.user_id === 'dora'));
  check('D. preview and tests are NOT marked passed', D.job.agent_status.delivery.tests === 'failed' && D.job.agent_status.delivery.preview !== 'passed', JSON.stringify(D.job.agent_status.delivery));
  check('D. real error shown (missing.js)', /missing\.js/.test(D.job.error), D.job.error);
  check('D. generated files kept as a draft', T.files.filter((f) => f.job_id === startD.jobId).length === 2);

  // ---- 7. Concurrency
  const r1 = user('race', 3);
  const s1 = await call(r1, { action: 'start', prompt: 'SHOP one two three four five six seven eight nine ten eleven twelve' });
  const s2 = await call(r1, { action: 'start', prompt: 'SHOP one two three four five six seven eight nine ten eleven twelve again' });
  const s3 = await call(r1, { action: 'start', prompt: 'SHOP third at the same time' });
  check('7. third simultaneous build from one user is refused (limit 2)', s3.status === 429, JSON.stringify(s3));
  const [R1, R2] = await Promise.all([waitJob(r1, s1.jobId), waitJob(r1, s2.jobId)]);
  const bal = T.profiles.find((p) => p.id === 'race').credits;
  const charges = T.ledger.filter((l) => l.user_id === 'race');
  check('7/E. balance never negative; exactly one job charged, the other locked (owed)', bal >= 0 && charges.length === 1 && [R1, R2].filter((x) => x.job.owed_credits > 0).length === 1, `balance ${bal}, charges ${charges.length}, owed ${R1.job.owed_credits}/${R2.job.owed_credits}`);
  check('7. each job kept its own independent status/ids', R1.job.id !== R2.job.id && R1.job.status === 'done' && R2.job.status === 'done');
  // queue: 4 users at once, only 2 may run
  const qs = [];
  for (let i = 0; i < 4; i++) { const t = user('q' + i, 10); qs.push([t, (await call(t, { action: 'start', prompt: 'SHOP queued build ' + i })).jobId]); }
  await sleep(150);
  const stages = qs.map(([, id]) => T.jobs.find((j) => j.id === id).stage);
  check('7. extra jobs wait in a queue (max 2 running)', stages.filter((s) => /Waiting in the build queue/.test(s || '')).length >= 1, JSON.stringify(stages));
  const health = await (await fetch(WORKER)).json();
  check('7. health reports running/queued counts', health.running <= 2 && health.maxConcurrent === 2, JSON.stringify(health));
  const done = await Promise.all(qs.map(([t, id]) => waitJob(t, id)));
  check('7. all queued jobs finish independently', done.every((x) => x.job.status === 'done'));
  const dup = await call(qs[0][0], { action: 'resume', jobId: qs[0][1] });
  check('7. resuming a finished job does not run or charge again', dup.resumed === false && T.ledger.filter((l) => l.user_id === 'q0').length === 1);
  check('7. abandoned overdue job was timed out by the sweep, uncharged', T.jobs.find((j) => j.id === 'stale-1').status === 'error' && /timed out/.test(T.jobs.find((j) => j.id === 'stale-1').error) && !T.ledger.some((l) => l.user_id === 'stale'));
} finally {
  child.kill();
  fakeDb.close(); fakeAi.close();
}
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
if (bad.length) { console.log('--- worker log ---\n' + log.slice(-1500)); process.exit(1); }
process.exit(0);
