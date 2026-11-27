import { useEffect, useRef, useState } from 'react';
import { FolderOpen, ShieldCheck, CreditCard, Users, Mail, Smartphone, ChevronLeft, Plus, Check, Copy, ExternalLink, Github, KeyRound, Loader2, MessageCircle, MoreHorizontal, Share2, Plug, Rocket, Trash2, SlidersHorizontal, Globe, History, BarChart3, Search, RotateCcw } from 'lucide-react';
import type { Project, ProjectFile } from '../lib/generator';
import { bizKey, deploySite as rawDeploy, loadBiz, loadMessages, saveDomain, siteUrl } from '../lib/chat';
import { supabase, type Account } from '../lib/auth';
import ConnectorsPage from './ConnectorsPage';
import ProjectTools, { type ToolPage } from './ProjectTools';
import { allCurrencies, currencyLabel } from '../lib/currencies';

interface Props {
  account: Account;
  sessionId: string | null;
  project: Project | null;
  onBuy: () => void;
  notify: (m: string) => void;
  up?: boolean;
  onRestore?: (files: ProjectFile[], title: string) => void;
}

type Page = 'general' | 'domains' | 'github' | 'versions' | 'secrets' | 'connectors' | 'seo' | 'analytics' | ToolPage;
const TOOL_PAGES: Page[] = ['files', 'security', 'payments', 'users', 'email', 'mobile'];

interface Version { id: string | number; title: string; files: ProjectFile[]; n: number }

const MENU: { group: string; items: { id: Page; label: string; icon: typeof Globe }[] }[] = [
  { group: 'Project', items: [
    { id: 'general', label: 'General', icon: SlidersHorizontal },
    { id: 'domains', label: 'Domains', icon: Globe },
    { id: 'github', label: 'GitHub', icon: Github },
    { id: 'versions', label: 'Versions', icon: History },
  ] },
  { group: 'Backend & Tools', items: [
    { id: 'secrets', label: 'Secrets', icon: KeyRound },
    { id: 'connectors', label: 'Connector', icon: Plug },
    { id: 'files', label: 'Files', icon: FolderOpen },
    { id: 'security', label: 'Security', icon: ShieldCheck },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'email', label: 'Email', icon: Mail },
    { id: 'mobile', label: 'Mobile', icon: Smartphone },
  ] },
  { group: 'Insights & Growth', items: [
    { id: 'seo', label: 'SEO & Branding', icon: Search },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ] },
];

const REGISTRARS = [
  { name: 'Namecheap', url: 'https://namecheap.com' },
  { name: 'GoDaddy', url: 'https://godaddy.com' },
  { name: 'Cloudflare', url: 'https://cloudflare.com' },
];

const field = 'min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-volt/60';
const primary = 'flex items-center justify-center gap-2 rounded-lg bg-volt px-4 py-2 text-sm font-semibold text-volt-ink transition hover:shadow-glow active:scale-95 disabled:opacity-50';
const ghost = 'flex items-center gap-1.5 rounded-lg border border-line bg-raised px-3 py-2 text-xs font-medium transition hover:text-volt active:scale-95';

function FullPage({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] h-[100dvh] overflow-y-auto bg-bg text-fg">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
        <button onClick={onClose} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-muted transition hover:bg-raised hover:text-fg"><ChevronLeft size={16} /> Project</button>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

export default function PublishMenu({ account, sessionId, project, notify, up, onRestore, onBuy }: Props) {
  const userId = account.id;
  const [pop, setPop] = useState(false);
  const [more, setMore] = useState(false);
  const [modal, setModal] = useState<null | Page>(null);
  const [gName, setGName] = useState('');
  const [gDesc, setGDesc] = useState('');
  const [seo, setSeo] = useState({ title: '', description: '', favicon: '' });
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [stats, setStats] = useState<{ total: number; week: number; today: number; days: { d: string; n: number }[]; refs: { r: string; n: number }[] } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const sidKey = sessionId || 'home';
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const deploySite = (u: string, s: string | null, p: Project) => {
    let cfg = { title: '', description: '', favicon: '' };
    try { cfg = { ...cfg, ...JSON.parse(localStorage.getItem(`sb_seo:${sidKey}`) || '{}') }; } catch { /* ignore */ }
    if (!cfg.title && !cfg.description && !cfg.favicon) return rawDeploy(u, s, p);
    const files = p.files.map((f) => {
      if (f.name !== 'index.html') return f;
      let c = f.content;
      if (cfg.title) c = /<title>[\s\S]*?<\/title>/i.test(c) ? c.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(cfg.title)}</title>`) : c.replace(/<head[^>]*>/i, (m) => `${m}<title>${esc(cfg.title)}</title>`);
      const extra = (cfg.description ? `<meta name="description" content="${esc(cfg.description)}">` : '') + (cfg.favicon ? `<link rel="icon" href="${esc(cfg.favicon)}">` : '');
      if (extra) c = c.replace(/<head[^>]*>/i, (m) => `${m}${extra}`);
      return { ...f, content: c };
    });
    return rawDeploy(u, s, { ...p, files });
  };
  const [slug, setSlug] = useState<string | null>(null);
  const [domainSaved, setDomainSaved] = useState('');
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);
  const [bizPhone, setBizPhone] = useState(() => loadBiz(sessionId)?.phone || '');
  const [curQ, setCurQ] = useState('');
  const [bizCur, setBizCur] = useState(() => loadBiz(sessionId)?.currency || 'TZS');
  const [shared, setShared] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // secrets
  const [secrets, setSecrets] = useState<{ key: string; value: string }[]>([]);
  const [adding, setAdding] = useState(false);
  const [sk, setSk] = useState('');
  const [sv, setSv] = useState('');
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  // github
  const [repo, setRepo] = useState(() => localStorage.getItem('sb_gh_repo') || '');
  const [token, setToken] = useState('');
  const [ghMsg, setGhMsg] = useState('');

  useEffect(() => {
    if (!pop && !more) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) { setPop(false); setMore(false); }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [pop, more]);

  async function openPublish() {
    setMore(false);
    const next = !pop;
    setPop(next);
    if (next && sessionId) {
      const { data } = await supabase.from('published_sites').select('slug,domain').eq('session_id', sessionId).maybeSingle();
      if (data) { setSlug(data.slug as string); setDomainSaved((data.domain as string) || ''); }
    }
  }

  async function update() {
    if (!project) return;
    setBusy('update');
    try {
      const r = await deploySite(userId, sessionId, project);
      setSlug(r.slug);
      if (r.domain) setDomainSaved(r.domain);
      notify('Your site is updated and live.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not publish.');
    } finally { setBusy(''); }
  }

  async function connectDomain() {
    if (!project) return;
    const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d)) return notify('Enter a valid domain, e.g. yourdomain.com');
    setBusy('domain');
    try {
      const r = await deploySite(userId, sessionId, project);
      setSlug(r.slug);
      await saveDomain(r.slug, d);
      setDomainSaved(d);
      notify('Domain saved. Add the DNS record shown below.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not connect the domain.');
    } finally { setBusy(''); }
  }

  async function saveBiz() {
    const ph = bizPhone.trim();
    if (!/^\+?[\d\s-]{9,16}$/.test(ph)) return notify('Enter a WhatsApp number like +255712345678.');
    localStorage.setItem(bizKey(sessionId), JSON.stringify({ phone: ph, currency: bizCur }));
    if (slug && project) {
      setBusy('biz');
      try { await deploySite(userId, sessionId, project); notify('Saved. Order buttons now open your WhatsApp.'); }
      catch (e) { notify(e instanceof Error ? e.message : 'Could not update the site.'); }
      finally { setBusy(''); }
    } else notify('Saved. Order buttons will open WhatsApp when you publish.');
  }

  async function shareClient() {
    if (!slug) return notify('Publish your site first to get a client link.');
    await copy(`${siteUrl(slug)}&view=client`);
    setShared(true);
    setTimeout(() => setShared(false), 1800);
    notify('Client preview link copied.');
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { notify('Could not copy the link.'); }
  }

  const sid = sessionId || 'home';
  const secretId = (k: string) => `secret:${sid}:${k}`;

  async function loadSecrets() {
    const { data } = await supabase.from('connector_credentials').select('connector_id,secrets').like('connector_id', `secret:${sid}:%`);
    setSecrets((data || []).map((r: { connector_id: string; secrets: Record<string, string> }) => ({ key: r.connector_id.split(':').slice(2).join(':'), value: r.secrets?.value || '' })));
  }

  async function openModal(m: Page) {
    setMore(false);
    setModal(m);
    setConfirmDel(false);
    if (m === 'secrets') loadSecrets();
    if (m === 'general') {
      setGName(project?.title || '');
      setGDesc(localStorage.getItem(`sb_desc:${sidKey}`) || '');
    }
    if (m === 'seo') {
      let c = { title: project?.title || '', description: '', favicon: '' };
      try { c = { ...c, ...JSON.parse(localStorage.getItem(`sb_seo:${sidKey}`) || '{}') }; } catch { /* ignore */ }
      setSeo(c);
    }
    if (TOOL_PAGES.includes(m) && !slug && sessionId) {
      const { data } = await supabase.from('published_sites').select('slug,domain').eq('session_id', sessionId).maybeSingle();
      if (data) setSlug(data.slug as string);
    }
    if (m === 'domains' || m === 'analytics') {
      let s = slug;
      if (!s && sessionId) {
        const { data } = await supabase.from('published_sites').select('slug,domain').eq('session_id', sessionId).maybeSingle();
        if (data) { s = data.slug as string; setSlug(s); setDomainSaved((data.domain as string) || ''); }
      }
      if (m === 'analytics') {
        setStats(null);
        if (!s) return setStats({ total: 0, week: 0, today: 0, days: [], refs: [] });
        const { data } = await supabase.from('site_views').select('created_at,referrer').eq('slug', s).order('created_at', { ascending: false }).limit(5000);
        const rows = (data || []) as { created_at: string; referrer: string | null }[];
        const now = Date.now();
        const days = Array.from({ length: 7 }, (_, i) => {
          const dt = new Date(now - (6 - i) * 864e5);
          const key = dt.toISOString().slice(0, 10);
          return { d: dt.toLocaleDateString(undefined, { weekday: 'short' }), n: rows.filter((r) => r.created_at.slice(0, 10) === key).length };
        });
        const rc: Record<string, number> = {};
        rows.forEach((r) => { let h = 'Direct'; try { if (r.referrer) h = new URL(r.referrer).host; } catch { /* ignore */ } rc[h] = (rc[h] || 0) + 1; });
        setStats({
          total: rows.length,
          week: rows.filter((r) => now - new Date(r.created_at).getTime() < 7 * 864e5).length,
          today: days[6].n,
          days,
          refs: Object.entries(rc).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([r, n]) => ({ r, n })),
        });
      }
    }
    if (m === 'versions') {
      setVersions(null);
      if (!sessionId) return setVersions([]);
      const rows = await loadMessages(sessionId);
      const v = rows.filter((r) => r.role === 'assistant' && r.files && r.files.length).map((r, i) => ({ id: r.id, title: r.title || 'Version', files: r.files as ProjectFile[], n: i + 1 })).reverse();
      setVersions(v);
    }
  }

  async function saveGeneral() {
    if (!sessionId) return notify('Open a project first.');
    const t = gName.trim().slice(0, 60);
    if (!t) return notify('Project name can’t be empty.');
    localStorage.setItem(`sb_desc:${sidKey}`, gDesc);
    const { error } = await supabase.from('chat_sessions').update({ title: t }).eq('id', sessionId);
    if (error) return notify(error.message);
    notify('Project saved. Refresh the list to see the new name.');
  }

  async function deleteThis() {
    if (!sessionId) return;
    const { error } = await supabase.from('chat_sessions').delete().eq('id', sessionId);
    if (error) return notify(error.message);
    window.location.reload();
  }

  function saveSeo() {
    localStorage.setItem(`sb_seo:${sidKey}`, JSON.stringify(seo));
    notify('Saved. Publish your site to apply it.');
  }

  async function addSecret() {
    const k = sk.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*$/.test(k)) return notify('Use a KEY like STRIPE_SECRET_KEY.');
    if (!sv.trim()) return notify('Enter the secret value.');
    const { error } = await supabase.from('connector_credentials').upsert({ user_id: userId, connector_id: secretId(k), secrets: { value: sv.trim() }, updated_at: new Date().toISOString() });
    if (error) return notify(error.message);
    setSk(''); setSv('');
    loadSecrets();
  }

  async function delSecret(k: string) {
    const { error } = await supabase.from('connector_credentials').delete().eq('user_id', userId).eq('connector_id', secretId(k));
    if (error) return notify(error.message);
    setSecrets((s) => s.filter((x) => x.key !== k));
  }

  async function push() {
    if (!project) return notify('Build something first.');
    const r = repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(r)) return notify('Repository must look like owner/repo.');
    if (!token.trim()) return notify('Enter your GitHub token.');
    setBusy('gh');
    setGhMsg('');
    try {
      const headers = { Authorization: `Bearer ${token.trim()}`, Accept: 'application/vnd.github+json' };
      let n = 0;
      for (const f of project.files) {
        const url = `https://api.github.com/repos/${r}/contents/${f.name.split('/').map(encodeURIComponent).join('/')}`;
        const cur = await fetch(url, { headers });
        if (cur.status === 404 && n === 0 && !(await fetch(`https://api.github.com/repos/${r}`, { headers })).ok) throw new Error('Repository not found or token has no access.');
        const sha = cur.ok ? (await cur.json()).sha : undefined;
        const body = { message: `Update ${f.name} from SwiftBuild AI`, content: btoa(unescape(encodeURIComponent(f.content))), sha };
        const put = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
        if (!put.ok) throw new Error((await put.json().catch(() => ({}))).message || `GitHub error ${put.status}`);
        n++;
      }
      localStorage.setItem('sb_gh_repo', r);
      setGhMsg(`Pushed ${n} file${n === 1 ? '' : 's'} to ${r}.`);
      notify('Pushed to GitHub.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Push failed.');
    } finally { setBusy(''); }
  }

  const titleSlug = (project?.title || 'my-project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'my-project';
  const link = slug ? siteUrl(slug) : `https://${titleSlug}.swiftbuild.app`;
  const item = 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-raised active:scale-[0.98]';

  return (
    <div ref={ref} className="relative flex items-center gap-1.5">
      <button
        onClick={openPublish}
        disabled={!project}
        aria-expanded={pop}
        title={project ? 'Publish this project' : 'Build something first'}
        className="flex h-9 items-center gap-2 rounded-full bg-volt px-4 text-sm font-semibold text-volt-ink transition hover:shadow-glow active:scale-95 disabled:cursor-not-allowed disabled:bg-raised disabled:text-faint disabled:shadow-none"
      >
        <Rocket size={15} /> Publish
      </button>
      <button
        onClick={() => { setPop(false); setMore((m) => !m); }}
        aria-haspopup="menu"
        aria-expanded={more}
        aria-label="More options"
        className="grid h-9 w-9 place-items-center rounded-full border border-line bg-raised transition hover:text-volt active:scale-95"
      >
        <MoreHorizontal size={17} />
      </button>

      {more && (
        <div role="menu" className={`fixed right-3 top-16 z-50 max-h-[75dvh] w-56 animate-pop overflow-y-auto rounded-2xl border border-line-strong bg-panel p-1.5 shadow-2xl shadow-black/60`}>
          {MENU.map((g, gi) => (
            <div key={g.group} className={gi ? 'mt-1 border-t border-line pt-1' : ''}>
              <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">{g.group}</p>
              {g.items.map((it) => (
                <button key={it.id} role="menuitem" className={item} onClick={() => openModal(it.id)}><it.icon size={16} className="text-volt" /> {it.label}</button>
              ))}
            </div>
          ))}
        </div>
      )}

      {pop && (
        <div className={`fixed inset-x-3 top-14 z-50 mx-auto max-h-[82dvh] w-[calc(100vw-24px)] max-w-md animate-pop space-y-4 overflow-y-auto rounded-2xl border border-line-strong bg-panel p-4 text-sm shadow-2xl shadow-black/60`}>
          <section>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">Live site link</p>
            {link ? (
              <div className="flex items-center gap-1.5 rounded-xl border border-line bg-bg p-1.5">
                <span className="min-w-0 flex-1 truncate px-1.5 font-mono text-xs">{link}</span>
                <button onClick={() => copy(link)} className={ghost}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied!' : 'Copy'}</button>
                <a href={link} target="_blank" rel="noreferrer" className={ghost}>Open ↗</a>
              </div>
            ) : null}
          </section>

          <section>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">Update your site</p>
            <button onClick={update} disabled={busy !== ''} className={`${primary} w-full`}>
              {busy === 'update' ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />} {slug ? 'Publish changes' : 'Publish site'}
            </button>
          </section>

          <section>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">Client handoff</p>
            <button onClick={shareClient} className={`${ghost} w-full justify-center py-2.5`}>
              {shared ? <Check size={14} /> : <Share2 size={14} />} Share Client Preview Link
            </button>
            <p className="mt-1 text-xs text-muted">A clean view with no editing menus or credits.</p>
          </section>

          <section>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">Business Quick-Connect</p>
            <input value={bizPhone} onChange={(e) => setBizPhone(e.target.value)} placeholder="+1 555 123 4567 / +44… / +255…" inputMode="tel" className={field} />
            <div className="mt-2">
              <input value={curQ} onChange={(e) => setCurQ(e.target.value)} placeholder="Search currency (USD, euro, shilling…)" className={field} />
              <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-line bg-bg">
                {allCurrencies().filter((c) => { const q = curQ.trim().toLowerCase(); return !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q); }).slice(0, 60).map((c) => (
                  <button key={c.code} type="button" onClick={() => setBizCur(c.code)} className={`block w-full px-2 py-1 text-left text-xs hover:bg-white/5 ${bizCur === c.code ? 'text-volt' : ''}`}>
                    {currencyLabel(c)}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">Selected: {bizCur}</p>
            </div>
            <button onClick={saveBiz} disabled={busy !== ''} className={`${primary} mt-2 w-full`}>
              {busy === 'biz' ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />} Save WhatsApp ordering
            </button>
            <p className="mt-1 text-xs text-muted">Order / Book Now buttons open WhatsApp with the item name and price.</p>
          </section>

          <section>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">Custom domain</p>
            <div className="flex gap-2">
              <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="yourdomain.com" className={field} />
              <button onClick={connectDomain} disabled={busy !== ''} className={primary}>
                {busy === 'domain' ? <Loader2 size={14} className="animate-spin" /> : 'Connect'}
              </button>
            </div>
            {domainSaved && (
              <div className="mt-2 space-y-1 rounded-xl border border-line bg-bg p-2.5 font-mono text-xs">
                <p className="font-sans text-muted">Add this DNS record for {domainSaved}:</p>
                <p><span className="text-faint">Type</span> CNAME</p>
                <p className="break-all"><span className="text-faint">Value</span> {window.location.host}</p>
              </div>
            )}
            <p className="mt-3 text-xs text-muted">Don’t have a domain? Buy one here:</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {REGISTRARS.map((g) => (
                <a key={g.name} href={g.url} target="_blank" rel="noreferrer" className={ghost}>{g.name} <ExternalLink size={11} /></a>
              ))}
            </div>
          </section>
        </div>
      )}

      {modal === 'secrets' && (
        <FullPage title="Secrets" subtitle="Store API keys for your app. They're encrypted and hidden after saving." onClose={() => { setModal(null); setAdding(false); }}>
          <div className="space-y-4 text-sm">
            {!adding && (
              <button onClick={() => { setSk(''); setSv(''); setAdding(true); }} className={primary}><Plus size={15} /> Add secret</button>
            )}
            {adding && (
              <div className="space-y-2 rounded-xl border border-line-strong bg-panel p-4">
                <label className="text-xs font-medium text-muted">KEY</label>
                <input value={sk} onChange={(e) => setSk(e.target.value)} placeholder="STRIPE_SECRET_KEY" className={`${field} w-full font-mono`} />
                <label className="text-xs font-medium text-muted">VALUE</label>
                <input value={sv} onChange={(e) => setSv(e.target.value)} type="password" placeholder="Paste your API key" className={`${field} w-full font-mono`} />
                <div className="flex gap-2 pt-1">
                  <button onClick={async () => { await addSecret(); setAdding(false); }} className={primary}>Save secret</button>
                  <button onClick={() => setAdding(false)} className={ghost}>Cancel</button>
                </div>
              </div>
            )}
            <ul className="space-y-2">
              {secrets.length === 0 && <li className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-muted">No secrets yet.</li>}
              {secrets.map((s) => (
                <li key={s.key} className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-raised text-volt"><KeyRound size={16} /></span>
                  <p className="min-w-0 flex-1 truncate font-mono text-sm font-semibold">{s.key}</p>
                  <span className="hidden rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-400 sm:inline">SYNCED</span>
                  <button onClick={() => { setSk(s.key); setSv(''); setAdding(true); window.scrollTo(0, 0); }} className={ghost}>Update</button>
                  <button onClick={() => delSecret(s.key)} aria-label="Delete secret" className="rounded-lg p-2 text-muted hover:bg-raised hover:text-red-400"><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          </div>
        </FullPage>
      )}

      {modal === 'github' && (
        <FullPage title="GitHub" subtitle="Sync your project source code directly to your GitHub repository." onClose={() => setModal(null)}>
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-panel p-4">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-raised text-volt"><Github size={20} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">Repository</p>
                <p className="truncate font-mono text-sm font-semibold">{repo.trim() || 'Not connected'}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${repo.trim() ? 'bg-emerald-500/15 text-emerald-400' : 'bg-raised text-muted'}`}>{repo.trim() ? 'READY' : 'NOT SET'}</span>
            </div>
            <div className="space-y-2 rounded-xl border border-line bg-panel p-4">
              <label className="text-xs font-medium text-muted">Repository name</label>
              <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="yourname/my-app" className={`${field} w-full`} />
              <label className="text-xs font-medium text-muted">GitHub token</label>
              <input value={token} onChange={(e) => setToken(e.target.value)} type="password" placeholder="Personal access token with repo access" className={`${field} w-full`} />
              <p className="text-xs text-muted">The token is used for this push only and is never stored.</p>
            </div>
            <button onClick={push} disabled={busy === 'gh'} className={`${primary} w-full py-3`}>
              {busy === 'gh' ? <Loader2 size={15} className="animate-spin" /> : <Github size={15} />} Push to GitHub
            </button>
            {ghMsg && <p className="text-xs text-volt">{ghMsg}</p>}
          </div>
        </FullPage>
      )}

      {modal === 'connectors' && <ConnectorsPage account={account} onClose={() => setModal(null)} />}

      {modal === 'general' && (
        <FullPage title="General" subtitle="Rename your project, add a description, or delete it." onClose={() => setModal(null)}>
          <div className="space-y-4 text-sm">
            <div className="space-y-2 rounded-xl border border-line bg-panel p-4">
              <label className="text-xs font-medium text-muted">Project name</label>
              <input value={gName} onChange={(e) => setGName(e.target.value)} maxLength={60} className={`${field} w-full`} />
              <label className="text-xs font-medium text-muted">Description</label>
              <textarea value={gDesc} onChange={(e) => setGDesc(e.target.value)} rows={3} placeholder="What is this project about?" className={`${field} w-full resize-none`} />
              <button onClick={saveGeneral} className={`${primary} mt-1`}>Save changes</button>
            </div>
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
              <p className="font-semibold text-red-400">Danger zone</p>
              <p className="mt-1 text-xs text-muted">Deleting removes this project and its chat history for good.</p>
              {!confirmDel ? (
                <button onClick={() => setConfirmDel(true)} className="mt-3 flex items-center gap-1.5 rounded-lg border border-red-500/40 px-3 py-2 text-xs font-medium text-red-400 transition hover:bg-red-500/10"><Trash2 size={13} /> Delete project</button>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button onClick={deleteThis} className="rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white">Yes, delete</button>
                  <button onClick={() => setConfirmDel(false)} className={ghost}>Cancel</button>
                </div>
              )}
            </div>
          </div>
        </FullPage>
      )}

      {modal === 'domains' && (
        <FullPage title="Domains" subtitle="Connect your own domain to your published site." onClose={() => setModal(null)}>
          <div className="space-y-4 text-sm">
            <div className="space-y-2 rounded-xl border border-line bg-panel p-4">
              <label className="text-xs font-medium text-muted">Custom domain</label>
              <div className="flex gap-2">
                <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="yourdomain.com" className={field} />
                <button onClick={connectDomain} disabled={busy !== ''} className={primary}>{busy === 'domain' ? <Loader2 size={14} className="animate-spin" /> : 'Connect'}</button>
              </div>
              {domainSaved && (
                <div className="space-y-1 rounded-xl border border-line bg-bg p-3 font-mono text-xs">
                  <p className="font-sans text-muted">Add this DNS record for {domainSaved}:</p>
                  <p><span className="text-faint">Type</span> CNAME</p>
                  <p className="break-all"><span className="text-faint">Value</span> {window.location.host}</p>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-line bg-panel p-4">
              <p className="text-xs text-muted">Don’t have a domain? Buy one here:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {REGISTRARS.map((g) => (<a key={g.name} href={g.url} target="_blank" rel="noreferrer" className={ghost}>{g.name} <ExternalLink size={11} /></a>))}
              </div>
            </div>
          </div>
        </FullPage>
      )}

      {modal === 'versions' && (
        <FullPage title="Versions" subtitle="Every build of this project. Restore any earlier version." onClose={() => setModal(null)}>
          <ul className="space-y-2 text-sm">
            {versions === null && <li className="flex justify-center p-8 text-volt"><Loader2 className="animate-spin" /></li>}
            {versions?.length === 0 && <li className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-muted">No versions yet. Build something first.</li>}
            {versions?.map((v, i) => (
              <li key={v.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-raised text-volt"><History size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{v.title}</p>
                  <p className="text-xs text-muted">Version {v.n} · {v.files.length} file{v.files.length === 1 ? '' : 's'}</p>
                </div>
                {i === 0 ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-400">CURRENT</span>
                ) : (
                  <button onClick={() => { onRestore?.(v.files, v.title); setModal(null); notify(`Restored version ${v.n}.`); }} className={ghost}><RotateCcw size={13} /> Restore</button>
                )}
              </li>
            ))}
          </ul>
        </FullPage>
      )}

      {modal && (TOOL_PAGES as string[]).includes(modal) && (
        <ProjectTools
          page={modal as ToolPage}
          account={account}
          project={project}
          link={link}
          sessionId={sessionId}
          onClose={() => setModal(null)}
          onApply={(files, title) => onRestore?.(files, title)}
          onBuy={() => { setModal(null); onBuy(); }}
          notify={notify}
        />
      )}

      {modal === 'seo' && (
        <FullPage title="SEO & Branding" subtitle="Set the title, description and favicon of your published site." onClose={() => setModal(null)}>
          <div className="space-y-4 text-sm">
            <div className="space-y-2 rounded-xl border border-line bg-panel p-4">
              <label className="text-xs font-medium text-muted">Site title</label>
              <input value={seo.title} onChange={(e) => setSeo({ ...seo, title: e.target.value })} maxLength={70} className={`${field} w-full`} />
              <label className="text-xs font-medium text-muted">Description</label>
              <textarea value={seo.description} onChange={(e) => setSeo({ ...seo, description: e.target.value })} maxLength={160} rows={3} className={`${field} w-full resize-none`} />
              <label className="text-xs font-medium text-muted">Favicon URL</label>
              <input value={seo.favicon} onChange={(e) => setSeo({ ...seo, favicon: e.target.value })} placeholder="https://…/favicon.png" className={`${field} w-full`} />
            </div>
            <div className="rounded-xl border border-line bg-panel p-4">
              <p className="mb-2 text-xs font-medium text-muted">Search preview</p>
              <div className="flex items-center gap-2 text-xs">
                {seo.favicon ? <img src={seo.favicon} alt="" className="h-4 w-4 rounded" /> : <Globe size={14} className="text-faint" />}
                <span className="truncate text-muted">{link || 'yoursite.com'}</span>
              </div>
              <p className="mt-1 truncate text-base text-blue-400">{seo.title || 'Your site title'}</p>
              <p className="line-clamp-2 text-xs text-muted">{seo.description || 'Your description appears here.'}</p>
            </div>
            <button onClick={saveSeo} className={`${primary} w-full py-3`}>Save SEO & branding</button>
          </div>
        </FullPage>
      )}

      {modal === 'analytics' && (
        <FullPage title="Analytics" subtitle="Visitors to your published site." onClose={() => setModal(null)}>
          {stats === null ? (
            <div className="flex justify-center p-8 text-volt"><Loader2 className="animate-spin" /></div>
          ) : !slug ? (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-muted">Publish your site to start collecting visitor stats.</p>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-3">
                {[['Today', stats.today], ['Last 7 days', stats.week], ['All time', stats.total]].map(([l, n]) => (
                  <div key={l as string} className="rounded-xl border border-line bg-panel p-4">
                    <p className="text-xs text-muted">{l}</p>
                    <p className="mt-1 text-2xl font-semibold">{n}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-line bg-panel p-4">
                <p className="mb-3 text-xs font-medium text-muted">Visits, last 7 days</p>
                <div className="flex h-32 items-end gap-2">
                  {stats.days.map((d) => {
                    const max = Math.max(1, ...stats.days.map((x) => x.n));
                    return (
                      <div key={d.d} className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-[10px] text-muted">{d.n}</span>
                        <div className="w-full rounded-t bg-volt/80" style={{ height: `${Math.max(4, (d.n / max) * 90)}px` }} />
                        <span className="text-[10px] text-faint">{d.d}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-line bg-panel p-4">
                <p className="mb-2 text-xs font-medium text-muted">Top sources</p>
                {stats.refs.length === 0 ? <p className="text-xs text-muted">No visits yet.</p> : stats.refs.map((r) => (
                  <div key={r.r} className="flex justify-between py-1 text-xs"><span className="truncate">{r.r}</span><span className="text-muted">{r.n}</span></div>
                ))}
              </div>
            </div>
          )}
        </FullPage>
      )}
    </div>
  );
}
