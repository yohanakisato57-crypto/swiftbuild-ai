// SwiftBuild AI: helpers for the six-agent pipeline (prompts + real, deterministic checks).
import vm from 'node:vm';

export const REVIEW_SYSTEM = `You are the Review Agent of a software team. You get a project's file list (the implementation plan) and the generated files. Check: every file in the plan exists and is complete, scripts/stylesheets reference files that exist, functions called are defined, buttons and forms have working handlers, no placeholder or lorem ipsum text, no secret keys in the code, and the code follows the plan. Reply ONLY JSON: {"approved": boolean, "issues": [{"file": string (exact file name), "problem": string (specific, one sentence)}]}. List at most 6 real issues. If everything is fine, approved is true and issues is [].`;

export const BACKEND_SYSTEM = `You are the Backend Agent of a software team. Write ONE complete file named data.js: the application's data layer in plain browser JavaScript (no modules, no npm). Expose a single global object window.AppData with real working functions for the project: load/save collections in localStorage with try/catch, create/update/delete/list, input validation, simple authentication state if the project needs accounts, and integration helpers (for example a WhatsApp order link builder using https://wa.me/<digits>?text=<encodeURIComponent(...)>, or fetch helpers for public APIs with error handling). Seed realistic specific sample data for the project. NEVER put API keys, passwords or secrets in this file; private keys must stay on a server. Reply with ONLY the raw complete file text: no markdown fences, no commentary, no comments. Never stop early.`;

export const TEST_SYSTEM = `You are the Testing Agent of a software team. You get automated test results and the project's index.html. List up to 5 important user flows (navigation, forms, search/filter, cart or data actions) and say whether the code visibly wires each one up. Be strict: do not mark a flow as working unless you can see its handler in the code. Reply ONLY JSON: {"flows": [{"name": string, "ok": boolean, "note": string}]}.`;

/** Real static checks. Returns [{file, problem}]. Empty array means all checks passed. */
export function staticCheck(files) {
  const probs = [];
  const names = new Set(files.map((f) => f.name));
  const compile = (code, label, file) => {
    try { new vm.Script(code, { filename: label }); } catch (e) { probs.push({ file, problem: `JavaScript syntax error in ${label}: ${e.message}` }); }
  };
  for (const f of files) {
    const c = f.content || '';
    if (!c.trim()) { probs.push({ file: f.name, problem: 'File is empty.' }); continue; }
    if (/\.js$/.test(f.name) && !/^\s*(import|export)\s/m.test(c)) compile(c, f.name, f.name);
    if (/\.html$/.test(f.name)) {
      for (const m of c.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        const attrs = m[1];
        if (/\bsrc\s*=/i.test(attrs) || !m[2].trim()) continue;
        if (/type\s*=\s*["'](?!text\/javascript)/i.test(attrs)) continue;
        compile(m[2], `inline script in ${f.name}`, f.name);
      }
      for (const m of c.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
        const ref = m[1].replace(/^\.\//, '');
        if (/^(https?:|\/|data:|#|mailto:)/i.test(ref) || !/\.(js|css)$/.test(ref)) continue;
        if (!names.has(ref)) probs.push({ file: f.name, problem: `References missing file "${ref}".` });
      }
    }
    if (/sk-[A-Za-z0-9]{20,}|service_role/.test(c)) probs.push({ file: f.name, problem: 'Contains what looks like a secret key. Remove it.' });
  }
  const idx = files.find((f) => f.name === 'index.html');
  if (!idx) probs.push({ file: 'index.html', problem: 'index.html is missing.' });
  else if (!/<\/html>\s*$/i.test(idx.content.trim())) probs.push({ file: 'index.html', problem: 'index.html is not properly closed.' });
  return probs;
}

/** Automated tests: named checks with pass/fail, derived from staticCheck plus structure checks. */
export function runTests(files) {
  const probs = staticCheck(files);
  const has = (re) => probs.some((p) => re.test(p.problem));
  const checks = [
    { name: 'All files non-empty', ok: !has(/empty|missing\./i) },
    { name: 'JavaScript compiles', ok: !has(/syntax error/i) },
    { name: 'File references resolve', ok: !has(/References missing/i) },
    { name: 'index.html complete', ok: !probs.some((p) => p.file === 'index.html' && /closed|missing\./.test(p.problem)) },
    { name: 'No secrets in code', ok: !has(/secret/i) },
  ];
  return { checks, probs, passed: checks.every((c) => c.ok) };
}
