import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Minus, Plus, Search, X } from 'lucide-react';
import { supabase } from '../lib/auth';

type Period = 'today' | '24h' | '1m' | '1y' | 'all';
const PERIODS: [Period, string][] = [['today', 'Today'], ['24h', '24 Hours'], ['1m', '1 Month'], ['1y', '1 Year'], ['all', 'All Time']];

interface Stats { total_users: number; new_users: number; active_users: number; paid_customers: number; revenue: { currency: string; total: number }[]; projects: number; credits_used: number }
interface U { id: string; name: string; email: string; credits: number; created_at: string; last_seen_at: string | null; total_time_minutes: number; is_paid: boolean }
interface Tx { id: number; email: string | null; reference: string; credits: number; amount: number; currency: string; status: string; credited: boolean; created_at: string }
interface Detail {
  profile: { id: string; name: string; email: string; credits: number; created_at: string; last_seen_at: string | null; total_time_minutes: number };
  purchased: number; granted: number; used: number;
  projects: { id: number; title: string; mode: string; cost: number; created_at: string }[];
  orders: { id: number; reference: string; credits: number; amount: number; currency: string; status: string; credited: boolean; created_at: string }[];
  ledger: { delta: number; reason: string; balance_after: number; created_at: string }[];
}

const card = 'rounded-2xl border border-line bg-panel p-5';
const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const fmtFull = (d: string | null) =>
  d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';
const dur = (m: number) => {
  const t = Math.round(m || 0);
  const h = Math.floor(t / 60);
  return h ? `Saa ${h} Dakika ${t % 60}` : `Dakika ${t}`;
};
const money = (rev: { currency: string; total: number }[] | undefined) => {
  const get = (c: string) => Number(rev?.find((r) => r.currency === c)?.total || 0);
  const others = (rev || []).filter((r) => r.currency !== 'TZS' && r.currency !== 'USD');
  return [`TZS ${get('TZS').toLocaleString()}`, `USD ${get('USD').toLocaleString()}`, ...others.map((r) => `${r.currency} ${Number(r.total).toLocaleString()}`)];
};

export default function AdminPanel() {
  const [period, setPeriod] = useState<Period>('all');
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<U[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [adj, setAdj] = useState<{ id: string; sign: 1 | -1 } | null>(null);
  const [amount, setAmount] = useState('50');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadStats = useCallback(async (p: Period) => {
    const s = await supabase.rpc('admin_stats', { p_period: p });
    if (s.error) setErr(s.error.message);
    else setStats(s.data as Stats);
  }, []);

  const load = useCallback(async () => {
    const [u, o] = await Promise.all([supabase.rpc('admin_users_v2'), supabase.rpc('admin_orders')]);
    const e = u.error || o.error;
    if (e) setErr(e.message);
    else {
      setErr('');
      setUsers((u.data as U[]) || []);
      setTxs((o.data as Tx[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadStats(period);
  }, [period, loadStats]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(t)) : users;
  }, [users, q]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    const { data, error } = await supabase.rpc('admin_user_detail', { p_user: id });
    setDetailLoading(false);
    if (error) return setErr(error.message);
    setDetail(data as Detail);
  }

  async function adjust(id: string) {
    if (!adj) return;
    const n = Math.floor(Number(amount));
    if (!n || n <= 0) return setErr('Enter a positive number of credits.');
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_adjust_credits', { p_user: id, p_amount: n * adj.sign, p_note: null });
    setBusy(false);
    if (error) return setErr(error.message);
    const bal = Number(data);
    setUsers((list) => list.map((u) => (u.id === id ? { ...u, credits: bal } : u)));
    setDetail((d) => (d && d.profile.id === id ? { ...d, profile: { ...d.profile, credits: bal } } : d));
    setAdj(null);
    setErr('');
    void loadStats(period);
    if (detail?.profile.id === id) void openDetail(id);
  }

  if (loading) return <div className="grid h-40 place-items-center text-muted"><Loader2 className="animate-spin" /></div>;

  const rev = money(stats?.revenue);
  const n = (v?: number) => Number(v || 0).toLocaleString();

  const adjustForm = (id: string) => (
    <span className="inline-flex items-center gap-1.5">
      <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-20 rounded-md border border-line bg-bg px-2 py-1 text-sm outline-none focus:border-volt/60" />
      <button onClick={() => adjust(id)} disabled={busy} className="rounded-md bg-volt px-2.5 py-1 text-xs font-semibold text-volt-ink disabled:opacity-60">
        {busy ? '…' : adj?.sign === 1 ? 'Add' : 'Deduct'}
      </button>
      <button onClick={() => setAdj(null)} className="text-xs text-muted hover:text-fg">Cancel</button>
    </span>
  );

  const actionBtns = (id: string) =>
    adj?.id === id ? (
      adjustForm(id)
    ) : (
      <span className="inline-flex gap-1.5">
        <button onClick={() => { setAdj({ id, sign: 1 }); setAmount('50'); }} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-line px-2.5 py-1 text-xs transition hover:border-volt/50 hover:text-volt">
          <Plus size={12} /> Add Credits
        </button>
        <button onClick={() => { setAdj({ id, sign: -1 }); setAmount('10'); }} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-line px-2.5 py-1 text-xs transition hover:border-danger/50 hover:text-danger">
          <Minus size={12} /> Deduct
        </button>
      </span>
    );

  const cards: [string, React.ReactNode, string?][] = [
    ['Active / Logged-in Users', n(stats?.active_users), `${n(stats?.new_users)} new · ${n(stats?.total_users)} total`],
    ['Paid Customers', n(stats?.paid_customers)],
    ['Total Revenue', <span key="r" className="block text-lg leading-snug">{rev.map((r) => <span key={r} className="block">{r}</span>)}</span>],
    ['Projects Built', n(stats?.projects), `${n(stats?.credits_used)} credits used`],
  ];

  return (
    <>
      <h2 className="text-lg font-semibold">Admin Panel</h2>
      <div className="flex flex-wrap gap-1.5">
        {PERIODS.map(([k, l]) => (
          <button key={k} onClick={() => setPeriod(k)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${period === k ? 'border-volt bg-volt text-volt-ink' : 'border-line text-muted hover:text-fg'}`}>
            {l}
          </button>
        ))}
      </div>
      {err && <p className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">{err}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([l, v, sub]) => (
          <div key={l} className={card}>
            <p className="text-xs text-muted">{l}</p>
            <div className="mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl">{v}</div>
            {sub && <p className="mt-1 text-xs text-faint">{sub}</p>}
          </div>
        ))}
      </div>

      <div className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Users management</h3>
          <label className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="w-full rounded-lg border border-line bg-bg py-2 pl-8 pr-3 text-sm outline-none transition focus:border-volt/60" />
          </label>
        </div>
        <div className="max-h-96 overflow-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0 bg-panel text-xs text-faint">
              <tr>
                <th className="py-2 pr-3 font-medium">Name & Email</th>
                <th className="pr-3 text-right font-medium">Credits</th>
                <th className="pr-3 font-medium">Plan</th>
                <th className="pr-3 font-medium">Last seen</th>
                <th className="text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="max-w-[16rem] py-2.5 pr-3">
                    <button onClick={() => openDetail(u.id)} className="block max-w-full truncate text-left font-medium hover:text-volt">{u.name || '—'}</button>
                    <span className="block truncate text-xs text-muted">{u.email}</span>
                  </td>
                  <td className="pr-3 text-right tabular-nums">{u.credits.toLocaleString()}</td>
                  <td className="pr-3"><span className={`rounded-full px-2 py-0.5 text-xs ${u.is_paid ? 'bg-volt/15 text-volt' : 'bg-raised text-muted'}`}>{u.is_paid ? 'Paid' : 'Free'}</span></td>
                  <td className="whitespace-nowrap pr-3 text-xs text-muted">{fmtFull(u.last_seen_at)}</td>
                  <td className="py-1.5 text-right">{actionBtns(u.id)}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-faint">No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className={card}>
        <h3 className="mb-3 text-sm font-semibold">Recent transactions</h3>
        {txs.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">No transactions yet.</p>
        ) : (
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="sticky top-0 bg-panel text-xs text-faint">
                <tr><th className="py-2 pr-3 font-medium">Date</th><th className="pr-3 font-medium">User</th><th className="pr-3 font-medium">Amount</th><th className="pr-3 font-medium">Method</th><th className="font-medium">Status</th></tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="py-2.5 pr-3 text-muted">{fmt(t.created_at)}</td>
                    <td className="max-w-[12rem] truncate pr-3">{t.email || '—'}</td>
                    <td className="whitespace-nowrap pr-3">{t.currency} {Number(t.amount).toLocaleString()}</td>
                    <td className="pr-3 text-muted">Pesapal</td>
                    <td><span className={`rounded-full px-2 py-0.5 text-xs ${t.credited ? 'bg-volt/15 text-volt' : 'bg-raised text-muted'}`}>{t.credited ? 'Paid' : t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => { setDetail(null); setDetailLoading(false); }}>
          <aside onClick={(e) => e.stopPropagation()} className="h-dvh w-full max-w-md overflow-y-auto border-l border-line bg-panel p-5">
            {!detail ? (
              <div className="grid h-40 place-items-center text-muted"><Loader2 className="animate-spin" /></div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold">{detail.profile.name || '—'}</h3>
                    <p className="truncate text-sm text-muted">{detail.profile.email}</p>
                  </div>
                  <button onClick={() => setDetail(null)} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-raised hover:text-fg"><X size={18} /></button>
                </div>
                <div className="space-y-1 rounded-xl border border-line p-3 text-sm">
                  <p><span className="text-muted">Joined: </span>{fmtFull(detail.profile.created_at)}</p>
                  <p><span className="text-muted">Last seen: </span>{fmtFull(detail.profile.last_seen_at)}</p>
                  <p><span className="text-muted">Time in app: </span>{dur(detail.profile.total_time_minutes)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {([['Purchased', detail.purchased], ['Granted', detail.granted], ['Used', detail.used], ['Balance', detail.profile.credits]] as [string, number][]).map(([l, v]) => (
                    <div key={l} className="rounded-xl border border-line p-3">
                      <p className="text-xs text-muted">{l}</p>
                      <p className="text-lg font-semibold tabular-nums">{Number(v).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
                <div>{actionBtns(detail.profile.id)}</div>

                <section>
                  <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">Projects ({detail.projects.length})</h4>
                  {detail.projects.length === 0 ? <p className="text-sm text-faint">No projects.</p> : (
                    <ul className="max-h-48 divide-y divide-line overflow-auto rounded-xl border border-line text-sm">
                      {detail.projects.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                          <span className="min-w-0 truncate">{p.title}</span>
                          <span className="shrink-0 text-xs text-muted">{fmt(p.created_at)} · {p.cost} cr</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section>
                  <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">Payments ({detail.orders.length})</h4>
                  {detail.orders.length === 0 ? <p className="text-sm text-faint">No payments.</p> : (
                    <ul className="max-h-48 divide-y divide-line overflow-auto rounded-xl border border-line text-sm">
                      {detail.orders.map((o) => (
                        <li key={o.id} className="flex items-center justify-between gap-2 px-3 py-2">
                          <span>{o.currency} {Number(o.amount).toLocaleString()} · {o.credits} cr</span>
                          <span className="shrink-0 text-xs text-muted">{fmt(o.created_at)} · {o.credited ? 'Paid' : o.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section>
                  <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">Credit history</h4>
                  <ul className="max-h-48 divide-y divide-line overflow-auto rounded-xl border border-line text-sm">
                    {detail.ledger.map((l, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="min-w-0 truncate">{l.reason}</span>
                        <span className={`shrink-0 tabular-nums ${l.delta > 0 ? 'text-volt' : 'text-danger'}`}>{l.delta > 0 ? '+' : ''}{l.delta}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
