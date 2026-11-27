// SwiftBuild AI: Project Execution Engine on an E2B cloud sandbox.
// Writes the project to /home/user/app in a fresh E2B sandbox, runs npm install / npm run build / node --check,
// serves the result and probes it over real HTTP. Always kills the sandbox. Returns the same shape as runSandbox().
// Without E2B_API_KEY, or when E2B itself is unavailable, it returns {unavailable:true} and the caller falls back.
import { Sandbox } from 'e2b';

const APP = '/home/user/app';
const TOTAL_TIMEOUT_MS = Number(process.env.E2B_TIMEOUT_MS || 240_000);
const MIME_OK = /^(text\/html|application\/xhtml)/i;

export const e2bEnabled = () => Boolean(process.env.E2B_API_KEY);

function safeName(n) {
  const s = String(n || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!s || s.startsWith('/') || s.split('/').includes('..') || /\0/.test(s)) return null;
  return s;
}

async function run(sbx, cmd, timeoutMs) {
  try {
    const r = await sbx.commands.run(cmd, { cwd: APP, timeoutMs, envs: { CI: '1', NODE_ENV: 'development' } });
    return { code: r.exitCode ?? 0, out: String((r.stderr || '') + (r.stdout || '')) };
  } catch (e) {
    // The SDK throws CommandExitError for a non-zero exit: that is a real build failure, not an infrastructure failure.
    if (e && typeof e.exitCode === 'number') return { code: e.exitCode, out: String((e.stderr || '') + (e.stdout || '') || e.message) };
    throw e;
  }
}

const tail = (s, n) => String(s || '').split('\n').filter(Boolean).slice(-n).join(' | ').slice(0, 400);

export async function runE2B(files) {
  const t0 = Date.now();
  if (!e2bEnabled()) return { unavailable: true, reason: 'E2B_API_KEY is not set' };
  const R = { ok: false, problems: [], warnings: [], logs: [], install: { ran: false }, build: { ran: false }, http: {}, runtime: { errors: 0, clicks: 0, inputs: 0 }, engine: 'e2b' };
  const addProblem = (file, problem) => { if (!R.problems.some((p) => p.file === file && p.problem === problem)) R.problems.push({ file, problem: String(problem).slice(0, 400) }); };
  let sbx;
  const guard = new Promise((_, rej) => setTimeout(() => rej(new Error('E2B run exceeded its time limit')), TOTAL_TIMEOUT_MS + 20_000));
  try {
    return await Promise.race([guard, (async () => {
      try {
        sbx = await Sandbox.create({ apiKey: process.env.E2B_API_KEY, timeoutMs: TOTAL_TIMEOUT_MS, metadata: { app: 'swiftbuild' } });
      } catch (e) { return { unavailable: true, reason: `E2B sandbox could not start: ${e.message}` }; }
      R.logs.push(`E2B sandbox ${sbx.sandboxId} started`);

      const list = (files || []).slice(0, 80).map((f) => ({ path: `${APP}/${safeName(f.name)}`, name: safeName(f.name), data: String(f.content ?? '') })).filter((f) => f.name);
      await sbx.files.write(list.map((f) => ({ path: f.path, data: f.data })));
      R.logs.push(`Wrote ${list.length} file(s) to ${APP}`);

      // 1. Dependencies and build.
      let root = APP;
      const pkgFile = list.find((f) => f.name === 'package.json');
      if (pkgFile) {
        let pkg = {};
        try { pkg = JSON.parse(pkgFile.data); } catch (e) { addProblem('package.json', `package.json is not valid JSON: ${e.message}`); }
        if (!R.problems.length) {
          const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
          if (deps.length) {
            const r = await run(sbx, 'npm install --no-audit --no-fund --loglevel=error', 150_000);
            R.install = { ran: true, ok: r.code === 0, log: r.out.slice(-600) };
            R.logs.push(`npm install: ${r.code === 0 ? 'ok' : 'FAILED'} (${deps.length} dependencies)`);
            if (r.code !== 0) addProblem('package.json', `npm install failed: ${tail(r.out, 3)}`);
          }
          if (pkg.scripts?.build && (R.install.ok || !deps.length)) {
            const r = await run(sbx, 'npm run build --silent', 150_000);
            R.build = { ran: true, ok: r.code === 0, log: r.out.slice(-800) };
            R.logs.push(`npm run build: ${r.code === 0 ? 'ok' : 'FAILED'}`);
            if (r.code !== 0) addProblem('package.json', `Build failed: ${tail(r.out, 4)}`);
            else for (const d of ['dist', 'build']) {
              const t = await run(sbx, `test -f ${d}/index.html`, 10_000);
              if (t.code === 0) { root = `${APP}/${d}`; break; }
            }
          }
        }
      } else R.logs.push('Static project: no package.json, nothing to install or compile.');
      if (R.problems.length) return R;

      // 2. Syntax check of every plain JavaScript file (Node parser inside the sandbox).
      for (const f of list.filter((x) => /\.(m?js)$/i.test(x.name) && !/^(node_modules|dist|build)\//.test(x.name)).slice(0, 30)) {
        const r = await run(sbx, `node --check "${f.name}"`, 15_000);
        if (r.code !== 0) addProblem(f.name, `Syntax error: ${tail(r.out, 3)}`);
      }
      if (R.problems.length) return R;

      const has = await run(sbx, `test -f ${root}/index.html`, 10_000);
      if (has.code !== 0) { addProblem('index.html', 'index.html is missing from the build output.'); return R; }

      // 3. Serve and probe the real preview over HTTP.
      await sbx.commands.run(`python3 -m http.server 3000 --directory ${root}`, { background: true, cwd: root });
      const base = `https://${sbx.getHost(3000)}/`;
      let page = null;
      for (let i = 0; i < 12 && !page; i++) {
        await new Promise((r) => setTimeout(r, 700));
        page = await fetch(base, { signal: AbortSignal.timeout(8000) }).then((r) => (r.status === 200 ? r : null)).catch(() => null);
      }
      if (!page) { addProblem('index.html', 'Preview server in the E2B sandbox did not return HTTP 200 for the home page.'); return R; }
      R.http.index = 200;
      if (!MIME_OK.test(page.headers.get('content-type') || '')) R.warnings.push('Home page was not served as text/html.');
      const html = await page.text();
      const refs = [...html.matchAll(/<(?:script|link|img|source)\b[^>]*?(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
      const local = [...new Set(refs.filter((u) => !/^(https?:|\/\/|data:|#|mailto:|tel:|javascript:)/i.test(u)))];
      R.http.assets = local.length;
      for (const u of local) {
        const r = await fetch(new URL(u, base), { signal: AbortSignal.timeout(8000) }).catch(() => null);
        if (!r || r.status !== 200) addProblem('index.html', `Asset "${u}" returned HTTP ${r ? r.status : 'error'} from the preview server.`);
      }
      R.logs.push(`Preview served over HTTP from E2B: home 200, ${local.length} local asset(s) checked.`);
      return R;
    })()]).then((r) => { if (r && !r.unavailable) r.ok = r.problems.length === 0; return r && { ...r, ms: Date.now() - t0 }; });
  } catch (e) {
    return { unavailable: true, reason: `E2B error: ${e.message}` };
  } finally {
    if (sbx) { try { await sbx.kill(); } catch { /* sandbox already gone */ } }
  }
}
