// SwiftBuild AI: deterministic cross-file consistency and asset checks (no AI, no network except checkImageUrls).
// Works for any project type (shops, dashboards, games, portfolios...): it only compares what files promise each other.

const BUILTIN = new Set(['alert', 'confirm', 'prompt', 'console', 'window', 'document', 'this', 'event', 'return', 'if', 'function', 'void', 'navigator', 'location', 'history', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'fetch', 'parseInt', 'parseFloat', 'JSON', 'Math', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean', 'open', 'print', 'scrollTo', 'encodeURIComponent', 'decodeURIComponent', 'isNaN', 'requestAnimationFrame', 'new', 'typeof', 'else', 'switch', 'for', 'while', 'catch', 'localStorage', 'sessionStorage', 'history', 'screen', 'Promise', 'Set', 'Map', 'RegExp', 'Error']);

export const IMG_FALLBACK = `<script data-sb-img-fallback>(function(){var P="data:image/svg+xml;utf8,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#e5e7eb"/><g fill="none" stroke="#9ca3af" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"><rect x="130" y="95" width="140" height="110" rx="12"/><circle cx="170" cy="135" r="10"/><path d="M135 195l45-40 30 25 25-20 35 35"/></g></svg>');function fix(i){if(!i||i.tagName!=="IMG"||i.getAttribute("data-sb-fb"))return;i.setAttribute("data-sb-fb","1");i.removeAttribute("srcset");i.src=P;if(!i.alt)i.alt="Image unavailable"}
document.addEventListener("error",function(e){fix(e.target)},true);window.addEventListener("load",function(){var a=document.images;for(var n=0;n<a.length;n++){if(a[n].complete&&a[n].naturalWidth===0&&a[n].getAttribute("src"))fix(a[n])}})})();</script>`;

/** Adds the broken-image fallback to a page once (idempotent). */
export function withImageFallback(html) {
  if (!html || /data-sb-img-fallback/.test(html)) return html;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, () => IMG_FALLBACK + '\n</body>');
  if (/<\/html>\s*$/i.test(html)) return html.replace(/<\/html>\s*$/i, () => IMG_FALLBACK + '\n</html>');
  return html + '\n' + IMG_FALLBACK;
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (u) => String(u).trim().split(/[?#]/)[0].replace(/^(?:\.\/)+/, '').replace(/^\/+/, '');
const isExternal = (u) => /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\{\{|\$\{)/i.test(String(u).trim());

function split(files) {
  const html = files.filter((f) => /\.html?$/i.test(f.name));
  const js = files.filter((f) => /\.m?js$/i.test(f.name));
  const css = files.filter((f) => /\.css$/i.test(f.name));
  const inline = [];
  for (const h of html) {
    for (const m of String(h.content || '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/\bsrc\s*=/i.test(m[1]) && m[2].trim()) inline.push({ name: h.name, content: m[2] });
    }
  }
  return { html, js, css, inline };
}

/**
 * Returns { problems: [{file, problem}], warnings: [string] }.
 * problems = high-confidence defects (sent to the Debug Agent). warnings = reported, never fatal.
 * `spec` is the shared project specification produced by the Planning Agent.
 */
export function consistencyCheck(files, spec) {
  const problems = [];
  const warnings = [];
  const addP = (file, problem) => { if (!problems.some((p) => p.file === file && p.problem === problem)) problems.push({ file, problem }); };
  const { html, js, css, inline } = split(files);
  if (!html.length) return { problems, warnings };
  const codeUnits = [...js, ...inline];
  const allText = files.map((f) => String(f.content || '')).join('\n');
  const jsText = codeUnits.map((c) => c.content).join('\n');
  const htmlText = html.map((h) => h.content).join('\n');
  const names = new Set(files.map((f) => norm(f.name)));

  // 1. Element ids that JavaScript looks up must exist (in HTML, or be created by JS).
  const idExists = (id) => {
    const e = esc(id);
    return new RegExp(`\\bid\\s*=\\s*\\\\?["'\`]${e}\\\\?["'\`]|\\.id\\s*=\\s*["'\`]${e}["'\`]|["']id["']\\s*,\\s*["'\`]${e}["'\`]|\\bid\\s*:\\s*["'\`]${e}["'\`]`).test(allText);
  };
  for (const u of codeUnits) {
    const c = u.content;
    for (const m of c.matchAll(/getElementById\(\s*(["'`])([^"'`$]+)\1\s*\)/g)) if (!idExists(m[2])) addP(u.name, `JavaScript looks up element id "${m[2]}" (getElementById) but no element with that id exists in the HTML and none is created by the scripts.`);
    for (const m of c.matchAll(/querySelector(?:All)?\(\s*(["'`])([^"'`$]+)\1\s*\)/g)) {
      const sel = m[2].replace(/\[[^\]]*\]/g, '').replace(/:[a-z-]+(\([^)]*\))?/gi, '');
      for (const t of sel.matchAll(/#([A-Za-z_][\w-]*)/g)) if (!idExists(t[1])) addP(u.name, `JavaScript selects "#${t[1]}" but no element with id "${t[1]}" exists in the HTML and none is created by the scripts.`);
      for (const t of sel.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
        const cls = t[1];
        const used = new RegExp(`(?:class|className|classList)[^\\n]{0,300}?[\\s"'.,(]${esc(cls)}\\b`).test(allText.replace(m[0], ''));
        if (!used) warnings.push(`${u.name} selects ".${cls}" but no element in the project uses that class.`);
      }
    }
  }

  // 2. Inline handlers (onclick="foo()") must call functions that exist.
  const defined = (n) => {
    const e = esc(n);
    return new RegExp(`function\\s*\\*?\\s+${e}\\b|\\b(?:const|let|var|class)\\s+${e}\\b|\\b(?:const|let|var)\\s*[\\[{][^=;]*\\b${e}\\b[^=;]*[\\]}]\\s*=|\\bwindow\\.${e}\\s*=|\\bwindow\\[["']${e}["']\\]\\s*=|\\b${e}\\s*=(?!=)`).test(jsText);
  };
  for (const h of html) {
    for (const m of String(h.content).matchAll(/\bon[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      const code = m[1] ?? m[2] ?? '';
      for (const c of code.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*(\.[\w$.]*)?\s*\(/g)) {
        const n = c[2];
        if (BUILTIN.has(n) || /^[A-Z]/.test(n)) continue;
        if (!defined(n)) addP(h.name, `An inline handler calls "${n}(...)" but no script defines a function or object named "${n}".`);
      }
    }
  }

  // 3. Local asset references must exist: images, media, icons, CSS url(...).
  const checkRef = (from, ref, kind) => {
    if (!ref || isExternal(ref) || /^data:/i.test(ref)) return;
    const n = norm(ref);
    if (n && !names.has(n)) addP(from, `References missing ${kind} "${n}" that is not in the project.`);
  };
  for (const h of html) {
    for (const m of String(h.content).matchAll(/<(img|source|video|audio|input)\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) checkRef(h.name, m[2] ?? m[3], 'asset');
    for (const m of String(h.content).matchAll(/<link\b[^>]*?\brel\s*=\s*["'][^"']*icon[^"']*["'][^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) checkRef(h.name, m[1] ?? m[2], 'icon');
  }
  for (const c of css) for (const m of String(c.content).matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) checkRef(c.name, m[1], 'asset');

  // 4. Dependencies: a library used by code must be loaded.
  const loaded = (re) => new RegExp(`<script\\b[^>]*src\\s*=\\s*["'][^"']*${re}`, 'i').test(htmlText);
  if (/\blucide\s*\.\s*createIcons\b/.test(jsText + htmlText) && !loaded('lucide')) addP(html[0].name, 'Code calls lucide.createIcons() but the Lucide script is not loaded in the HTML.');
  if (/\bnew\s+Chart\s*\(/.test(jsText) && !loaded('chart')) addP(html[0].name, 'Code uses Chart(...) but Chart.js is not loaded in the HTML.');
  if (/\bReactDOM\b|\bReact\.createElement\b/.test(jsText) && !loaded('react')) addP(html[0].name, 'Code uses React but React is not loaded in the HTML.');
  if (/<i\b[^>]*data-lucide/i.test(htmlText + jsText) && !loaded('lucide')) warnings.push('Lucide icons (data-lucide) are used but the Lucide script is not loaded; icons will be empty.');

  // 5. Shared project spec: what the planner promised vs what the files contain.
  if (spec && typeof spec === 'object') {
    for (const id of Array.isArray(spec.dom_ids) ? spec.dom_ids.slice(0, 60) : []) if (typeof id === 'string' && id && !idExists(id)) warnings.push(`Spec lists element id "${id}" but no file defines it.`);
    for (const a of Array.isArray(spec.js_api) ? spec.js_api.slice(0, 40) : []) {
      if (!a || typeof a.name !== 'string') continue;
      const root = a.name.split('.')[0];
      if (!/^[A-Za-z_$][\w$]*$/.test(root)) continue;
      const usedElsewhere = files.some((f) => f.name !== a.file && new RegExp(`\\b${esc(root)}\\b`).test(String(f.content || '')));
      if (!defined(root)) (usedElsewhere ? (() => addP(a.file || html[0].name, `The shared spec says ${a.file || 'a script'} defines "${a.name}" and other files use it, but "${root}" is not defined anywhere.`)) : (() => warnings.push(`Spec lists "${a.name}" but it is not defined.`)))();
      // Load order: a script that uses a global must come after the script that defines it.
      const order = [...String(htmlText).matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => norm(m[1]));
      const di = order.indexOf(norm(a.file || ''));
      if (di >= 0) for (const [i, n] of order.entries()) { if (i < di && files.find((f) => norm(f.name) === n && new RegExp(`\\b${esc(root)}\\.`).test(String(f.content || '').split('\n').slice(0, 400).join('\n')) && !new RegExp(`DOMContentLoaded|window\\.onload|addEventListener\\(['"]load`).test(f.content))) warnings.push(`${n} uses "${root}" at load time but is loaded before ${a.file}.`); }
    }
    if (spec.data_shapes && typeof spec.data_shapes === 'object') {
      for (const [shape, props] of Object.entries(spec.data_shapes).slice(0, 12)) {
        for (const p of Array.isArray(props) ? props.slice(0, 20) : []) if (typeof p === 'string' && /^[\w$]+$/.test(p) && !new RegExp(`\\b${esc(p)}\\b\\s*:|\\.${esc(p)}\\b|\\["${esc(p)}"\\]`).test(jsText)) warnings.push(`Data shape "${shape}" lists property "${p}" but no script uses it.`);
      }
    }
  }
  // CSS classes defined but never used by any HTML/JS (informational).
  const unused = new Set();
  for (const c of css) {
    for (const m of String(c.content).replace(/\{[^{}]*\}/g, '{}').matchAll(/\.([A-Za-z_][\w-]*)/g)) {
      if (!new RegExp(`(?<![\\w-])${esc(m[1])}(?![\\w-])`).test(htmlText + '\n' + jsText)) unused.add(m[1]);
    }
  }
  if (unused.size) warnings.push(`CSS defines ${unused.size} class(es) no HTML/JS uses: ${[...unused].slice(0, 5).join(', ')}.`);
  return { problems, warnings: [...new Set(warnings)].slice(0, 12) };
}

/**
 * Validates external image URLs with real HTTP requests. Returns counts and the broken URLs.
 * A network failure (worker offline, host blocks the worker) is reported as "unverified", never as OK.
 */
export async function checkImageUrls(files, limit = 24) {
  const urls = new Set();
  for (const f of files) {
    const c = String(f.content || '');
    for (const m of c.matchAll(/https?:\/\/[^\s"'`)<>\\]+/gi)) {
      const u = m[0].replace(/[,;]+$/, '');
      if (/\.(?:png|jpe?g|gif|webp|avif|svg)(?:[?#]|$)/i.test(u) || /images\.unsplash\.com|images\.pexels\.com|picsum\.photos/i.test(u)) urls.add(u);
    }
  }
  const list = [...urls].slice(0, limit);
  const broken = [];
  let ok = 0;
  let unknown = 0;
  await Promise.all(list.map(async (u) => {
    try {
      let r = await fetch(u, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(7000) });
      if (r.status === 405 || r.status === 403) r = await fetch(u, { method: 'GET', headers: { range: 'bytes=0-0' }, redirect: 'follow', signal: AbortSignal.timeout(7000) });
      const type = r.headers.get('content-type') || '';
      if (r.status < 400 && (!type || /image|octet-stream/i.test(type))) ok++;
      else if (r.status === 404 || r.status === 410 || (r.status < 400 && type)) broken.push(u);
      else unknown++;
    } catch { unknown++; }
  }));
  return { checked: list.length, ok, broken, unverified: unknown };
}
