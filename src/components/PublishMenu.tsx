import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, ExternalLink, Globe, Loader2, Rocket, X, Zap } from 'lucide-react';
import type { Project } from '../lib/generator';
import { currentPlan, deploySite, downloadZip, saveDomain, siteUrl } from '../lib/chat';

interface Props {
  userId: string;
  sessionId: string | null;
  project: Project | null;
  onBuy: () => void;
  notify: (m: string) => void;
}

type Dlg = null | { kind: 'live'; slug: string } | { kind: 'domain'; slug: string; domain: string } | { kind: 'upgrade' };

export default function PublishMenu({ userId, sessionId, project, onBuy, notify }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [dlg, setDlg] = useState<Dlg>(null);
  const [domain, setDomain] = useState('');
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const item = 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-raised active:scale-[0.98] disabled:opacity-50';

  async function live() {
    if (!project) return;
    setOpen(false);
    setBusy('live');
    try {
      const { slug } = await deploySite(userId, sessionId, project);
      setDlg({ kind: 'live', slug });
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not deploy.');
    } finally {
      setBusy('');
    }
  }

  async function zip() {
    if (!project) return;
    setOpen(false);
    setBusy('zip');
    try {
      await downloadZip(project);
      notify('Source code downloaded.');
    } catch {
      notify('Could not create the download.');
    } finally {
      setBusy('');
    }
  }

  async function connect() {
    if (!project) return;
    setOpen(false);
    setBusy('domain');
    try {
      const plan = await currentPlan();
      if (plan !== 'pro' && plan !== 'enterprise') {
        setDlg({ kind: 'upgrade' });
        return;
      }
      const { slug, domain: d } = await deploySite(userId, sessionId, project);
      setDomain(d || '');
      setDlg({ kind: 'domain', slug, domain: d || '' });
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not start.');
    } finally {
      setBusy('');
    }
  }

  async function saveDom(slug: string) {
    const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d)) return notify('Enter a valid domain, e.g. myapp.com');
    try {
      await saveDomain(slug, d);
      setDlg({ kind: 'domain', slug, domain: d });
      setDomain(d);
      notify('Domain saved. Add the DNS record below.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save the domain.');
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={!project || busy !== ''}
        aria-haspopup="menu"
        aria-expanded={open}
        title={project ? 'Publish this project' : 'Build something first'}
        className="flex h-9 items-center gap-2 rounded-full bg-volt px-4 text-sm font-semibold text-volt-ink transition hover:shadow-glow active:scale-95 disabled:cursor-not-allowed disabled:bg-raised disabled:text-faint disabled:shadow-none"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />} Publish
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 animate-pop rounded-2xl border border-line-strong bg-panel p-1.5 shadow-2xl shadow-black/60">
          <button role="menuitem" className={item} onClick={connect}><Globe size={16} className="text-volt" /> Connect Custom Domain</button>
          <button role="menuitem" className={item} onClick={live}><Zap size={16} className="text-volt" /> Deploy to Web Live</button>
          <button role="menuitem" className={item} onClick={zip}><Download size={16} className="text-volt" /> Download Source Code</button>
        </div>
      )}

      {dlg && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4" onClick={() => setDlg(null)}>
          <div role="dialog" onClick={(e) => e.stopPropagation()} className="w-full max-w-md animate-pop rounded-2xl border border-line-strong bg-panel p-5 text-fg shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold">
                {dlg.kind === 'live' ? 'Your site is live' : dlg.kind === 'domain' ? 'Connect a custom domain' : 'Custom domains need Pro'}
              </h3>
              <button onClick={() => setDlg(null)} aria-label="Close" className="rounded-lg p-1 text-muted hover:bg-raised hover:text-fg"><X size={16} /></button>
            </div>

            {dlg.kind === 'live' && (
              <div className="mt-3 space-y-3 text-sm">
                <p className="text-muted">Anyone with this link can open your project. Publish again to update it.</p>
                <div className="flex items-center gap-2 rounded-xl border border-line bg-bg p-2">
                  <span className="min-w-0 flex-1 truncate px-1 font-mono text-xs">{siteUrl(dlg.slug)}</span>
                  <button onClick={() => copy(siteUrl(dlg.slug))} className="grid h-8 w-8 place-items-center rounded-lg bg-raised hover:text-volt" aria-label="Copy link">
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <a href={siteUrl(dlg.slug)} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-volt py-2.5 font-semibold text-volt-ink transition hover:shadow-glow">
                  <ExternalLink size={15} /> Open live site
                </a>
              </div>
            )}

            {dlg.kind === 'domain' && (
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex gap-2">
                  <input
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="myapp.com"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 outline-none focus:border-volt/60"
                  />
                  <button onClick={() => saveDom(dlg.slug)} className="rounded-lg bg-volt px-4 font-semibold text-volt-ink active:scale-95">Save</button>
                </div>
                {dlg.domain && (
                  <div className="space-y-2 rounded-xl border border-line bg-bg p-3">
                    <p className="text-muted">At your domain registrar add this record:</p>
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
                      <span className="text-faint">Type</span><span>CNAME</span>
                      <span className="text-faint">Name</span><span>{dlg.domain.split('.').length > 2 ? dlg.domain.split('.')[0] : '@ / www'}</span>
                      <span className="text-faint">Value</span><span className="break-all">{window.location.host}</span>
                    </div>
                    <p className="text-xs text-faint">DNS changes can take up to 24 hours to apply.</p>
                  </div>
                )}
                <p className="text-xs text-faint">Your project is deployed at {siteUrl(dlg.slug)}</p>
              </div>
            )}

            {dlg.kind === 'upgrade' && (
              <div className="mt-3 space-y-3 text-sm">
                <p className="text-muted">Connecting your own domain is included in the Pro and Enterprise plans.</p>
                <button onClick={() => { setDlg(null); onBuy(); }} className="w-full rounded-xl bg-volt py-2.5 font-semibold text-volt-ink transition hover:shadow-glow active:scale-[0.98]">
                  See plans
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
