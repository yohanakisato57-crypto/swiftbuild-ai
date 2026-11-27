import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Check, CreditCard, Loader2, Shield, Sparkles, SlidersHorizontal, User } from 'lucide-react';
import AdminPanel from './AdminPanel';

const ADMIN_EMAIL = 'yohanakisato57@gmail.com';
import { supabase, type Account } from '../lib/auth';
import PlansGrid, { planFromPacks } from './PlansGrid';

type Tab = 'profile' | 'billing' | 'usage' | 'instructions' | 'admin';

interface Ledger { id: number; delta: number; reason: string; balance_after: number; created_at: string }
interface Order { pack_id: number; id: number; reference: string; credits: number; amount: number; currency: string; status: string; credited: boolean; created_at: string }
interface Proj { id: number; title: string; cost: number; mode: string; created_at: string }

const TABS: { id: Tab; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Profile & Account', icon: User },
  { id: 'billing', label: 'Billing & Subscriptions', icon: CreditCard },
  { id: 'usage', label: 'Usage Analytics', icon: BarChart3 },
  { id: 'instructions', label: 'Custom Instructions', icon: SlidersHorizontal },
];

const card = 'rounded-2xl border border-line bg-panel p-5';
const field = 'w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none transition focus:border-volt/60';
const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function planFor(orders: Order[]) {
  const paid = orders.filter((o) => o.credited);
  if (!paid.length) return { key: 'free', name: 'Free Tier', note: 'Welcome credits only. Premium templates are locked.' };
  const monthly = paid.filter((o) => o.pack_id >= 10).sort((a, b) => b.pack_id - a.pack_id)[0];
  if (monthly) {
    const key = planFromPacks([monthly.pack_id]);
    const label = { enterprise: 'Enterprise', pro: 'Pro Plan', starter: 'Starter Plus', lite: 'Starter Lite' }[key] || 'Starter Lite';
    return { key, name: label, note: 'Premium templates unlocked.' };
  }
  const top = Math.max(...paid.map((o) => o.credits));
  const name = top >= 27000 ? 'Enterprise' : top >= 5000 ? 'Scale' : top >= 1000 ? 'Pro' : top >= 280 ? 'Popular' : top >= 100 ? 'Builder' : 'Starter';
  return { key: 'credits', name: `Premium · ${name}`, note: 'Premium templates unlocked.' };
}

export default function SettingsPage({
  account,
  onClose,
  onBuy,
  onAccount,
}: {
  account: Account;
  onClose: () => void;
  onBuy: () => void;
  onAccount: (patch: Partial<Account>) => void;
}) {
  const [tab, setTab] = useState<Tab>('profile');
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [projects, setProjects] = useState<Proj[]>([]);
  const [instr, setInstr] = useState('');
  const [instrLoaded, setInstrLoaded] = useState(false);
  const [name, setName] = useState(account.name);
  const [avatar, setAvatar] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const m = data.user?.user_metadata || {};
      setAvatar(String(m.avatar_url || m.picture || ''));
    });
    supabase.from('credit_ledger').select('id,delta,reason,balance_after,created_at').order('created_at', { ascending: true }).then(({ data }) => setLedger((data as Ledger[]) || []));
    supabase.from('orders').select('id,reference,pack_id,credits,amount,currency,status,credited,created_at').order('created_at', { ascending: false }).then(({ data }) => setOrders((data as Order[]) || []));
    supabase.from('projects').select('id,title,cost,mode,created_at').order('created_at', { ascending: false }).then(({ data }) => setProjects((data as Proj[]) || []));
    supabase.from('user_settings').select('custom_instructions').maybeSingle().then(({ data }) => {
      setInstr(data?.custom_instructions || '');
      setInstrLoaded(true);
    });
  }, []);

  function flash(t: string) {
    setMsg(t);
    setTimeout(() => setMsg(''), 2600);
  }

  async function saveProfile() {
    if (!name.trim()) return flash('Name cannot be empty.');
    setBusy('profile');
    const { data, error } = await supabase.rpc('update_my_name', { p_name: name });
    if (!error) {
      const { error: e2 } = await supabase.auth.updateUser({ data: { full_name: name.trim(), avatar_url: avatar.trim() } });
      if (e2) flash(e2.message);
      else {
        onAccount({ name: String(data || name.trim()) });
        flash('Profile saved.');
      }
    } else flash(error.message);
    setBusy('');
  }

  async function saveInstr() {
    setBusy('instr');
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: account.id, custom_instructions: instr.slice(0, 4000), updated_at: new Date().toISOString() });
    setBusy('');
    flash(error ? error.message : 'Instructions saved. They apply to your next build.');
  }

  const plan = useMemo(() => planFor(orders), [orders]);
  const spent = ledger.filter((l) => l.delta < 0);
  const totalSpent = spent.reduce((n, l) => n - l.delta, 0);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg text-fg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        <button onClick={onClose} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted transition hover:bg-raised hover:text-fg">
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-sm font-semibold">Settings</h1>
        {msg && <span className="ml-auto rounded-full border border-volt/40 px-3 py-1 text-xs text-volt">{msg}</span>}
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2 md:w-64 md:flex-col md:border-b-0 md:border-r md:p-3">
          {[...TABS, ...(account.email.toLowerCase() === ADMIN_EMAIL ? [{ id: 'admin' as Tab, label: 'Admin Panel', icon: Shield }] : [])].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
                tab === t.id ? 'bg-raised text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg'
              }`}
            >
              <t.icon size={15} className={tab === t.id ? 'text-volt' : ''} /> {t.label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
          <div className={`mx-auto space-y-5 ${tab === 'billing' ? 'max-w-7xl' : tab === 'admin' ? 'max-w-5xl' : 'max-w-4xl'}`}>
            {tab === 'profile' && (
              <>
                <h2 className="text-lg font-semibold">Profile & Account</h2>
                <div className={`${card} flex flex-col gap-6 sm:flex-row`}>
                  <div className="flex flex-col items-center gap-3">
                    {avatar ? (
                      <img src={avatar} alt="Profile" referrerPolicy="no-referrer" className="h-24 w-24 rounded-full border border-line object-cover" />
                    ) : (
                      <div className="grid h-24 w-24 place-items-center rounded-full bg-volt text-3xl font-semibold text-volt-ink">{account.name.slice(0, 1).toUpperCase()}</div>
                    )}
                    <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">{account.provider === 'google' ? 'Google account' : 'Email account'}</span>
                  </div>
                  <div className="min-w-0 flex-1 space-y-4">
                    <label className="block text-xs text-muted">
                      Full name
                      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={`${field} mt-1`} />
                    </label>
                    <label className="block text-xs text-muted">
                      {account.provider === 'google' ? 'Google email' : 'Email'}
                      <input value={account.email} readOnly className={`${field} mt-1 cursor-not-allowed opacity-70`} />
                    </label>
                    <label className="block text-xs text-muted">
                      Profile picture URL
                      <input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://…" className={`${field} mt-1`} />
                    </label>
                    <button onClick={saveProfile} disabled={busy === 'profile'} className="flex items-center gap-2 rounded-lg bg-volt px-4 py-2 text-sm font-semibold text-volt-ink transition hover:shadow-glow active:scale-[0.98] disabled:opacity-60">
                      {busy === 'profile' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save changes
                    </button>
                  </div>
                </div>
              </>
            )}

            {tab === 'billing' && (
              <>
                <h2 className="text-lg font-semibold">Plans & Credit Usage</h2>
                <div className={`${card} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
                  <div>
                    <p className="text-xs text-muted">Current plan</p>
                    <p className="mt-1 text-2xl font-semibold">{plan.name}</p>
                    <p className="mt-1 text-sm text-muted">{plan.note} · {account.credits.toLocaleString()} credits left</p>
                  </div>
                  <button onClick={onBuy} className="flex items-center justify-center gap-2 rounded-xl border border-line bg-raised px-5 py-3 text-sm font-semibold transition hover:border-volt/50 active:scale-[0.98]">
                    <Sparkles size={16} className="text-volt" /> View all plans
                  </button>
                </div>
                <PlansGrid currentKey={plan.key} />
                <div className={card}>
                  <h3 className="mb-3 text-sm font-semibold">Pesapal payment history</h3>
                  {orders.length === 0 ? (
                    <p className="py-6 text-center text-sm text-faint">No payments yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="text-xs text-faint">
                          <tr><th className="py-2 pr-3 font-medium">Date</th><th className="pr-3 font-medium">Reference</th><th className="pr-3 font-medium">Credits</th><th className="pr-3 font-medium">Amount</th><th className="font-medium">Status</th></tr>
                        </thead>
                        <tbody>
                          {orders.map((o) => (
                            <tr key={o.id} className="border-t border-line">
                              <td className="py-2.5 pr-3 text-muted">{fmt(o.created_at)}</td>
                              <td className="pr-3 font-mono text-xs">{o.reference}</td>
                              <td className="pr-3">{o.credits.toLocaleString()}</td>
                              <td className="pr-3">{o.currency} {Number(o.amount).toLocaleString()}</td>
                              <td>
                                <span className={`rounded-full px-2 py-0.5 text-xs ${o.credited ? 'bg-volt/15 text-volt' : 'bg-raised text-muted'}`}>{o.credited ? 'Paid' : o.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className={card}>
                  <h3 className="mb-3 text-sm font-semibold">Credits usage log</h3>
                  {ledger.length === 0 && projects.length === 0 ? (
                    <p className="py-6 text-center text-sm text-faint">No credit activity yet.</p>
                  ) : (
                    <div className="max-h-72 overflow-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 bg-panel text-xs text-faint">
                          <tr><th className="py-2 pr-3 font-medium">Date</th><th className="pr-3 font-medium">Activity</th><th className="pr-3 text-right font-medium">Credits</th><th className="text-right font-medium">Balance</th></tr>
                        </thead>
                        <tbody>
                          {[...ledger].reverse().map((l) => (
                            <tr key={l.id} className="border-t border-line">
                              <td className="py-2.5 pr-3 text-muted">{fmt(l.created_at)}</td>
                              <td className="max-w-[16rem] truncate pr-3">{l.reason}</td>
                              <td className={`pr-3 text-right font-medium ${l.delta < 0 ? 'text-red-400' : 'text-volt'}`}>{l.delta > 0 ? '+' : ''}{l.delta}</td>
                              <td className="text-right text-muted">{l.balance_after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                {projects.length > 0 && (
                  <div className={card}>
                    <h3 className="mb-3 text-sm font-semibold">Credits used per project</h3>
                    <div className="max-h-56 overflow-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 bg-panel text-xs text-faint">
                          <tr><th className="py-2 pr-3 font-medium">Project</th><th className="pr-3 font-medium">Mode</th><th className="pr-3 font-medium">Date</th><th className="text-right font-medium">Credits</th></tr>
                        </thead>
                        <tbody>
                          {projects.map((p) => (
                            <tr key={p.id} className="border-t border-line">
                              <td className="max-w-[14rem] truncate py-2.5 pr-3">{p.title}</td>
                              <td className="pr-3 capitalize text-muted">{p.mode}</td>
                              <td className="pr-3 text-muted">{fmt(p.created_at)}</td>
                              <td className="text-right">−{p.cost}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === 'usage' && (
              <>
                <h2 className="text-lg font-semibold">Usage Analytics</h2>
                <div className="grid grid-cols-3 gap-3">
                  {[['Balance', account.credits], ['Credits used', totalSpent], ['Projects', projects.length]].map(([l, v]) => (
                    <div key={l} className={card}>
                      <p className="text-xs text-muted">{l}</p>
                      <p className="mt-1 text-2xl font-semibold">{Number(v).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
                <div className={card}>
                  <h3 className="mb-3 text-sm font-semibold">Credit balance over time</h3>
                  <LineChart data={ledger} />
                </div>
                <div className={card}>
                  <h3 className="mb-3 text-sm font-semibold">Dynamic credit cost per project</h3>
                  {projects.length === 0 ? (
                    <p className="py-6 text-center text-sm text-faint">No projects yet.</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {projects.slice(0, 15).map((p) => (
                        <li key={p.id} className="flex items-center gap-3 text-sm">
                          <span className="w-40 shrink-0 truncate sm:w-56">{p.title}</span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
                            <div className="h-full rounded-full bg-volt" style={{ width: `${Math.min(100, (p.cost / 15) * 100)}%` }} />
                          </div>
                          <span className="w-16 shrink-0 text-right text-xs text-muted">−{p.cost} cr</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            {tab === 'admin' && account.email.toLowerCase() === ADMIN_EMAIL && <AdminPanel />}

            {tab === 'instructions' && (
              <>
                <h2 className="text-lg font-semibold">Custom Instructions</h2>
                <div className={card}>
                  <p className="mb-3 text-sm text-muted">Permanent rules for every build, for example your preferred colors, fonts, language or code style. The model reads them automatically.</p>
                  <textarea
                    value={instr}
                    onChange={(e) => setInstr(e.target.value)}
                    maxLength={4000}
                    disabled={!instrLoaded}
                    rows={12}
                    placeholder="e.g. Always use a dark theme with green accents. Write copy in Swahili. Keep the layout mobile-first."
                    className={`${field} resize-none leading-relaxed`}
                  />
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-faint">{instr.length}/4000</span>
                    <button onClick={saveInstr} disabled={busy === 'instr' || !instrLoaded} className="flex items-center gap-2 rounded-lg bg-volt px-4 py-2 text-sm font-semibold text-volt-ink transition hover:shadow-glow active:scale-[0.98] disabled:opacity-60">
                      {busy === 'instr' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save instructions
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LineChart({ data }: { data: Ledger[] }) {
  if (data.length < 1) return <p className="py-10 text-center text-sm text-faint">No activity yet.</p>;
  const pts = data.length === 1 ? [data[0], data[0]] : data;
  const W = 800, H = 240, P = 28;
  const max = Math.max(...pts.map((p) => p.balance_after), 1);
  const x = (i: number) => P + (i / (pts.length - 1)) * (W - P * 2);
  const y = (v: number) => H - P - (v / max) * (H - P * 2);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.balance_after).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" role="img" aria-label="Credit balance history">
      {[0, 0.5, 1].map((g) => (
        <g key={g}>
          <line x1={P} x2={W - P} y1={y(max * g)} y2={y(max * g)} stroke="currentColor" className="text-line" />
          <text x={4} y={y(max * g) + 4} className="fill-faint" fontSize="11">{Math.round(max * g)}</text>
        </g>
      ))}
      <path d={`${path} L${x(pts.length - 1)},${H - P} L${x(0)},${H - P} Z`} className="fill-volt/10" />
      <path d={path} fill="none" strokeWidth="2.5" strokeLinejoin="round" className="stroke-volt" />
      {pts.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.balance_after)} r="4" className={p.delta < 0 ? 'fill-danger' : 'fill-volt'}>
          <title>{`${p.reason}: ${p.delta > 0 ? '+' : ''}${p.delta} → ${p.balance_after}`}</title>
        </circle>
      ))}
    </svg>
  );
}
