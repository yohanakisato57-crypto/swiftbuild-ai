import { useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Copy, FolderOpen, Gift, LayoutTemplate, LogOut, Plug, Settings, Sparkles, Trash2, X, Zap } from 'lucide-react';
import { type Account, loadReferralStats } from '../lib/auth';
import type { Project } from '../lib/generator';

interface Props {
  open: boolean;
  account: Account;
  projects: Project[];
  onClose: () => void;
  onOpenProject: (i: number) => void;
  onDeleteProject?: (p: Project) => void;
  onTemplates: () => void;
  onConnectors: () => void;
  onSettings: () => void;
  onBuy: () => void;
  onSignOut: () => void;
}

type View = 'main' | 'connectors';

export interface TemplateItem {
  id: string;
  name: string;
  category: string;
  thumbnail_url: string;
  prompt: string;
  base_users: number;
  spec?: import('../lib/mockup').TplSpec;
}

export default function Sidebar({ open, account, projects, onClose, onOpenProject, onDeleteProject, onTemplates, onConnectors, onSettings, onBuy, onSignOut }: Props) {
  const [view, setView] = useState<View>('main');
  const [peak, setPeak] = useState(() => Math.max(10, Number(localStorage.getItem('sb_peak_' + account.email)) || 0));

  // The bar fills relative to the highest balance this account has held.
  useEffect(() => {
    if (account.credits > peak) {
      setPeak(account.credits);
      localStorage.setItem('sb_peak_' + account.email, String(account.credits));
    }
  }, [account.credits, account.email, peak]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setView('main');
  }, [open]);

  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState({ friends: 0, credits: 0 });
  useEffect(() => {
    if (open) loadReferralStats().then(setStats).catch(() => undefined);
  }, [open, account.credits]);

  const copyInvite = async () => {
    const link = window.location.origin + '/signup?ref=' + account.id;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const t = document.createElement('textarea');
      t.value = link;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const shareInvite = async () => {
    const url = window.location.origin + '/signup?ref=' + account.id;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'SwiftBuild AI',
          text: 'Build apps with AI on SwiftBuild AI. Join with my invite link:',
          url,
        });
      } catch {
        /* cancelled */
      }
    } else {
      await copyInvite();
    }
  };

  const pct = Math.max(0, Math.min(100, Math.round((account.credits / peak) * 100)));
  const low = pct <= 20;

  const navBtn =
    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-muted transition hover:bg-raised hover:text-fg';

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        aria-label="Navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-80 max-w-[88vw] flex-col border-r border-line bg-panel shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
          {view === 'main' ? (
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-volt text-volt-ink">
                <Zap size={15} strokeWidth={2.5} />
              </span>
              SwiftBuild AI
            </span>
          ) : (
            <button onClick={() => setView('main')} className="flex items-center gap-2 text-sm font-semibold text-fg transition hover:text-volt">
              <ArrowLeft size={16} />
              Connector API
            </button>
          )}
          <button onClick={onClose} aria-label="Close menu" className="rounded-lg p-1.5 text-muted transition hover:bg-raised hover:text-fg active:scale-90">
            <X size={16} />
          </button>
        </div>

        {view === 'main' && (
          <>
            <div className="border-b border-line p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-volt to-violet-400 text-sm font-semibold text-volt-ink">
                  {account.email.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{account.email.split('@')[0]}</p>
                  <p className="truncate text-xs text-faint">{account.email}</p>
                </div>
              </div>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto p-3">
              <button
                onClick={() => {
                  onClose();
                  onConnectors();
                }}
                className={navBtn}
              >
                <Plug size={15} className="text-volt" />
                <span className="flex-1">Connector API</span>
                <ChevronRight size={14} className="text-faint" />
              </button>
              <button
                onClick={() => {
                  onClose();
                  onTemplates();
                }}
                className={navBtn}
              >
                <LayoutTemplate size={15} className="text-volt" />
                <span className="flex-1">Templates</span>
                <ChevronRight size={14} className="text-faint" />
              </button>

              <p className="px-2 pb-2 pt-4 text-[11px] font-medium uppercase tracking-wider text-faint">My Projects</p>
              {projects.length === 0 ? (
                <p className="px-2 text-sm text-muted">No projects yet.</p>
              ) : (
                <ul className="space-y-1">
                  {projects.map((p, i) => (
                    <li key={String(p.id ?? p.title + i)} className="group flex items-center gap-1">
                      <button
                        onClick={() => {
                          onOpenProject(i);
                          onClose();
                        }}
                        className={`${navBtn} min-w-0 flex-1`}
                      >
                        <FolderOpen size={15} className="shrink-0 text-volt" />
                        <span className="truncate">{p.title}</span>
                      </button>
                      <button
                        onClick={() => onDeleteProject?.(p)}
                        aria-label={`Delete ${p.title}`}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-faint transition hover:bg-red-500/15 hover:text-red-400 active:scale-90"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </nav>

            <div className="border-t border-line p-3">
              <div className="mb-3 rounded-xl border border-line bg-gradient-to-br from-raised to-panel p-3">
                <div className="flex items-start gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-volt/15 text-volt">
                    <Gift size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold leading-tight">Invite a Friend &amp; Earn! 🎁</p>
                    <p className="mt-1 text-[11px] leading-snug text-muted">
                      Get <span className="font-semibold text-volt">60 free credits</span> when your friend signs up and purchases their first package.
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                  <button
                    onClick={copyInvite}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-bg px-1 py-1.5 text-[11px] font-medium text-fg transition hover:border-volt hover:text-volt active:scale-[0.98]"
                  >
                    {copied ? <Check size={13} className="shrink-0 text-volt" /> : <Copy size={13} className="shrink-0" />}
                    <span className="truncate">{copied ? 'Link Copied!' : 'Copy Invite Link'}</span>
                  </button>
                  <button
                    onClick={shareInvite}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-volt/40 bg-volt/10 px-1 py-1.5 text-[11px] font-medium text-volt transition hover:bg-volt/20 active:scale-[0.98]"
                  >
                    <span className="truncate">Share Link 🚀</span>
                  </button>
                </div>
                {stats.friends > 0 && (
                  <p className="mt-2 text-center text-[11px] text-volt">
                    {stats.friends} friends purchased · +{stats.credits} credits earned
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-line bg-raised/60 p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted">Credits Left</span>
                  <span className={`text-sm font-semibold tabular-nums ${low ? 'text-danger' : 'text-volt'}`}>{account.credits.toLocaleString()}</span>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line"
                >
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${low ? 'bg-danger' : 'bg-gradient-to-r from-volt to-emerald-300'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <button
                  onClick={() => {
                    onClose();
                    onBuy();
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-volt py-1.5 text-xs font-semibold text-volt-ink transition hover:shadow-glow active:scale-[0.98]"
                >
                  <Sparkles size={13} /> Buy credits
                </button>
              </div>
            </div>
          </>
        )}

        <div className="space-y-1 border-t border-line p-3">
          <button
            className={navBtn}
            onClick={() => {
              onClose();
              onSettings();
            }}
          >
            <Settings size={15} /> Settings
          </button>
          <button onClick={onSignOut} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-raised hover:text-danger">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
