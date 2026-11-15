export type Mode = 'build' | 'plan';
export type Lang = 'html' | 'css' | 'js' | 'md';
export interface ProjectFile {
  name: string;
  lang: Lang;
  content: string;
}
export interface Project {
  id?: number | string;
  title: string;
  mode: Mode;
  files: ProjectFile[];
}

type Kind = 'landing' | 'todo' | 'dashboard';

interface Palette {
  bg: string;
  surface: string;
  fg: string;
  muted: string;
  accent: string;
  ink: string;
}

const PALETTES: Palette[] = [
  { bg: '#0f1412', surface: '#18201c', fg: '#eef3ef', muted: '#92a39a', accent: '#c8f54a', ink: '#10150a' },
  { bg: '#fbf6ef', surface: '#ffffff', fg: '#2a1d14', muted: '#7a6858', accent: '#d9531e', ink: '#fff7ee' },
  { bg: '#0e1020', surface: '#171a30', fg: '#eceefb', muted: '#9aa0c8', accent: '#ff7a59', ink: '#1d0c06' },
  { bg: '#f3f6fb', surface: '#ffffff', fg: '#0f1c2e', muted: '#5d6e85', accent: '#0b5fff', ink: '#f2f7ff' },
];

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function detectKind(p: string): Kind {
  if (/todo|to-do|task|checklist|habit|reminder/i.test(p)) return 'todo';
  if (/dashboard|analytics|metric|admin|report|stats|kpi/i.test(p)) return 'dashboard';
  return 'landing';
}

function titleFrom(prompt: string) {
  let s = prompt.trim().replace(/\s+/g, ' ');
  const m = s.match(/\b(?:for|called|named)\s+(.+)/i);
  if (m) s = m[1];
  s = s
    .replace(/^(?:please\s+)?(?:build|create|make|design|generate)\s+(?:me\s+)?/i, '')
    .replace(/^(?:a|an|the|my)\s+/i, '')
    .replace(/[^\w\s-]/g, '');
  const words = s.split(' ').filter(Boolean).slice(0, 3);
  if (!words.length) return 'Untitled';
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ').slice(0, 26);
}

const base = (p: Palette) => `:root {
  --bg: ${p.bg};
  --surface: ${p.surface};
  --fg: ${p.fg};
  --muted: ${p.muted};
  --accent: ${p.accent};
  --ink: ${p.ink};
  --line: color-mix(in srgb, ${p.fg} 14%, transparent);
}
* { box-sizing: border-box; margin: 0; }
body {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--fg);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 960px; margin: 0 auto; padding: 0 24px; }
.btn {
  display: inline-block;
  background: var(--accent);
  color: var(--ink);
  font: 600 15px/1 inherit;
  padding: 13px 20px;
  border: 0;
  border-radius: 10px;
  text-decoration: none;
  cursor: pointer;
  transition: transform .15s;
}
.btn:hover { transform: translateY(-2px); }
.btn.ghost { background: transparent; color: var(--fg); box-shadow: inset 0 0 0 1px var(--line); }
input {
  font: inherit;
  color: var(--fg);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px 14px;
}
input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
`;

/* ---------------- BUILD TEMPLATES ---------------- */

function landing(title: string, prompt: string, p: Palette): ProjectFile[] {
  const t = esc(title);
  const desc = esc(prompt.length > 150 ? prompt.slice(0, 147) + '...' : prompt);
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${t}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="wrap">
    <nav>
      <span class="logo">${t}</span>
      <a class="btn ghost" href="#join">Get early access</a>
    </nav>

    <header class="hero">
      <p class="eyebrow">Now in early access</p>
      <h1>Meet ${t}.</h1>
      <p class="lead">${desc}</p>
      <div class="row">
        <a class="btn" href="#join">Start free</a>
        <a class="btn ghost" href="#features">See how it works</a>
      </div>
    </header>

    <section id="features" class="grid">
      <article><span>01</span><h3>Fast by design</h3><p>Everything in ${t} loads instantly and feels effortless from the first tap.</p></article>
      <article><span>02</span><h3>Made for you</h3><p>Thoughtful defaults that adapt to how you work, with zero setup required.</p></article>
      <article><span>03</span><h3>Always in sync</h3><p>Pick up where you left off on any device, with changes saved as you go.</p></article>
    </section>

    <section id="join" class="cta">
      <h2>Be first in line</h2>
      <p>Join the waitlist and get early access.</p>
      <form id="form">
        <input id="email" type="email" required placeholder="you@email.com">
        <button class="btn" type="submit">Join waitlist</button>
      </form>
      <p id="msg" class="msg"></p>
    </section>
  </div>
  <script src="script.js"></script>
</body>
</html>
`;
  const css = `${base(p)}
nav { display: flex; justify-content: space-between; align-items: center; padding: 20px 0; }
.logo { font-weight: 700; letter-spacing: -.02em; font-size: 18px; }
.hero { padding: 56px 0 48px; }
.eyebrow {
  display: inline-block;
  font-size: 13px;
  color: var(--accent);
  border: 1px solid var(--line);
  padding: 5px 12px;
  border-radius: 999px;
  margin-bottom: 20px;
}
h1 { font-size: clamp(38px, 8vw, 68px); line-height: 1.02; letter-spacing: -.035em; max-width: 13ch; }
.lead { color: var(--muted); font-size: 18px; max-width: 52ch; margin: 20px 0 28px; }
.row { display: flex; gap: 12px; flex-wrap: wrap; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; padding-bottom: 56px; }
.grid article {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 22px;
  transition: transform .2s, border-color .2s;
}
.grid article:hover { transform: translateY(-4px); border-color: var(--accent); }
.grid span { color: var(--accent); font: 500 13px ui-monospace, monospace; }
.grid h3 { margin: 10px 0 6px; font-size: 18px; }
.grid p { color: var(--muted); font-size: 15px; }
.cta { text-align: center; padding: 48px 0 64px; border-top: 1px solid var(--line); }
.cta h2 { font-size: 32px; letter-spacing: -.02em; }
.cta > p { color: var(--muted); margin: 8px 0 20px; }
form { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
form input { width: min(320px, 100%); }
.msg { margin-top: 14px; color: var(--accent); min-height: 24px; }
`;
  const js = `const form = document.getElementById('form');
const msg = document.getElementById('msg');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  msg.textContent = "You're on the list, " + email + ". We'll be in touch soon.";
  form.reset();
});
`;
  return [
    { name: 'index.html', lang: 'html', content: html },
    { name: 'styles.css', lang: 'css', content: css },
    { name: 'script.js', lang: 'js', content: js },
  ];
}

function todo(title: string, prompt: string, p: Palette): ProjectFile[] {
  const t = esc(title);
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${t}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="app">
    <header>
      <p class="eyebrow">${esc(prompt.length > 60 ? prompt.slice(0, 57) + '...' : prompt)}</p>
      <h1>${t}</h1>
      <p id="count" class="count"></p>
    </header>

    <form id="add">
      <input id="text" placeholder="Add something to do..." autocomplete="off" required>
      <button class="btn" type="submit">Add</button>
    </form>

    <div class="filters" id="filters">
      <button data-f="all" class="on">All</button>
      <button data-f="open">Open</button>
      <button data-f="done">Done</button>
    </div>

    <ul id="list"></ul>
  </main>
  <script src="script.js"></script>
</body>
</html>
`;
  const css = `${base(p)}
.app { max-width: 520px; margin: 0 auto; padding: 40px 20px; }
.eyebrow { color: var(--muted); font-size: 13px; margin-bottom: 6px; }
h1 { font-size: 40px; letter-spacing: -.03em; line-height: 1.1; }
.count { color: var(--accent); margin: 6px 0 24px; font-weight: 500; }
#add { display: flex; gap: 10px; }
#add input { flex: 1; min-width: 0; }
.filters { display: flex; gap: 6px; margin: 20px 0 12px; }
.filters button {
  font: 500 13px inherit;
  color: var(--muted);
  background: transparent;
  border: 1px solid var(--line);
  padding: 7px 14px;
  border-radius: 999px;
  cursor: pointer;
}
.filters button.on { background: var(--accent); color: var(--ink); border-color: var(--accent); }
ul { list-style: none; padding: 0; display: grid; gap: 8px; }
li {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 13px 14px;
  animation: in .25s ease both;
}
li.done span { text-decoration: line-through; color: var(--muted); }
li span { flex: 1; }
li input { width: 18px; height: 18px; padding: 0; accent-color: var(--accent); }
li button { background: none; border: 0; color: var(--muted); cursor: pointer; font-size: 18px; }
li button:hover { color: var(--accent); }
@keyframes in { from { opacity: 0; transform: translateY(6px); } }
`;
  const js = `let tasks = [
  { id: 1, text: 'Sketch the first version', done: true },
  { id: 2, text: 'Invite two friends to try it', done: false },
  { id: 3, text: 'Ship it this week', done: false },
];
let filter = 'all';
let nextId = 4;

const list = document.getElementById('list');
const count = document.getElementById('count');

function render() {
  list.innerHTML = '';
  const shown = tasks.filter((t) => filter === 'all' || (filter === 'done') === t.done);
  shown.forEach((t) => {
    const li = document.createElement('li');
    if (t.done) li.className = 'done';

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = t.done;
    box.onchange = () => { t.done = box.checked; render(); };

    const label = document.createElement('span');
    label.textContent = t.text;

    const del = document.createElement('button');
    del.textContent = '\\u00d7';
    del.setAttribute('aria-label', 'Delete');
    del.onclick = () => { tasks = tasks.filter((x) => x.id !== t.id); render(); };

    li.append(box, label, del);
    list.appendChild(li);
  });
  const left = tasks.filter((t) => !t.done).length;
  count.textContent = left + (left === 1 ? ' task left' : ' tasks left');
}

document.getElementById('add').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('text');
  tasks.unshift({ id: nextId++, text: input.value.trim(), done: false });
  input.value = '';
  render();
});

document.getElementById('filters').addEventListener('click', (e) => {
  if (!e.target.dataset.f) return;
  filter = e.target.dataset.f;
  document.querySelectorAll('#filters button').forEach((b) => b.classList.toggle('on', b === e.target));
  render();
});

render();
`;
  return [
    { name: 'index.html', lang: 'html', content: html },
    { name: 'styles.css', lang: 'css', content: css },
    { name: 'script.js', lang: 'js', content: js },
  ];
}

function dashboard(title: string, prompt: string, p: Palette): ProjectFile[] {
  const t = esc(title);
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${t}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="app">
    <header>
      <div>
        <p class="eyebrow">${esc(prompt.length > 60 ? prompt.slice(0, 57) + '...' : prompt)}</p>
        <h1>${t}</h1>
      </div>
      <div class="range" id="range">
        <button data-r="7" class="on">7d</button>
        <button data-r="30">30d</button>
        <button data-r="90">90d</button>
      </div>
    </header>

    <section class="stats" id="stats"></section>

    <section class="panel">
      <h2>Activity</h2>
      <div class="bars" id="bars"></div>
    </section>
  </main>
  <script src="script.js"></script>
</body>
</html>
`;
  const css = `${base(p)}
.app { max-width: 880px; margin: 0 auto; padding: 32px 20px; }
header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
.eyebrow { color: var(--muted); font-size: 13px; margin-bottom: 4px; }
h1 { font-size: 34px; letter-spacing: -.03em; line-height: 1.1; }
.range { display: flex; border: 1px solid var(--line); border-radius: 10px; padding: 3px; }
.range button { font: 500 13px inherit; color: var(--muted); background: none; border: 0; padding: 7px 14px; border-radius: 8px; cursor: pointer; }
.range button.on { background: var(--accent); color: var(--ink); }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; }
.stat { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px; }
.stat small { color: var(--muted); font-size: 13px; }
.stat strong { display: block; font-size: 30px; letter-spacing: -.02em; margin: 4px 0; font-variant-numeric: tabular-nums; }
.stat em { font-style: normal; font-size: 13px; color: var(--accent); }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 20px; }
.panel h2 { font-size: 16px; margin-bottom: 16px; }
.bars { display: flex; align-items: flex-end; gap: 6px; height: 160px; }
.bars i { flex: 1; background: var(--accent); border-radius: 6px 6px 2px 2px; opacity: .85; transition: height .5s cubic-bezier(.2,.7,.2,1); min-height: 4px; }
.bars i:hover { opacity: 1; }
`;
  const js = `const metrics = [
  { label: 'Revenue', value: 48210, prefix: '$', delta: '+12.4%' },
  { label: 'Active users', value: 3920, prefix: '', delta: '+6.1%' },
  { label: 'Conversion', value: 4.8, prefix: '', suffix: '%', delta: '+0.6%' },
  { label: 'Avg. order', value: 62, prefix: '$', delta: '+3.2%' },
];

const stats = document.getElementById('stats');
const bars = document.getElementById('bars');

function fmt(n) {
  return n % 1 ? n.toFixed(1) : Math.round(n).toLocaleString();
}

function renderStats() {
  stats.innerHTML = '';
  metrics.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'stat';
    card.innerHTML = '<small>' + m.label + '</small><strong>0</strong><em>' + m.delta + ' vs last period</em>';
    stats.appendChild(card);

    const out = card.querySelector('strong');
    const start = performance.now();
    (function tick(now) {
      const k = Math.min(1, (now - start) / 700);
      out.textContent = m.prefix + fmt(m.value * k) + (m.suffix || '');
      if (k < 1) requestAnimationFrame(tick);
    })(start);
  });
}

function renderBars(days) {
  bars.innerHTML = '';
  const n = Math.min(days, 30);
  for (let i = 0; i < n; i++) {
    const bar = document.createElement('i');
    bar.style.height = '4px';
    bar.title = 'Day ' + (i + 1);
    bars.appendChild(bar);
    const h = 30 + Math.abs(Math.sin(i * 1.7 + days)) * 70;
    setTimeout(() => { bar.style.height = h + '%'; }, i * 20);
  }
}

document.getElementById('range').addEventListener('click', (e) => {
  if (!e.target.dataset.r) return;
  document.querySelectorAll('#range button').forEach((b) => b.classList.toggle('on', b === e.target));
  renderBars(Number(e.target.dataset.r));
});

renderStats();
renderBars(7);
`;
  return [
    { name: 'index.html', lang: 'html', content: html },
    { name: 'styles.css', lang: 'css', content: css },
    { name: 'script.js', lang: 'js', content: js },
  ];
}

/* ---------------- PLAN TEMPLATES ---------------- */

interface Spec {
  path: string;
  purpose: string;
  details: string[];
}

const SPECS: Record<Kind, { label: string; milestones: string[]; files: Spec[] }> = {
  landing: {
    label: 'Marketing landing page',
    milestones: ['Lay out hero, features and signup sections', 'Style with a single accent colour and clear type scale', 'Wire the waitlist form and confirmation message', 'Check at mobile, tablet and desktop widths'],
    files: [
      { path: 'index.html', purpose: 'Page structure and copy', details: ['Sticky nav with primary call to action', 'Hero with headline, subhead and two buttons', 'Three feature cards', 'Waitlist form'] },
      { path: 'styles.css', purpose: 'Design tokens and layout', details: ['CSS variables for colour', 'Fluid headline using clamp()', 'Responsive card grid', 'Hover lift on cards and buttons'] },
      { path: 'script.js', purpose: 'Form behaviour', details: ['Handle submit and prevent reload', 'Show a personalised confirmation', 'Reset the field after joining'] },
    ],
  },
  todo: {
    label: 'Interactive task app',
    milestones: ['Define the task model and seed data', 'Build add, complete and delete interactions', 'Add All / Open / Done filters', 'Polish empty and completed states'],
    files: [
      { path: 'index.html', purpose: 'App shell', details: ['Header with live task count', 'Add-task form', 'Filter pills and list container'] },
      { path: 'styles.css', purpose: 'Visual system', details: ['Card-style list rows', 'Strike-through on completed items', 'Entrance animation for new rows'] },
      { path: 'script.js', purpose: 'State and rendering', details: ['tasks array with id, text, done', 'render() rebuilds the list from state', 'Filter switching and counter'] },
    ],
  },
  dashboard: {
    label: 'Analytics dashboard',
    milestones: ['Choose the four headline metrics', 'Build the stat cards and activity chart', 'Add a 7 / 30 / 90 day range switch', 'Animate numbers and bars on load'],
    files: [
      { path: 'index.html', purpose: 'Dashboard frame', details: ['Title with range switcher', 'Stat card container', 'Activity chart panel'] },
      { path: 'styles.css', purpose: 'Layout and chart styling', details: ['Auto-fit stat grid', 'Bar chart with rounded tops', 'Tabular numerals for figures'] },
      { path: 'script.js', purpose: 'Data and animation', details: ['metrics array with deltas', 'Count-up animation per card', 'Bars re-render for the selected range'] },
    ],
  },
};

function planFiles(kind: Kind, title: string, prompt: string, p: Palette): ProjectFile[] {
  const spec = SPECS[kind];
  const plan = `# ${title} — Build plan

> ${prompt}

## Overview
Type: **${spec.label}**
Stack: static HTML, CSS and vanilla JavaScript. No build step.

## Milestones
${spec.milestones.map((m, i) => `${i + 1}. ${m}`).join('\n')}

## Definition of done
- Works at 375px, 768px and 1280px wide
- Every interactive element has a visible focus state
- Colour contrast of 4.5:1 or better for text
`;
  const files = `# File specifications

${spec.files.map((f) => `## ${f.path}\n${f.purpose}\n\n${f.details.map((d) => `- ${d}`).join('\n')}`).join('\n\n')}
`;
  const cards = spec.files
    .map(
      (f, i) => `      <article>
        <span class="n">0${i + 1}</span>
        <h3>${esc(f.path)}</h3>
        <p class="purpose">${esc(f.purpose)}</p>
        <ul>${f.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
      </article>`,
    )
    .join('\n');
  const blueprint = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} blueprint</title>
  <style>
${base(p)}
    .page { max-width: 880px; margin: 0 auto; padding: 32px 20px; }
    .tag { color: var(--accent); font: 500 12px ui-monospace, monospace; text-transform: uppercase; letter-spacing: .08em; }
    h1 { font-size: 32px; letter-spacing: -.03em; margin: 6px 0 8px; }
    .sub { color: var(--muted); max-width: 56ch; margin-bottom: 24px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    article { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px; }
    .n { color: var(--accent); font: 500 12px ui-monospace, monospace; }
    h3 { font: 600 16px ui-monospace, monospace; margin: 6px 0 2px; }
    .purpose { color: var(--muted); font-size: 14px; margin-bottom: 10px; }
    ul { padding-left: 18px; font-size: 14px; display: grid; gap: 4px; }
    li::marker { color: var(--accent); }
  </style>
</head>
<body>
  <main class="page">
    <p class="tag">${esc(spec.label)} · ${spec.files.length} files</p>
    <h1>${esc(title)}</h1>
    <p class="sub">${esc(prompt.length > 140 ? prompt.slice(0, 137) + '...' : prompt)}</p>
    <section class="cards">
${cards}
    </section>
  </main>
</body>
</html>
`;
  return [
    { name: 'PLAN.md', lang: 'md', content: plan },
    { name: 'FILES.spec.md', lang: 'md', content: files },
    { name: 'blueprint.html', lang: 'html', content: blueprint },
  ];
}

export function generate(prompt: string, mode: Mode): Project {
  const clean = prompt.trim();
  const kind = detectKind(clean);
  const title = titleFrom(clean);
  const palette = PALETTES[hash(clean) % PALETTES.length];
  if (mode === 'plan') return { title, mode, files: planFiles(kind, title, clean, palette) };
  const files = kind === 'todo' ? todo(title, clean, palette) : kind === 'dashboard' ? dashboard(title, clean, palette) : landing(title, clean, palette);
  return { title, mode, files };
}
