import type { ProjectFile } from './generator';
import { pageHtml, coverPage, type TplSpec } from './mockup';

const EMPTY = `<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-items:center;background:#0f1412;color:#75807a;font:14px ui-sans-serif,system-ui,sans-serif">Preview appears once the first page is written.</body></html>`;

/** A standalone sample page for a template, shown in the editor's preview. */
export function templatePreviewDoc(t: { name: string; category: string; thumbnail_url: string; prompt: string; spec?: TplSpec }): string {
  if (t.spec) return pageHtml(t.spec, coverPage(t.spec));
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;font:14px/1.5 ui-sans-serif,system-ui,sans-serif;background:#0b0f0d;color:#eef3ef}
.hero{position:relative;min-height:100vh;display:grid;place-items:center;text-align:center;padding:48px 24px;background:url('${esc(t.thumbnail_url)}') center/cover}
.hero::before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,15,13,.55),#0b0f0d)}
.card{position:relative;max-width:560px}.tag{display:inline-block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#c6ff3d;border:1px solid rgba(198,255,61,.35);border-radius:999px;padding:4px 10px}
h1{font-size:clamp(28px,5vw,44px);line-height:1.1;margin:14px 0 10px}p{color:#b8c4bd}
.btn{display:inline-block;margin-top:22px;background:#c6ff3d;color:#0b0f0d;font-weight:600;border-radius:10px;padding:11px 20px;text-decoration:none}
</style></head><body><section class="hero"><div class="card"><span class="tag">${esc(t.category)}</span><h1>${esc(t.name)}</h1><p>${esc(t.prompt.slice(0, 220))}</p><a class="btn" href="#">Get started</a></div></section></body></html>`;
}

/* ------------------------------------------------------------------ storage compatibility
 * The preview iframe is sandboxed WITHOUT allow-same-origin (keeps generated code isolated from the app, its
 * session and Supabase tokens). In that mode the browser blocks window.localStorage. Instead of weakening the
 * sandbox, a small shim is injected first: it uses real storage when it works, otherwise an in-iframe store that
 * is seeded from, and saved back to, a per-project key in the PARENT page through postMessage. */
const STORE_PREFIX = 'sbps_';
const initCache = new Map<string, Record<string, string>>();

function readStore(key: string): Record<string, string> {
  const hit = initCache.get(key);
  if (hit) return hit;
  let d: Record<string, string> = {};
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_PREFIX + key) : null;
    const p = raw ? JSON.parse(raw) : null;
    if (p && typeof p === 'object') for (const k of Object.keys(p)) if (typeof p[k] === 'string') d[k] = p[k];
  } catch { d = {}; }
  initCache.set(key, d);
  return d;
}

let storageListening = false;
/** Saves what a previewed app writes to localStorage, so it survives a preview reload. Safe to call repeatedly. */
export function initPreviewStorage(): void {
  if (storageListening || typeof window === 'undefined') return;
  storageListening = true;
  window.addEventListener('message', (e: MessageEvent) => {
    const m = e.data as { sbStore?: unknown; data?: unknown } | null;
    if (!m || typeof m.sbStore !== 'string' || !m.sbStore.startsWith('sbp:') || m.sbStore.length > 120) return;
    if (!m.data || typeof m.data !== 'object') return;
    const clean: Record<string, string> = {};
    let size = 0;
    for (const [k, v] of Object.entries(m.data as Record<string, unknown>)) {
      if (typeof v !== 'string') continue;
      size += k.length + v.length;
      if (size > 1_500_000) return; // refuse to store oversize data
      clean[k] = v;
    }
    initCache.set(m.sbStore, clean);
    try { localStorage.setItem(STORE_PREFIX + m.sbStore, JSON.stringify(clean)); } catch { /* storage full: keep in memory */ }
  });
}
initPreviewStorage();

/** Plain-JS shim (exported so tests can run the exact code that ships). */
export function storageShim(key: string, init: Record<string, string>): string {
  const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
  return `<script data-sb-storage>(function(){try{var t='__sb_t';window.localStorage.setItem(t,'1');window.localStorage.removeItem(t);return}catch(e){}
var KEY=${json(key)},d=${json(init)};
function make(persist){var data=persist?d:{};function flush(){if(persist){try{parent.postMessage({sbStore:KEY,data:data},'*')}catch(e){}}}
var api={getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(data,k)?data[k]:null},setItem:function(k,v){data[String(k)]=String(v);flush()},removeItem:function(k){delete data[String(k)];flush()},clear:function(){for(var k in data)delete data[k];flush()},key:function(i){var ks=Object.keys(data);return i<ks.length?ks[i]:null}};
return new Proxy(api,{get:function(o,p){if(p==='length')return Object.keys(data).length;if(p in o)return o[p];return Object.prototype.hasOwnProperty.call(data,p)?data[p]:undefined},set:function(o,p,v){data[String(p)]=String(v);flush();return true},deleteProperty:function(o,p){delete data[String(p)];flush();return true},has:function(o,p){return p in o||p in data}})}
try{Object.defineProperty(window,'localStorage',{value:make(true),configurable:true});Object.defineProperty(window,'sessionStorage',{value:make(false),configurable:true})}catch(e){}})();</script>`;
}

/** Shows a neutral inline placeholder for any image that fails to load, instead of a broken-image icon. */
export const IMG_FALLBACK = `<script data-sb-img-fallback>(function(){var P="data:image/svg+xml;utf8,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#e5e7eb"/><g fill="none" stroke="#9ca3af" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"><rect x="130" y="95" width="140" height="110" rx="12"/><circle cx="170" cy="135" r="10"/><path d="M135 195l45-40 30 25 25-20 35 35"/></g></svg>');function fix(i){if(!i||i.tagName!=="IMG"||i.getAttribute("data-sb-fb"))return;i.setAttribute("data-sb-fb","1");i.removeAttribute("srcset");i.src=P;if(!i.alt)i.alt="Image unavailable"}
document.addEventListener("error",function(e){fix(e.target)},true);window.addEventListener("load",function(){var a=document.images;for(var n=0;n<a.length;n++){if(a[n].complete&&a[n].naturalWidth===0&&a[n].getAttribute("src"))fix(a[n])}})})();</script>`;

/* ------------------------------------------------------------------ asset resolution */
const attrOf = (tag: string, name: string): string | null => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
};
const isExternal = (u: string) => /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u.trim());
/** "./styles.css", "/styles.css", "styles.css?v=2" all resolve to "styles.css". */
export const normRef = (u: string) => u.trim().split(/[?#]/)[0].replace(/^(?:\.\/)+/, '').replace(/^\/+/, '');

export interface PreviewIssue { ref: string; from: string; kind: 'stylesheet' | 'script' | 'image' }
const docCache = new WeakMap<ProjectFile[], Map<string, string>>();

/**
 * Live sandbox renderer: inlines linked CSS and JS so the project runs standalone.
 * While a build is still writing files (`partial`), a not-yet-written file is skipped quietly.
 * Otherwise a missing local asset is reported in a visible banner and in the console, never dropped silently.
 * Results are cached per files array, so a state change inside the app never reloads the iframe.
 */
export function previewDoc(files: ProjectFile[], opts: { storageKey?: string; partial?: boolean } = {}): string {
  const key = 'sbp:' + (opts.storageKey || 'default');
  const ck = key + (opts.partial ? '|p' : '');
  const cached = docCache.get(files)?.get(ck);
  if (cached) return cached;
  const out = buildDoc(files, key, !!opts.partial);
  if (!docCache.has(files)) docCache.set(files, new Map());
  docCache.get(files)!.set(ck, out);
  return out;
}

/** Local assets the page references that are not in the project. */
export function previewIssues(files: ProjectFile[]): PreviewIssue[] {
  const issues: PreviewIssue[] = [];
  buildDoc(files, 'sbp:check', false, issues);
  return issues;
}

function buildDoc(files: ProjectFile[], key: string, partial: boolean, issuesOut?: PreviewIssue[]): string {
  const page = files.find((f) => f.name === 'index.html') || files.find((f) => f.lang === 'html');
  if (!page) return EMPTY;
  const find = (ref: string) => { const n = normRef(ref); return files.find((x) => normRef(x.name) === n); };
  let doc = page.content || '';
  if (!doc.trim()) doc = '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><div id="root"></div></body></html>';
  else if (!/id=["']root["']/.test(doc)) doc = /<body[^>]*>/i.test(doc) ? doc.replace(/<body[^>]*>/i, (m) => m + '<div id="root"></div>') : '<div id="root"></div>' + doc;

  const missing: PreviewIssue[] = [];
  const miss = (ref: string, kind: PreviewIssue['kind']) => { if (!missing.some((m) => m.ref === normRef(ref))) missing.push({ ref: normRef(ref), from: page.name, kind }); };

  doc = doc.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = attrOf(tag, 'href');
    const rel = (attrOf(tag, 'rel') || '').toLowerCase();
    if (href === null || isExternal(href) || !(rel.includes('stylesheet') || /\.css(?:[?#]|$)/i.test(href))) return tag;
    const f = find(href);
    if (f) return `<style data-src="${normRef(href)}">${f.content.replace(/<\/style/gi, '<\\/style')}</style>`;
    miss(href, 'stylesheet');
    return `<!-- missing stylesheet: ${normRef(href)} -->`;
  });
  doc = doc.replace(/<script\b([^>]*)>\s*<\/script>/gi, (full, attrs: string) => {
    const src = attrOf(attrs, 'src');
    if (src === null || isExternal(src)) return full;
    const f = find(src);
    const type = attrOf(attrs, 'type');
    if (f) return `<script${type ? ` type="${type}"` : ''} data-src="${normRef(src)}">${f.content.replace(/<\/script/gi, '<\\/script')}</scr` + 'ipt>';
    miss(src, 'script');
    return `<!-- missing script: ${normRef(src)} -->`;
  });
  doc = doc.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = attrOf(tag, 'src');
    if (src === null || isExternal(src) || src.trim() === '') return tag;
    const f = find(src);
    if (f && /\.svg$/i.test(f.name)) { const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(f.content); return tag.replace(src, () => uri); }
    if (!f) miss(src, 'image');
    return tag;
  });

  if (issuesOut) issuesOut.push(...missing);

  const head = storageShim(key, readStore(key)) + (/data-sb-img-fallback/.test(doc) ? '' : IMG_FALLBACK);
  if (/<head[^>]*>/i.test(doc)) doc = doc.replace(/<head[^>]*>/i, (m) => m + head);
  else if (/<html[^>]*>/i.test(doc)) doc = doc.replace(/<html[^>]*>/i, (m) => m + '<head>' + head + '</head>');
  else doc = '<!doctype html><head>' + head + '</head>' + doc;

  if (missing.length && !partial) {
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
    const banner = `<div id="sb-preview-errors" style="position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#7f1d1d;color:#fff;font:12px/1.4 ui-monospace,monospace;padding:8px 12px;display:flex;gap:12px;align-items:flex-start"><div style="flex:1"><b>Preview error:</b> ${missing.map((m) => `${m.kind} “${esc(m.ref)}” is referenced by ${esc(m.from)} but is not in the project`).join('; ')}.</div><button onclick="this.parentNode.remove()" style="background:none;border:1px solid #fff6;color:#fff;border-radius:4px;cursor:pointer">Dismiss</button></div><script>console.error(${JSON.stringify(missing.map((m) => 'Missing ' + m.kind + ': ' + m.ref).join('; ')).replace(/</g, '\\u003c')})</script>`;
    doc = /<body[^>]*>/i.test(doc) ? doc.replace(/<body[^>]*>/i, (m) => m + banner) : banner + doc;
  }
  return doc;
}
