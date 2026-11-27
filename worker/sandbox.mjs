// SwiftBuild AI: Project Execution Engine (real sandbox build runner).
// Infrastructure: plain Node child process on the Render Worker (no Docker, no real browser is assumed).
// Per run it: writes the project to a private temp dir, runs `npm install` + `npm run build` if a package.json exists,
// starts a local HTTP server, fetches the entry page and every local asset over HTTP, loads the page in jsdom
// (a DOM + JavaScript runtime, NOT a graphical browser) with scripts executed, captures runtime errors,
// and clicks through buttons and types into inputs to surface handler errors.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const MAX_FILES = 60;
const MAX_BYTES = 6 * 1024 * 1024;
const CHILD_TIMEOUT_MS = 240_000;

function safeName(n) {
  const s = String(n || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!s || s.startsWith('/') || s.split('/').includes('..') || /[\0]/.test(s)) return null;
  return s;
}

/** Parent side: returns {ok, problems:[{file,problem}], warnings, logs, install, build, http, runtime, ms}. */
export async function runSandbox(files) {
  const t0 = Date.now();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-'));
  try {
    let bytes = 0;
    const list = (files || []).slice(0, MAX_FILES);
    for (const f of list) {
      const n = safeName(f.name);
      if (!n) continue;
      const c = String(f.content ?? '');
      bytes += Buffer.byteLength(c);
      if (bytes > MAX_BYTES) return fail('Project is larger than the 6 MB sandbox limit.', t0);
      const p = path.join(dir, n);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, c);
    }
    const out = await new Promise((resolve) => {
      const child = spawn(process.execPath, ['--max-old-space-size=384', SELF, '--child', dir], {
        cwd: dir,
        env: { PATH: process.env.PATH || '', HOME: dir, NODE_ENV: 'production', CI: '1' }, // no secrets reach generated code
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let so = '';
      let se = '';
      child.stdout.on('data', (d) => { so += d; if (so.length > 2e6) so = so.slice(-2e6); });
      child.stderr.on('data', (d) => { se += d; if (se.length > 2e5) se = se.slice(-2e5); });
      const killer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, CHILD_TIMEOUT_MS);
      child.on('close', (code) => {
        clearTimeout(killer);
        const line = so.split('\n').reverse().find((l) => l.startsWith('@@RESULT@@'));
        if (!line) return resolve({ crashed: `Sandbox process exited (${code}) without a result. ${se.slice(-400)}` });
        try { resolve(JSON.parse(line.slice(10))); } catch { resolve({ crashed: 'Sandbox returned unreadable output.' }); }
      });
    });
    if (out.crashed) return fail(out.crashed, t0);
    return { ...out, ms: Date.now() - t0 };
  } catch (e) {
    return fail(`Sandbox failed to start: ${e.message}`, t0);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp dir */ }
  }
}

function fail(msg, t0) {
  return { ok: false, problems: [{ file: 'index.html', problem: msg }], warnings: [], logs: [msg], runtime: {}, ms: Date.now() - t0, infra: true };
}

// ---------------------------------------------------------------- child side
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', ico: 'image/x-icon', txt: 'text/plain' };

async function child(dir) {
  const R = { ok: false, problems: [], warnings: [], logs: [], install: { ran: false }, build: { ran: false }, http: {}, runtime: { errors: 0, clicks: 0, inputs: 0 } };
  const addProblem = (file, problem) => { if (!R.problems.some((p) => p.file === file && p.problem === problem)) R.problems.push({ file, problem: String(problem).slice(0, 400) }); };
  let root = dir;

  // 1. Dependency install + build, only when the project really has a package.json.
  const pkgPath = path.join(dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    let pkg = {};
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch (e) { addProblem('package.json', `package.json is not valid JSON: ${e.message}`); }
    if (!R.problems.length) {
      const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
      if (deps.length) {
        const r = spawnSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir, encoding: 'utf8', timeout: 150_000, env: { ...process.env } });
        R.install = { ran: true, ok: r.status === 0, log: String((r.stderr || '') + (r.stdout || '')).slice(-600) };
        R.logs.push(`npm install: ${R.install.ok ? 'ok' : 'FAILED'} (${deps.length} dependencies)`);
        if (!R.install.ok) addProblem('package.json', `npm install failed: ${R.install.log.split('\n').filter(Boolean).slice(-3).join(' | ')}`);
      }
      if (pkg.scripts?.build && (R.install.ok || !deps.length)) {
        const r = spawnSync('npm', ['run', 'build', '--silent'], { cwd: dir, encoding: 'utf8', timeout: 150_000, env: { ...process.env } });
        R.build = { ran: true, ok: r.status === 0, log: String((r.stderr || '') + (r.stdout || '')).slice(-800) };
        R.logs.push(`npm run build: ${R.build.ok ? 'ok' : 'FAILED'}`);
        if (!R.build.ok) addProblem('package.json', `Build failed: ${R.build.log.split('\n').filter(Boolean).slice(-4).join(' | ')}`);
        else for (const d of ['dist', 'build']) if (fs.existsSync(path.join(dir, d, 'index.html'))) { root = path.join(dir, d); break; }
      }
    }
    if (R.problems.length) return R;
  } else {
    R.logs.push('Static project: no package.json, no dependencies to install, nothing to compile.');
  }

  if (!fs.existsSync(path.join(root, 'index.html'))) { addProblem('index.html', 'index.html is missing from the project.'); return R; }

  // 2. Local preview server.
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const fp = path.join(root, path.normalize(p));
    if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[fp.split('.').pop().toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  try {
    // 3. Fetch the page and every local asset over real HTTP.
    const page = await fetch(base);
    R.http.index = page.status;
    if (page.status !== 200) { addProblem('index.html', `Preview server returned HTTP ${page.status} for the home page.`); return R; }
    const html = await page.text();
    const refs = [...html.matchAll(/<(?:script|link|img|source)\b[^>]*?(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
    const local = [...new Set(refs.filter((u) => !/^(https?:|\/\/|data:|#|mailto:|tel:|javascript:)/i.test(u)))];
    const external = [...new Set(refs.filter((u) => /^https?:/i.test(u) && /\.(js|css)(\?|$)|cdn|unpkg|fonts\.googleapis/i.test(u)))];
    R.http.assets = local.length;
    for (const u of local) {
      const r = await fetch(new URL(u, base)).catch(() => null);
      if (!r || r.status !== 200) addProblem('index.html', `Asset "${u}" returned HTTP ${r ? r.status : 'error'} from the preview server.`);
    }
    // External dependencies (CDN): checked and reported; network problems are warnings, not project bugs.
    let extOk = 0;
    for (const u of external.slice(0, 8)) {
      try { const r = await fetch(u, { method: 'HEAD', signal: AbortSignal.timeout(7000), redirect: 'follow' }); if (r.status < 400) extOk++; else R.warnings.push(`CDN ${u.slice(0, 60)} returned ${r.status}`); } catch { R.warnings.push(`CDN ${u.slice(0, 60)} unreachable from the worker`); }
    }
    R.http.cdn = `${extOk}/${Math.min(external.length, 8)} reachable`;
    if (R.problems.length) return R;

    // 4. Execute the page's JavaScript in jsdom and capture runtime errors.
    const { JSDOM, VirtualConsole, ResourceLoader } = await import('jsdom');
    const errors = [];
    const vc = new VirtualConsole();
    const where = (s) => { const m = String(s || '').match(/127\.0\.0\.1:\d+\/([^\s:)?#]+)/); return m ? decodeURIComponent(m[1]) : 'index.html'; };
    vc.on('jsdomError', (e) => { const d = e.detail || e; errors.push({ file: where(d.stack || e.stack), msg: String(d.message || e.message || e).split('\n')[0] }); });
    vc.on('error', (...a) => errors.push({ file: 'index.html', msg: `console.error: ${a.map(String).join(' ').slice(0, 200)}` }));
    class Loader extends ResourceLoader { fetch(url, o) { return url.startsWith(base) ? super.fetch(url, o) : Promise.resolve(Buffer.from('')); } }
    const dom = await JSDOM.fromURL(base, {
      runScripts: 'dangerously', resources: new Loader(), pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(w) {
        // CDN libraries are not downloaded into the sandbox: provide inert stand-ins so only the project's own code is judged.
        w.lucide = { createIcons() {}, icons: {} }; w.tailwind = { config: {} };
        w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
        w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
        w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
        w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        w.open = () => null;
      },
    });
    const win = dom.window;
    await new Promise((r) => { if (win.document.readyState === 'complete') r(); else win.addEventListener('load', r); setTimeout(r, 4000); });
    await new Promise((r) => setTimeout(r, 600));
    const doc = win.document;
    R.runtime.title = doc.title || '';
    R.runtime.bodyChars = (doc.body?.textContent || '').trim().length;
    R.runtime.elements = doc.querySelectorAll('*').length;
    if (R.runtime.bodyChars < 3 && doc.querySelectorAll('img,canvas,svg').length === 0) addProblem('index.html', 'The page rendered empty: no visible content after its scripts ran.');

    // 5. Interact: type into inputs, click every button and handler element.
    for (const el of [...doc.querySelectorAll('input[type=text],input[type=search],input:not([type]),textarea')].slice(0, 6)) {
      try { el.value = 'a'; el.dispatchEvent(new win.Event('input', { bubbles: true })); el.dispatchEvent(new win.KeyboardEvent('keyup', { bubbles: true, key: 'a' })); R.runtime.inputs++; } catch (e) { errors.push({ file: 'index.html', msg: e.message }); }
    }
    const clickable = [...doc.querySelectorAll('button,[onclick],[role=button],.btn')].filter((e) => !e.disabled).slice(0, 40);
    for (const el of clickable) {
      try { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win })); R.runtime.clicks++; } catch (e) { errors.push({ file: 'index.html', msg: e.message }); }
    }
    await new Promise((r) => setTimeout(r, 400));
    R.runtime.errors = errors.length;
    for (const e of errors.slice(0, 6)) addProblem(e.file, `Runtime error: ${e.msg}`);
    R.logs.push(`Loaded in jsdom: ${R.runtime.elements} elements, ${R.runtime.clicks} clicks, ${R.runtime.inputs} inputs, ${errors.length} runtime error(s).`);
    win.close();
  } catch (e) {
    addProblem('index.html', `Preview could not run: ${e.message}`);
  } finally {
    server.close();
  }
  R.ok = R.problems.length === 0;
  return R;
}

if (process.argv[2] === '--child') {
  child(process.argv[3]).then((r) => { r.ok = r.problems.length === 0; console.log('@@RESULT@@' + JSON.stringify(r)); process.exit(0); }, (e) => { console.log('@@RESULT@@' + JSON.stringify({ ok: false, problems: [{ file: 'index.html', problem: `Sandbox error: ${e.message}` }], logs: [], warnings: [], runtime: {} })); process.exit(0); });
}
