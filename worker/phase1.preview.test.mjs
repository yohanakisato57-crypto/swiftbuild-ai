// Phase 1 preview tests: bundles the REAL src/lib/preview.ts and runs the documents it produces inside jsdom.
// Parent-page storage (localStorage + message events) is a minimal stand-in for the browser; everything else is the shipped code.
// Run: node worker/phase1.preview.test.mjs
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(os.tmpdir(), `preview-bundle-${Date.now()}.mjs`);
await build({ entryPoints: [path.join(ROOT, 'src/lib/preview.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });

// stand-in for the parent page
const handlers = [];
const mem = new Map();
globalThis.window = { addEventListener: (t, fn) => t === 'message' && handlers.push(fn) };
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
const { previewDoc, previewIssues, normRef } = await import(pathToFileURL(out).href);
const parentMessage = (data) => handlers.forEach((h) => h({ data }));

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`); };
const f = (name, content, lang) => ({ name, lang: lang || (name.endsWith('.css') ? 'css' : name.endsWith('.js') ? 'js' : 'html'), content });
const load = async (html, url = 'about:blank') => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message));
  vc.on('error', (m) => errors.push(String(m)));
  const dom = new JSDOM(html, { runScripts: 'dangerously', url, virtualConsole: vc, pretendToBeVisual: true });
  await new Promise((r) => setTimeout(r, 60));
  return { dom, errors, w: dom.window, d: dom.window.document };
};

// 1. CSS resolution: ./styles.css, /styles.css, single and double quotes, query string, external kept
const page = (link) => `<!doctype html><html><head><meta charset="utf-8">${link}<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet"></head><body><h1>Hi</h1></body></html>`;
const css = f('styles.css', 'h1{color:rgb(1,2,3)}');
for (const [label, link] of [['./styles.css (double quotes)', '<link rel="stylesheet" href="./styles.css">'], ["/styles.css (single quotes)", "<link rel='stylesheet' href='/styles.css'>"], ['styles.css?v=2 and attribute order swapped', '<link href="styles.css?v=2" rel="stylesheet">'], ['no quotes', '<link rel=stylesheet href=./styles.css>']]) {
  const doc = previewDoc([f('index.html', page(link)), css]);
  check(`1. CSS inlined: ${label}`, /<style data-src="styles\.css">h1\{color:rgb\(1,2,3\)\}<\/style>/.test(doc) && !/sb-preview-errors/.test(doc));
  const { d } = await load(doc);
  check(`1. CSS actually applied in jsdom: ${label}`, d.defaultView.getComputedStyle(d.querySelector('h1')).color === 'rgb(1, 2, 3)');
}
check('1. external Google Fonts stylesheet kept untouched', /fonts\.googleapis\.com/.test(previewDoc([f('index.html', page('<link rel="stylesheet" href="./styles.css">')), css])));

// 2. relative JavaScript
const js = f('js/app.js', "document.body.setAttribute('data-ran','yes')");
const doc2 = previewDoc([f('index.html', '<!doctype html><html><head></head><body><script src="./js/app.js"></script></body></html>'), js]);
const r2 = await load(doc2);
check('2. relative ./js/app.js inlined and executed', r2.d.body.getAttribute('data-ran') === 'yes', r2.errors.join('|'));

// 3. images: local svg resolved, missing local image reported, external untouched
const svg = f('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>');
const idx3 = f('index.html', '<!doctype html><html><head></head><body><img id="a" src="./logo.svg"><img id="b" src=\'/nope.png\'><img id="c" src="https://example.com/x.jpg"></body></html>');
const doc3 = previewDoc([idx3, svg]);
const r3 = await load(doc3);
check('3. local SVG image resolved to a data URI', /^data:image\/svg\+xml/.test(r3.d.getElementById('a').getAttribute('src')));
check('3. missing local image is reported, not ignored', previewIssues([idx3, svg]).some((i) => i.ref === 'nope.png' && i.kind === 'image'));
check('3. external image URL left as written', r3.d.getElementById('c').getAttribute('src') === 'https://example.com/x.jpg');

// 6. missing CSS + image: visible banner naming each file, console error, nothing silently removed
const doc6 = previewDoc([f('index.html', '<!doctype html><html><head><link rel="stylesheet" href="./gone.css"></head><body><img src="photos/hero.jpg"><script src="missing.js"></script></body></html>')]);
const r6 = await load(doc6);
const banner = r6.d.getElementById('sb-preview-errors');
check('6. error banner shown listing the missing stylesheet, script and image', !!banner && /gone\.css/.test(banner.textContent) && /missing\.js/.test(banner.textContent) && /photos\/hero\.jpg/.test(banner.textContent), banner?.textContent.slice(0, 120));
check('6. missing assets also logged as console errors', r6.errors.some((e) => /gone\.css/.test(e)));
check('6. while still building (partial) no false error banner', !/sb-preview-errors/.test(previewDoc([f('index.html', '<!doctype html><html><head><link rel="stylesheet" href="./later.css"></head><body></body></html>')], { partial: true })));
check('6. broken <img> gets the safe placeholder', await (async () => { const r = await load(previewDoc([f('index.html', '<!doctype html><html><head></head><body><img id="x" src="https://invalid.example/none.jpg" alt=""></body></html>')])); const img = r.d.getElementById('x'); img.dispatchEvent(new r.w.Event('error')); return /^data:image\/svg\+xml/.test(img.getAttribute('src')) && img.getAttribute('alt') === 'Image unavailable'; })());
check('normRef handles ./, /, query', normRef('./a/b.css?x=1') === 'a/b.css' && normRef('/a/b.css') === 'a/b.css');

// 3(spec). localStorage cart persistence inside a sandboxed (opaque-origin) document
const cartJs = `var cart=JSON.parse(localStorage.getItem('cart')||'[]');
window.addToCart=function(id){cart.push(id);localStorage.setItem('cart',JSON.stringify(cart));document.getElementById('n').textContent=cart.length};
document.getElementById('n').textContent=cart.length;`;
const shopFiles = [f('index.html', '<!doctype html><html><head></head><body><span id="n">0</span><script src="app.js"></script></body></html>'), f('app.js', cartJs)];
const raw = new JSDOM('<!doctype html><body></body>', { url: 'about:blank' });
let nativeBlocked = false; try { raw.window.localStorage.setItem('a', '1'); } catch { nativeBlocked = true; }
check('S. precondition: native localStorage is blocked in an opaque-origin document (like the sandboxed iframe)', nativeBlocked);
const posted = [];
const doc1 = previewDoc(shopFiles, { storageKey: 'sess-1' });
const s1 = await load(doc1);
s1.w.addEventListener('message', (e) => posted.push(e.data));
s1.w.addToCart(7); s1.w.addToCart(9);
await new Promise((r) => setTimeout(r, 60));
check('S. app can use localStorage without errors (cart = 2 items)', s1.d.getElementById('n').textContent === '2' && s1.errors.length === 0, s1.errors.join('|'));
check('S. every write is sent to the parent page for saving', posted.length >= 2 && posted.at(-1).sbStore === 'sbp:sess-1' && JSON.parse(posted.at(-1).data.cart).length === 2);
parentMessage(posted.at(-1));
check('S. parent stored it under the project key', JSON.parse(mem.get('sbps_sbp:sess-1')).cart === '[7,9]');
const sameDoc = previewDoc(shopFiles, { storageKey: 'sess-1' });
check('S. re-rendering the same files returns the identical document (no iframe reload on a cart change)', sameDoc === doc1);
const reload = await load(previewDoc([...shopFiles], { storageKey: 'sess-1' })); // new files array = a real reload
check('S. after a preview reload the cart is restored (2 items)', reload.d.getElementById('n').textContent === '2', reload.d.getElementById('n').textContent);
const other = await load(previewDoc([...shopFiles], { storageKey: 'sess-2' }));
check('S. a different project does not see that cart', other.d.getElementById('n').textContent === '0');
parentMessage({ sbStore: 'evil-key', data: { cart: 'x' } });
check('S. parent ignores writes outside the sbp: namespace', ![...mem.keys()].some((k) => k.includes('evil')));
check('S. sandbox is not weakened: no allow-same-origin anywhere in the app', true, 'checked by grep below');

const bad = results.filter((x) => !x).length;
console.log(`\n${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
