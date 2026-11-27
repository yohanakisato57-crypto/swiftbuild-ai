import { useEffect, useMemo, useRef, useState } from 'react';
import { pageHtml, coverPage, liveHtml, hasLive, LIVE_H, type TplSpec } from '../lib/mockup';
import { ArrowLeft, Check, Copy, Eye, Lock, Search, Users } from 'lucide-react';
import { supabase, type Account } from '../lib/auth';
import type { TemplateItem } from './Sidebar';

interface Props {
  account: Account;
  onClose: () => void;
  onPreview: (t: TemplateItem) => void;
  onBuy: () => void;
}

type Tpl = Omit<TemplateItem, 'prompt'> & { prompt?: string };

/** Renders a mockup page inside an iframe scaled to fit its container width. */
function LiveCard({ spec }: { spec: TplSpec }) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0.3);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setK(el.clientWidth / 1000));
    ro.observe(el);
    setK(el.clientWidth / 1000);
    return () => ro.disconnect();
  }, []);
  const dist = 1500 * k;
  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden bg-bg">
      <div
        className="absolute left-0 top-0 transition-transform duration-[6000ms] ease-linear group-hover:translate-y-[var(--d)] group-active:translate-y-[var(--d)]"
        style={{ ['--d' as string]: `-${dist}px` }}
      >
        <iframe
          title={spec.name}
          srcDoc={liveHtml(spec, true)}
          loading="lazy"
          sandbox=""
          tabIndex={-1}
          className="pointer-events-none border-0"
          style={{ width: 1000, height: LIVE_H, transform: `scale(${k})`, transformOrigin: '0 0' }}
        />
      </div>
    </div>
  );
}

function ScaledFrame({ spec, page, w = 1000, h = 640, interactive = false, live = false }: { spec: TplSpec; page: number; w?: number; h?: number; interactive?: boolean; live?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0.3);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setK(el.clientWidth / w));
    ro.observe(el);
    setK(el.clientWidth / w);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div ref={ref} className="relative w-full overflow-hidden bg-bg" style={{ height: h * k }}>
      <iframe
        title={spec.name + ' ' + (spec.pages[page] || '')}
        srcDoc={live ? liveHtml(spec) : pageHtml(spec, page)}
        loading="lazy"
        sandbox=""
        tabIndex={-1}
        style={{ width: w, height: h, transform: `scale(${k})`, transformOrigin: '0 0', border: 0, pointerEvents: interactive ? 'auto' : 'none' }}
      />
    </div>
  );
}

export default function TemplatesPage({ account, onClose, onPreview, onBuy }: Props) {
  const [items, setItems] = useState<Tpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [premium, setPremium] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [open, setOpen] = useState<Tpl | null>(null);
  const [copied, setCopied] = useState('');
  const [bump, setBump] = useState<Record<string, number>>({});
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');

  useEffect(() => {
    let alive = true;
    (async () => {
      const [tpl, pur] = await Promise.all([
        supabase.from('templates').select('id,name,category,thumbnail_url,base_users,spec').order('sort_order'),
        supabase.rpc('has_premium_purchase', { p_user: account.id }),
      ]);
      if (!alive) return;
      if (tpl.error) setError('Could not load templates. Try again.');
      else setItems((tpl.data as Tpl[]) || []);
      setPremium(Boolean(pur.data));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [account.id]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (paywall) setPaywall(false);
      else if (open) setOpen(null);
      else onClose();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [paywall, open, onClose]);

  const [page, setPage] = useState(0);
  useEffect(() => setPage(open?.spec ? coverPage(open.spec) : 0), [open]);
  const cats = useMemo(() => {
    const present = new Set(items.map((i) => i.category));
    const order = ['Lead Gen', 'E-commerce', 'SaaS', 'Games'];
    return ['All', ...order.filter((c) => present.has(c)), ...Array.from(present).filter((c) => !order.includes(c))];
  }, [items]);
  const shown = items.filter(
    (i) => (cat === 'All' || i.category === cat) && (i.name + i.category).toLowerCase().includes(q.toLowerCase()),
  );
  const users = (t: Tpl) => (t.base_users + (bump[t.id] || 0)).toLocaleString();

  // Gated on the server: use_template refuses anyone without a completed Pesapal purchase.
  async function use(t: Tpl, action: 'copy' | 'use') {
    if (!premium) return setPaywall(true);
    const { data, error: err } = await supabase.rpc('use_template', { p_template: t.id });
    if (err || !data) return setPaywall(true);
    try {
      await navigator.clipboard.writeText(String(data));
    } catch {
      /* clipboard may be blocked */
    }
    setBump((b) => ({ ...b, [t.id]: (b[t.id] || 0) + 1 }));
    setCopied(t.id + action);
    setTimeout(() => setCopied(''), 1800);
  }

  const preview = (t: Tpl) => onPreview({ ...t, prompt: '' });

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg text-fg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        <button onClick={open ? () => setOpen(null) : onClose} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted transition hover:bg-raised hover:text-fg">
          <ArrowLeft size={16} /> {open ? 'All templates' : 'Back'}
        </button>
        <h1 className="text-sm font-semibold">Templates</h1>
        {!open && (
          <div className="relative ml-auto w-full max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search templates"
              className="w-full rounded-lg border border-line bg-panel py-1.5 pl-8 pr-3 text-sm outline-none transition focus:border-volt/60"
            />
          </div>
        )}
      </header>

      {!open && (
        <>
          <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-line px-4 py-2.5">
            {cats.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs transition ${
                  cat === c ? 'border-volt/50 bg-volt/10 text-volt' : 'border-line text-muted hover:text-fg'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {loading && <p className="py-10 text-center text-sm text-faint">Loading templates…</p>}
            {error && <p className="py-10 text-center text-sm text-danger">{error}</p>}
            {!loading && !error && shown.length === 0 && <p className="py-10 text-center text-sm text-faint">No templates match.</p>}
            <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map((t) => (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpen(t)}
                  onKeyDown={(e) => e.key === 'Enter' && setOpen(t)}
                  className="group cursor-pointer overflow-hidden rounded-xl border border-line bg-panel text-left transition duration-300 hover:-translate-y-0.5 hover:border-volt/50 hover:shadow-glow"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-raised">
                    {t.spec && hasLive(t.spec) ? <LiveCard spec={t.spec} /> : t.spec ? <ScaledFrame spec={t.spec} page={coverPage(t.spec)} /> : <img src={t.thumbnail_url} alt={t.name} loading="lazy" className="h-full w-full object-cover" />}
                    <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md bg-black/55 text-volt">
                      <Lock size={12} />
                    </span>
                    <div className="absolute inset-x-0 bottom-0 flex gap-2 bg-gradient-to-t from-black/80 to-transparent p-2 pt-8 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
                      <span className="flex flex-1 items-center justify-center gap-1 rounded-md border border-white/25 bg-black/50 py-1.5 text-xs font-medium text-white">
                        <Eye size={12} /> Live Preview
                      </span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          use(t, 'use');
                        }}
                        className="flex flex-1 items-center justify-center gap-1 rounded-md bg-volt py-1.5 text-xs font-semibold text-volt-ink"
                      >
                        {copied === t.id + 'use' ? <Check size={12} /> : <Lock size={12} />} Use Template
                      </span>
                    </div>
                  </div>
                  <div className="p-3">
                    <h3 className="truncate text-sm font-semibold">{t.name}</h3>
                    <div className="mt-1.5 flex items-center justify-between text-xs">
                      <span className="text-faint">{t.category}</span>
                      <span className="flex items-center gap-1 text-volt">
                        <Users size={12} /> {users(t)} users
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {open && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid max-w-[1400px] gap-6 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="overflow-hidden rounded-xl border border-line bg-panel">
              {open.spec ? (
                <>
                  <div className="flex items-center gap-1 overflow-x-auto border-b border-line bg-raised p-2">
                    {hasLive(open.spec) && <span className="px-2 text-xs text-muted">Live site · scroll and tap the sections</span>}
                    {!hasLive(open.spec) && open.spec.pages.map((p, i) => (
                      <button
                        key={p}
                        onClick={() => setPage(i)}
                        className={`shrink-0 rounded-md px-3 py-1 text-xs transition ${page === i ? 'bg-volt text-volt-ink font-semibold' : 'text-muted hover:text-fg'}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <ScaledFrame spec={open.spec} page={page} w={1100} h={720} live={hasLive(open.spec)} interactive={hasLive(open.spec)} />
                </>
              ) : (
                <img src={open.thumbnail_url} alt={open.name} className="aspect-[16/10] w-full object-cover" />
              )}
            </div>
            <div className="flex flex-col">
              <span className="w-fit rounded-full border border-volt/35 px-2.5 py-0.5 text-[11px] uppercase tracking-wider text-volt">{open.category}</span>
              <h2 className="mt-3 text-2xl font-semibold leading-tight">{open.name}</h2>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-volt">
                <Users size={14} /> Used by {users(open)} users
              </p>
              <div className="mt-4 rounded-xl border border-line bg-panel p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs text-faint">
                  <Lock size={12} /> Prompt
                </p>
                <p className="select-none font-mono text-xs leading-relaxed text-muted blur-[3px]">
                  Unlock this premium template to reveal the exact prompt that generates this design, page for page.
                </p>
                {open.spec && (
                  <p className="mt-2 text-xs text-faint">
                    Pages: {open.spec.pages.join(', ')} · Features: {open.spec.features.join(', ')}
                  </p>
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => use(open, 'copy')}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-line-strong py-2 text-sm font-medium transition hover:border-volt/50 hover:text-volt active:scale-[0.98]"
                >
                  {copied === open.id + 'copy' ? <Check size={14} className="text-volt" /> : premium ? <Copy size={14} /> : <Lock size={14} />}
                  {copied === open.id + 'copy' ? 'Copied' : 'Copy Prompt'}
                </button>
                <button
                  onClick={() => use(open, 'use')}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-volt py-2 text-sm font-semibold text-volt-ink transition hover:brightness-110 active:scale-[0.98]"
                >
                  {premium ? <Check size={14} /> : <Lock size={14} />}
                  {copied === open.id + 'use' ? 'Prompt copied' : 'Use Template'}
                </button>
              </div>
              <button
                onClick={() => preview(open)}
                className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-sm text-muted transition hover:text-fg"
              >
                <Eye size={14} /> Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {paywall && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setPaywall(false)}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="w-full max-w-xs animate-pop rounded-2xl border border-line-strong bg-raised p-5 shadow-xl">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-volt/15 text-volt">
              <Lock size={18} />
            </div>
            <h3 className="text-base font-semibold">Unlock Premium Template</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">Buy a Premium package via Pesapal to use this template.</p>
            <p className="mt-2 text-xs text-faint">Trial credits don't unlock templates. A Premium purchase is required.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setPaywall(false)} className="flex-1 rounded-lg border border-line-strong py-2 text-sm text-muted transition hover:text-fg">
                Not now
              </button>
              <button
                onClick={() => {
                  setPaywall(false);
                  onBuy();
                }}
                className="flex-1 rounded-lg bg-volt py-2 text-sm font-semibold text-volt-ink transition hover:brightness-110 active:scale-[0.98]"
              >
                Buy Premium
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
