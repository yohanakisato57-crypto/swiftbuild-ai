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

/**
 * Live sandbox renderer: inlines linked CSS and JS so the project runs standalone.
 * Works on partially written projects too: a file not written yet is simply skipped,
 * so the page appears as soon as index.html exists and fills in as files arrive.
 */
export function previewDoc(files: ProjectFile[]): string {
  const page = files.find((f) => f.name === 'index.html') || files.find((f) => f.lang === 'html');
  if (!page) return EMPTY;
  let doc = page.content || '';
  if (!doc.trim()) doc = '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><div id="root"></div></body></html>';
  else if (!/id=["']root["']/.test(doc)) doc = /<body[^>]*>/i.test(doc) ? doc.replace(/<body[^>]*>/i, (m) => m + '<div id="root"></div>') : '<div id="root"></div>' + doc;
  doc = doc.replace(/<link[^>]*href="([^"]+\.css)"[^>]*>/g, (_m, name: string) => {
    const f = files.find((x) => x.name === name);
    return f ? '<style>' + f.content + '</style>' : '';
  });
  doc = doc.replace(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g, (_m, name: string) => {
    const f = files.find((x) => x.name === name);
    return f ? '<script>' + f.content.replace(/<\/script/gi, '<\\/script') + '</scr' + 'ipt>' : '';
  });
  return doc;
}
