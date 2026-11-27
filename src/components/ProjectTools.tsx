import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Check, Copy, Download, FileCode2, Plus, Trash2, ShieldCheck, ShieldAlert, CreditCard, Mail, Smartphone, User, ExternalLink, Save, Loader2 } from 'lucide-react';
import type { Project, ProjectFile, Lang } from '../lib/generator';
import { supabase, type Account } from '../lib/auth';

export type ToolPage = 'files' | 'security' | 'payments' | 'users' | 'email' | 'mobile';

interface Props {
  page: ToolPage;
  account: Account;
  project: Project | null;
  link: string;
  sessionId: string | null;
  onClose: () => void;
  onApply: (files: ProjectFile[], title: string) => void;
  onBuy: () => void;
  notify: (m: string) => void;
}

const field = 'min-w-0 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-volt/60';
const primary = 'flex items-center justify-center gap-2 rounded-lg bg-volt px-4 py-2 text-sm font-semibold text-volt-ink transition hover:shadow-glow active:scale-95 disabled:opacity-50';
const ghost = 'flex items-center gap-1.5 rounded-lg border border-line bg-raised px-3 py-2 text-xs font-medium transition hover:text-volt active:scale-95 disabled:opacity-50';
const card = 'rounded-xl border border-line bg-panel p-4';
const label = 'text-xs font-medium text-muted';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const langOf = (n: string): Lang => (n.endsWith('.css') ? 'css' : n.endsWith('.js') ? 'js' : n.endsWith('.md') ? 'md' : 'html');

function strip(c: string, name: string) {
  return c.replace(new RegExp(`<!--sb:${name}-->[\\s\\S]*?<!--/sb:${name}-->\\s*`, 'g'), '');
}
function inject(c: string, name: string, html: string, where: 'head' | 'body') {
  const clean = strip(c, name);
  if (!html) return clean;
  const block = `<!--sb:${name}-->${html}<!--/sb:${name}-->\n`;
  const tag = where === 'head' ? /<\/head>/i : /<\/body>/i;
  return tag.test(clean) ? clean.replace(tag, () => `${block}</${where}>`) : clean + block;
}
const has = (c: string, name: string) => c.includes(`<!--sb:${name}-->`);

function FullPage({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] h-[100dvh] overflow-y-auto bg-bg text-fg">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
        <button onClick={onClose} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-muted transition hover:bg-raised hover:text-fg"><ChevronLeft size={16} /> Project</button>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
        <div className="mt-6 text-sm">{children}</div>
      </div>
    </div>
  );
}

export default function ProjectTools(p: Props) {
  const { page, account, project, link, onClose, onApply, notify } = p;
  const [files, setFiles] = useState<ProjectFile[]>(project?.files || []);
  const title = project?.title || 'Project';
  const index = files.find((f) => f.name === 'index.html');

  useEffect(() => { setFiles(project?.files || []); }, [project]);

  function apply(next: ProjectFile[], msg: string) {
    setFiles(next);
    onApply(next, title);
    notify(msg);
  }
  function patchIndex(fn: (c: string) => string, msg: string) {
    if (!index) return notify('This project has no index.html to update.');
    apply(files.map((f) => (f.name === 'index.html' ? { ...f, content: fn(f.content) } : f)), msg);
  }

  /* ---------------- Files ---------------- */
  const [sel, setSel] = useState(files[0]?.name || '');
  const [draft, setDraft] = useState(files[0]?.content || '');
  const [newName, setNewName] = useState('');
  const [copied, setCopied] = useState(false);
  const cur = files.find((f) => f.name === sel);
  useEffect(() => { if (cur) setDraft(cur.content); }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!cur && draft !== cur.content;

  function saveFile() {
    if (!cur) return;
    apply(files.map((f) => (f.name === sel ? { ...f, content: draft } : f)), `Saved ${sel}.`);
  }
  function addFile() {
    const n = newName.trim().replace(/^\/+/, '');
    if (!/^[\w\-./]+\.\w+$/.test(n)) return notify('Use a file name like about.html or app.js.');
    if (files.some((f) => f.name === n)) return notify('That file already exists.');
    apply([...files, { name: n, lang: langOf(n), content: '' }], `Created ${n}.`);
    setNewName(''); setSel(n); setDraft('');
  }
  function delFile() {
    if (!cur || cur.name === 'index.html') return notify('index.html can’t be deleted.');
    if (!window.confirm(`Delete ${cur.name}?`)) return;
    const next = files.filter((f) => f.name !== sel);
    apply(next, `Deleted ${sel}.`);
    setSel(next[0]?.name || '');
  }
  function dl() {
    if (!cur) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([draft], { type: 'text/plain' }));
    a.download = cur.name.split('/').pop() || cur.name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function copyText(t: string) {
    try { await navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { notify('Copy failed.'); }
  }

  /* ---------------- Security ---------------- */
  const issues = useMemo(() => {
    const out: { sev: 'high' | 'med' | 'low'; text: string; file: string }[] = [];
    const rules: [RegExp, 'high' | 'med' | 'low', string][] = [
      [/sk_live_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}/, 'high', 'A private API key appears to be hard-coded. Move it to Secrets.'],
      [/\beval\s*\(|new Function\s*\(/, 'high', 'Uses eval() or new Function(), which can run injected code.'],
      [/document\.write\s*\(/, 'med', 'Uses document.write(), which is unsafe and slow.'],
      [/\.innerHTML\s*=/, 'med', 'Writes to innerHTML. Make sure the data is escaped.'],
      [/(src|href)=["']http:\/\//i, 'med', 'Loads a resource over insecure http://.'],
      [/<a\b(?=[^>]*target=["']_blank["'])(?![^>]*rel=)[^>]*>/i, 'low', 'External link with target="_blank" is missing rel="noopener".'],
      [/<input[^>]*type=["']password["'][^>]*>(?![\s\S]*autocomplete)/i, 'low', 'Password field has no autocomplete attribute.'],
    ];
    files.forEach((f) => rules.forEach(([re, sev, text]) => { if (re.test(f.content)) out.push({ sev, text, file: f.name }); }));
    return out;
  }, [files]);
  const noindex = !!index && has(index.content, 'noindex');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState('');
  async function changePw() {
    if (pw.length < 8) return notify('Use at least 8 characters.');
    if (pw !== pw2) return notify('Passwords don’t match.');
    setBusy('pw');
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy('');
    if (error) return notify(error.message);
    setPw(''); setPw2(''); notify('Password updated.');
  }
  async function signOutOthers() {
    setBusy('others');
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    setBusy('');
    notify(error ? error.message : 'Signed out of all other devices.');
  }

  /* ---------------- Payments ---------------- */
  const [payUrl, setPayUrl] = useState('');
  const [payLabel, setPayLabel] = useState('Pay now');
  const [payProv, setPayProv] = useState('Stripe');
  const payOn = !!index && has(index.content, 'pay');
  function addPay() {
    let u: URL;
    try { u = new URL(payUrl.trim()); if (u.protocol !== 'https:') throw new Error(); } catch { return notify('Enter a full https:// payment link.'); }
    const html = `<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(payProv)} checkout" style="position:fixed;left:16px;bottom:16px;z-index:9999;background:#111;color:#fff;padding:12px 20px;border-radius:999px;font:600 14px system-ui,sans-serif;text-decoration:none;box-shadow:0 6px 24px rgba(0,0,0,.3)">${esc(payLabel.trim() || 'Pay now')}</a>`;
    patchIndex((c) => inject(c, 'pay', html, 'body'), 'Pay button added to your site.');
  }

  /* ---------------- Users ---------------- */
  const [name, setName] = useState(account.name || '');
  const inviteLink = `${window.location.origin}/signup?ref=${account.id}`;
  async function saveName() {
    if (!name.trim()) return notify('Enter a name.');
    setBusy('name');
    const { error } = await supabase.auth.updateUser({ data: { name: name.trim(), full_name: name.trim() } });
    setBusy('');
    notify(error ? error.message : 'Profile updated. It shows after your next sign-in.');
  }

  /* ---------------- Email ---------------- */
  const [mailTo, setMailTo] = useState('');
  const [mailHead, setMailHead] = useState('Contact us');
  const mailOn = !!index && has(index.content, 'contact');
  function addContact() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailTo.trim())) return notify('Enter a valid email address.');
    const to = esc(mailTo.trim());
    const html = `<section id="contact" style="max-width:520px;margin:48px auto;padding:24px;font-family:system-ui,sans-serif"><h2 style="margin:0 0 12px">${esc(mailHead.trim() || 'Contact us')}</h2><form onsubmit="event.preventDefault();var f=this;location.href='mailto:${to}?subject='+encodeURIComponent('Message from '+f.n.value)+'&body='+encodeURIComponent(f.m.value+'\\n\\nReply to: '+f.e.value)" style="display:grid;gap:10px"><input name="n" required placeholder="Your name" style="padding:10px;border:1px solid #ccc;border-radius:8px"><input name="e" type="email" required placeholder="Your email" style="padding:10px;border:1px solid #ccc;border-radius:8px"><textarea name="m" required rows="4" placeholder="Message" style="padding:10px;border:1px solid #ccc;border-radius:8px"></textarea><button style="padding:12px;border:0;border-radius:8px;background:#111;color:#fff;font-weight:600;cursor:pointer">Send message</button></form></section>`;
    patchIndex((c) => inject(c, 'contact', html, 'body'), 'Contact form added to your site.');
  }

  /* ---------------- Mobile ---------------- */
  const [appName, setAppName] = useState(title);
  const [theme, setTheme] = useState('#0b0b0c');
  const pwaOn = !!index && has(index.content, 'pwa');
  function enablePwa() {
    const n = appName.trim().slice(0, 30) || title;
    const manifest = JSON.stringify({ name: n, short_name: n.slice(0, 12), display: 'standalone', start_url: '.', background_color: theme, theme_color: theme });
    const html = `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="${esc(theme)}"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${esc(n)}"><link rel="manifest" href="data:application/manifest+json,${encodeURIComponent(manifest)}">`;
    patchIndex((c) => inject(c, 'pwa', html, 'head'), 'Mobile app settings applied. Republish to go live.');
  }
  const qr = link ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(link)}` : '';
  const viewportOk = !!index && /name=["']viewport["']/i.test(index.content);

  const noLink = <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">Publish your site first to get a live link.</p>;

  if (page === 'files') {
    return (
      <FullPage title="Files" subtitle="Browse, edit, add and download your project files." onClose={onClose}>
        {!files.length ? <p className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-muted">Build something first and its files show up here.</p> : (
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <div className={`${card} space-y-2`}>
              <ul className="max-h-60 space-y-1 overflow-y-auto md:max-h-[60dvh]">
                {files.map((f) => (
                  <li key={f.name}>
                    <button onClick={() => setSel(f.name)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${sel === f.name ? 'bg-raised text-volt' : 'text-muted hover:bg-raised'}`}>
                      <FileCode2 size={13} /> <span className="truncate">{f.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-1.5 border-t border-line pt-2">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addFile()} placeholder="new-file.js" className={`${field} !py-1.5 text-xs`} />
                <button onClick={addFile} aria-label="Add file" className={ghost}><Plus size={14} /></button>
              </div>
            </div>
            <div className={`${card} flex min-w-0 flex-col gap-3`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto truncate font-mono text-xs">{sel}{dirty ? ' •' : ''}</span>
                <button onClick={() => copyText(draft)} className={ghost}>{copied ? <Check size={13} /> : <Copy size={13} />} Copy</button>
                <button onClick={dl} className={ghost}><Download size={13} /> Download</button>
                <button onClick={delFile} className={ghost} aria-label="Delete file"><Trash2 size={13} /></button>
                <button onClick={saveFile} disabled={!dirty} className={`${primary} !py-2 text-xs`}><Save size={13} /> Save</button>
              </div>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} className={`${field} h-[50dvh] resize-none font-mono text-xs leading-relaxed`} />
            </div>
          </div>
        )}
      </FullPage>
    );
  }

  if (page === 'security') {
    const sev = { high: 'text-red-400', med: 'text-amber-400', low: 'text-muted' };
    return (
      <FullPage title="Security" subtitle="Scan your code, control search visibility and protect your account." onClose={onClose}>
        <div className="space-y-4">
          <div className={card}>
            <div className="mb-3 flex items-center gap-2 font-medium">
              {issues.length ? <ShieldAlert size={17} className="text-amber-400" /> : <ShieldCheck size={17} className="text-volt" />}
              Code scan {issues.length ? `· ${issues.length} finding${issues.length > 1 ? 's' : ''}` : '· no issues found'}
            </div>
            {issues.length === 0 ? <p className="text-xs text-muted">Scanned {files.length} file{files.length === 1 ? '' : 's'} for exposed keys and unsafe patterns.</p> : (
              <ul className="space-y-2">
                {issues.map((i, k) => (
                  <li key={k} className="rounded-lg border border-line bg-bg p-2.5 text-xs">
                    <span className={`mr-2 font-semibold uppercase ${sev[i.sev]}`}>{i.sev}</span>{i.text}
                    <button onClick={() => { setSel(i.file); }} className="ml-2 font-mono text-faint">{i.file}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={`${card} flex items-center justify-between gap-3`}>
            <div>
              <p className="font-medium">Hide from search engines</p>
              <p className="mt-0.5 text-xs text-muted">Adds a noindex tag so Google skips your site. Republish to apply.</p>
            </div>
            <button
              role="switch" aria-checked={noindex}
              onClick={() => patchIndex((c) => inject(c, 'noindex', noindex ? '' : '<meta name="robots" content="noindex,nofollow">', 'head'), noindex ? 'Search visibility restored.' : 'Site hidden from search engines.')}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${noindex ? 'bg-volt' : 'bg-raised border border-line'}`}
            ><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${noindex ? 'left-[22px]' : 'left-0.5'}`} /></button>
          </div>
          <div className={`${card} space-y-2`}>
            <p className="font-medium">Account security</p>
            {account.provider === 'google' ? <p className="text-xs text-muted">You sign in with Google, so your password is managed by Google.</p> : (
              <>
                <label className={label}>New password</label>
                <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={field} />
                <label className={label}>Confirm password</label>
                <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={field} />
                <button onClick={changePw} disabled={busy === 'pw'} className={`${primary} w-full`}>{busy === 'pw' && <Loader2 size={14} className="animate-spin" />} Update password</button>
              </>
            )}
            <button onClick={signOutOthers} disabled={busy === 'others'} className={`${ghost} w-full justify-center py-2.5`}>{busy === 'others' && <Loader2 size={13} className="animate-spin" />} Sign out of all other devices</button>
          </div>
        </div>
      </FullPage>
    );
  }

  if (page === 'payments') {
    return (
      <FullPage title="Payments" subtitle="Take payments on your site and manage your credits." onClose={onClose}>
        <div className="space-y-4">
          <div className={`${card} flex items-center justify-between gap-3`}>
            <div><p className="text-xs text-muted">Credits balance</p><p className="text-2xl font-semibold">{account.credits}</p></div>
            <button onClick={p.onBuy} className={primary}><CreditCard size={15} /> Buy credits</button>
          </div>
          <div className={`${card} space-y-2`}>
            <p className="font-medium">Add a payment button to your site</p>
            <p className="text-xs text-muted">Paste a hosted checkout link from Stripe, PayPal, Pesapal or Square. A floating button is added to your site.</p>
            <label className={label}>Provider</label>
            <select value={payProv} onChange={(e) => setPayProv(e.target.value)} className={field}>{['Stripe', 'PayPal', 'Pesapal', 'Square', 'Other'].map((x) => <option key={x}>{x}</option>)}</select>
            <label className={label}>Payment link</label>
            <input value={payUrl} onChange={(e) => setPayUrl(e.target.value)} placeholder="https://buy.stripe.com/…" className={field} />
            <label className={label}>Button text</label>
            <input value={payLabel} onChange={(e) => setPayLabel(e.target.value)} maxLength={24} className={field} />
            <div className="flex gap-2">
              <button onClick={addPay} className={`${primary} flex-1`}>{payOn ? 'Update button' : 'Add button'}</button>
              {payOn && <button onClick={() => patchIndex((c) => inject(c, 'pay', '', 'body'), 'Payment button removed.')} className={ghost}><Trash2 size={13} /> Remove</button>}
            </div>
            {payOn && <p className="text-xs text-volt">Payment button is on your site. Republish to go live.</p>}
          </div>
          <p className="text-xs text-muted">Private payment keys (like STRIPE_SECRET_KEY) belong in Secrets, never in your site code.</p>
        </div>
      </FullPage>
    );
  }

  if (page === 'users') {
    return (
      <FullPage title="Users" subtitle="Your profile, plan and invite link." onClose={onClose}>
        <div className="space-y-4">
          <div className={`${card} space-y-2`}>
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-volt text-lg font-semibold text-volt-ink">{(account.name || account.email)[0]?.toUpperCase()}</span>
              <div className="min-w-0"><p className="truncate font-medium">{account.name || 'No name set'}</p><p className="truncate text-xs text-muted">{account.email}</p></div>
              <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-[10px] uppercase text-muted">{account.provider}</span>
            </div>
            <label className={label}>Display name</label>
            <div className="flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} className={field} />
              <button onClick={saveName} disabled={busy === 'name'} className={primary}>Save</button>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              <div className="rounded-lg border border-line bg-bg p-2.5"><p className="text-muted">Credits</p><p className="text-base font-semibold">{account.credits}</p></div>
              <div className="rounded-lg border border-line bg-bg p-2.5"><p className="text-muted">User ID</p><p className="truncate font-mono">{account.id.slice(0, 13)}…</p></div>
            </div>
          </div>
          <div className={`${card} space-y-2`}>
            <p className="flex items-center gap-2 font-medium"><User size={15} /> Invite a friend</p>
            <p className="text-xs text-muted">Share your link. You both earn credits when they sign up.</p>
            <div className="flex items-center gap-1.5 rounded-xl border border-line bg-bg p-1.5">
              <span className="min-w-0 flex-1 truncate px-1.5 font-mono text-xs">{inviteLink}</span>
              <button onClick={() => copyText(inviteLink)} className={ghost}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}</button>
            </div>
          </div>
        </div>
      </FullPage>
    );
  }

  if (page === 'email') {
    return (
      <FullPage title="Email" subtitle="Let visitors email you straight from your site." onClose={onClose}>
        <div className="space-y-4">
          <div className={`${card} space-y-2`}>
            <p className="font-medium">Contact form</p>
            <p className="text-xs text-muted">Adds a contact form to the bottom of your site. Messages open in the visitor’s email app, addressed to you.</p>
            <label className={label}>Your email</label>
            <input type="email" value={mailTo} onChange={(e) => setMailTo(e.target.value)} placeholder="you@company.com" className={field} />
            <label className={label}>Form heading</label>
            <input value={mailHead} onChange={(e) => setMailHead(e.target.value)} maxLength={40} className={field} />
            <div className="flex gap-2">
              <button onClick={addContact} className={`${primary} flex-1`}>{mailOn ? 'Update form' : 'Add contact form'}</button>
              {mailOn && <button onClick={() => patchIndex((c) => inject(c, 'contact', '', 'body'), 'Contact form removed.')} className={ghost}><Trash2 size={13} /> Remove</button>}
            </div>
            {mailOn && <p className="text-xs text-volt">Contact form is on your site. Republish to go live.</p>}
            <a href={mailTo ? `mailto:${mailTo}?subject=Test` : undefined} onClick={() => !mailTo && notify('Enter your email first.')} className={`${ghost} w-fit`}><Mail size={13} /> Send a test email</a>
          </div>
          <div className={`${card} text-xs text-muted`}>
            Want automatic emails, like receipts or welcome messages? Connect Resend, SendGrid or Mailchimp from <b className="text-fg">Connector</b>, and store the key in <b className="text-fg">Secrets</b>.
          </div>
        </div>
      </FullPage>
    );
  }

  return (
    <FullPage title="Mobile" subtitle="Make your site feel like an app on phones." onClose={onClose}>
      <div className="space-y-4">
        <div className={card}>
          <p className="mb-2 font-medium">Open on your phone</p>
          {link ? (
            <div className="flex flex-wrap items-center gap-4">
              <img src={qr} alt="QR code for your live site" width={140} height={140} className="rounded-lg bg-white" />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="truncate font-mono text-xs">{link}</p>
                <div className="flex gap-2">
                  <button onClick={() => copyText(link)} className={ghost}>{copied ? <Check size={13} /> : <Copy size={13} />} Copy</button>
                  <a href={link} target="_blank" rel="noreferrer" className={ghost}>Open <ExternalLink size={12} /></a>
                </div>
                <p className="text-xs text-muted">Scan with your phone camera to test it.</p>
              </div>
            </div>
          ) : noLink}
        </div>
        <div className={`${card} space-y-2`}>
          <p className="flex items-center gap-2 font-medium"><Smartphone size={15} /> Installable app (PWA)</p>
          <p className="text-xs text-muted">Adds a mobile viewport, theme colour and app name so visitors can add your site to their home screen.</p>
          <label className={label}>App name</label>
          <input value={appName} onChange={(e) => setAppName(e.target.value)} maxLength={30} className={field} />
          <label className={label}>Theme colour</label>
          <div className="flex items-center gap-2"><input type="color" value={theme} onChange={(e) => setTheme(e.target.value)} className="h-9 w-12 rounded border border-line bg-bg" /><span className="font-mono text-xs">{theme}</span></div>
          <div className="flex gap-2">
            <button onClick={enablePwa} className={`${primary} flex-1`}>{pwaOn ? 'Update settings' : 'Enable mobile app mode'}</button>
            {pwaOn && <button onClick={() => patchIndex((c) => inject(c, 'pwa', '', 'head'), 'Mobile app mode removed.')} className={ghost}><Trash2 size={13} /> Remove</button>}
          </div>
          <p className={`text-xs ${viewportOk || pwaOn ? 'text-volt' : 'text-amber-400'}`}>{viewportOk || pwaOn ? 'Mobile viewport is set.' : 'No mobile viewport tag found. Enable mobile app mode to add it.'}</p>
        </div>
      </div>
    </FullPage>
  );
}
