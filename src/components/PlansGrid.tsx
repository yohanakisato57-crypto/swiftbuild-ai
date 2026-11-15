import { useState } from 'react';
import { Check, Crown, Layers, Loader2, Rocket, Sparkles, Zap } from 'lucide-react';
import { api } from '../lib/auth';

interface Plan {
  key: string;
  packId: number | null;
  name: string;
  price: number;
  tag: string;
  icon: typeof Zap;
  features: string[];
  lead?: string;
  popular?: boolean;
  top?: boolean;
}

export const PLANS: Plan[] = [
  {
    key: 'free', packId: null, name: 'Free Tier', price: 0, tag: 'Try it out', icon: Zap,
    features: ['15 trial credits', '1 project', 'Standard AI'],
  },
  {
    key: 'lite', packId: 10, name: 'Starter Lite', price: 5, tag: 'Getting started', icon: Rocket,
    lead: 'Everything in Free, plus',
    features: ['40 credits every month', '3 projects', 'Basic features'],
  },
  {
    key: 'starter', packId: 11, name: 'Starter Plus', price: 15, tag: 'For side projects', icon: Layers,
    lead: 'Everything in Lite, plus',
    features: ['100 credits every month', '10 projects', 'All library templates'],
  },
  {
    key: 'pro', packId: 12, name: 'Pro Plan', price: 35, tag: 'Most popular', icon: Sparkles, popular: true,
    lead: 'Everything in Starter Plus, plus',
    features: ['350 credits every month', 'Unlimited projects', 'Full Connectors API access', 'Custom domains'],
  },
  {
    key: 'enterprise', packId: 13, name: 'Enterprise', price: 75, tag: 'For organisations', icon: Crown, top: true,
    lead: 'Everything in Pro, plus',
    features: [
      '1000+ monthly credits',
      'Dedicated GPT-6.1 Sol server',
      'SOC 2 security & compliance',
      'Team mode workspace',
    ],
  },
];

export const PACK_TO_PLAN: Record<number, string> = { 10: 'lite', 11: 'starter', 12: 'pro', 13: 'enterprise' };
/** Highest paid plan key from a list of credited pack ids ('free' if none). */
export function planFromPacks(ids: number[]): string {
  const top = Math.max(0, ...ids.filter((n) => n >= 10));
  return PACK_TO_PLAN[top] || 'free';
}

export default function PlansGrid({ currentKey }: { currentKey: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  function choose(p: Plan) {
    if (!p.packId || busy) return;
    setErr('');
    setBusy(p.key);
    api<{ url: string }>('/api/pay/order', { method: 'POST', body: { packId: p.packId } })
      .then((d) => {
        if (d.url) window.location.href = d.url;
        else throw new Error(d.error || 'Checkout failed');
      })
      .catch((e) => {
        setBusy(null);
        setErr(e.message || 'Checkout failed');
      });
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {PLANS.map((p) => {
          const current = p.key === currentKey;
          return (
            <div
              key={p.key}
              className={`relative flex flex-col rounded-2xl p-[1px] transition hover:-translate-y-0.5 ${
                p.top ? 'bg-gradient-to-b from-volt via-line to-volt/30' : p.popular ? 'bg-gradient-to-b from-volt/70 to-line' : 'bg-line'
              }`}
            >
              <div className="flex h-full flex-col rounded-[15px] bg-panel p-5">
                <div className="flex items-center justify-between">
                  <span className={`grid h-9 w-9 place-items-center rounded-lg ${p.top || p.popular ? 'bg-volt text-volt-ink' : 'bg-raised text-volt'}`}>
                    <p.icon size={17} />
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] ${p.popular || p.top ? 'bg-volt/15 text-volt' : 'bg-raised text-muted'}`}>
                    {p.popular ? 'Most Popular' : p.top ? 'Enterprise' : current ? 'Current Plan' : p.tag}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-semibold">{p.name}</h3>
                <p className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold">${p.price}</span>
                  <span className="text-sm text-muted">{p.price === 0 ? 'forever' : '/mo'}</span>
                </p>
                {p.lead && <p className="mt-4 text-xs text-faint">{p.lead}</p>}
                <ul className={`${p.lead ? 'mt-2' : 'mt-4'} flex-1 space-y-2`}>
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted">
                      <Check size={15} className="mt-0.5 shrink-0 text-volt" /> <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => choose(p)}
                  disabled={current || !p.packId || busy !== null}
                  title={current ? 'Your current plan' : undefined}
                  className={`mt-5 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed ${
                    p.packId && !current
                      ? 'bg-volt text-volt-ink hover:shadow-glow disabled:opacity-60'
                      : 'border border-line bg-raised text-muted'
                  }`}
                >
                  {busy === p.key && <Loader2 size={14} className="animate-spin" />}
                  {current ? 'Current Plan' : p.packId ? `Upgrade to ${p.name}` : 'Current Plan'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
      <p className="mt-3 text-xs text-faint">Secure checkout with Pesapal. Credits are added to your balance automatically once payment completes.</p>
    </div>
  );
}
