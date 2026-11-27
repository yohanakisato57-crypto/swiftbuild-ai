import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, Loader2, Plug, X } from 'lucide-react';
import { supabase, type Account } from '../lib/auth';

interface Field {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
}
interface Connector {
  id: string;
  name: string;
  desc: string;
  group: string;
  color: string;
  fields: Field[];
}

const KEY = (label: string, ph = 'sk-…'): Field[] => [{ key: 'api_key', label, placeholder: ph, secret: true }];
const DB: Field[] = [{ key: 'connection_string', label: 'Connection URL', placeholder: 'postgresql://user:pass@host:5432/db', secret: true }];
const PAIR = (a = 'Public Key / Consumer Key', b = 'Secret Key / Consumer Secret'): Field[] => [
  { key: 'public_key', label: a, placeholder: 'Public / consumer key', secret: false },
  { key: 'secret_key', label: b, placeholder: 'Secret key', secret: true },
];

const AI = 'AI Models & Media Engines';
const DBG = 'Cloud Databases';
const SOC = 'Social & Productivity Apps';
const PAY = 'Global & Local Payment Gateways';
const EML = 'Email, SMS & Automation';

const CONNECTORS: Connector[] = [
  { id: 'openai', group: AI, name: 'OpenAI', desc: 'GPT models for chat, code and image generation.', color: 'from-emerald-300 to-teal-500', fields: KEY('API Key', 'sk-…') },
  { id: 'anthropic', group: AI, name: 'Anthropic Claude', desc: 'Claude models for long-context reasoning and code.', color: 'from-orange-300 to-amber-600', fields: KEY('API Key', 'sk-ant-…') },
  { id: 'deepseek', group: AI, name: 'DeepSeek', desc: 'Low-cost reasoning and coding models.', color: 'from-sky-300 to-blue-600', fields: KEY('API Key', 'sk-…') },
  { id: 'fal', group: AI, name: 'fal.ai', desc: 'Generative media API for fast image and video models.', color: 'from-fuchsia-300 to-purple-600', fields: KEY('API Key', 'fal-…') },
  { id: 'midjourney', group: AI, name: 'Midjourney API', desc: 'Stylized image generation for your app visuals.', color: 'from-slate-200 to-slate-500', fields: KEY('API Key', 'mj-…') },
  { id: 'stability', group: AI, name: 'Stable Diffusion (Stability AI)', desc: 'Open image models for text-to-image and editing.', color: 'from-violet-300 to-indigo-600', fields: KEY('API Key', 'sk-…') },
  { id: 'elevenlabs', group: AI, name: 'ElevenLabs (Voice AI)', desc: 'Realistic text-to-speech and voice cloning.', color: 'from-zinc-200 to-zinc-500', fields: KEY('API Key', 'xi-…') },

  { id: 'supabase', group: DBG, name: 'Supabase', desc: 'Auth, Postgres and storage for your generated apps.', color: 'from-emerald-300 to-green-600', fields: [{ key: 'supabase_url', label: 'Supabase URL', placeholder: 'https://xyz.supabase.co' }, { key: 'anon_key', label: 'Supabase Anon Key', placeholder: 'eyJhbGciOi…', secret: true }] },
  { id: 'postgres', group: DBG, name: 'PostgreSQL', desc: 'Connect any hosted Postgres database.', color: 'from-sky-300 to-indigo-500', fields: DB },
  { id: 'mongodb', group: DBG, name: 'MongoDB', desc: 'Document database for flexible app data.', color: 'from-lime-300 to-green-700', fields: [{ key: 'connection_string', label: 'Connection URL', placeholder: 'mongodb+srv://user:pass@cluster/db', secret: true }] },
  { id: 'firebase', group: DBG, name: 'Firebase', desc: 'Realtime database, push notifications and hosting.', color: 'from-amber-300 to-orange-600', fields: [{ key: 'api_key', label: 'Firebase Web API Key / Access Token', placeholder: 'AIza…', secret: true }, { key: 'project_id', label: 'Project ID', placeholder: 'my-project-id' }] },
  { id: 'redis', group: DBG, name: 'Redis', desc: 'In-memory cache, queues and sessions.', color: 'from-red-300 to-rose-600', fields: [{ key: 'connection_string', label: 'Connection URL', placeholder: 'rediss://default:pass@host:6379', secret: true }] },

  { id: 'whatsapp', group: SOC, name: 'WhatsApp Business API', desc: 'Send and receive customer messages from your app.', color: 'from-emerald-300 to-green-600', fields: [{ key: 'phone_id', label: 'Phone Number ID', placeholder: '1092…' }, { key: 'access_token', label: 'Access Token', placeholder: 'EAAG…', secret: true }] },
  { id: 'telegram', group: SOC, name: 'Telegram Bot API', desc: 'Send alerts and run bots on Telegram.', color: 'from-sky-300 to-cyan-600', fields: KEY('API Key', '123456:ABC-DEF…') },
  { id: 'instagram', group: SOC, name: 'Instagram Graph API', desc: 'Publish posts and reply to messages.', color: 'from-pink-300 to-fuchsia-600', fields: [{ key: 'account_id', label: 'Instagram Business Account ID', placeholder: '1784…' }, { key: 'access_token', label: 'Access Token', placeholder: 'IGQV…', secret: true }] },
  { id: 'sheets', group: SOC, name: 'Google Sheets Connector', desc: 'Read and write rows as a lightweight database.', color: 'from-sky-300 to-blue-600', fields: [{ key: 'sheet_id', label: 'Spreadsheet ID', placeholder: '1AbC…' }, { key: 'api_key', label: 'Google API Key', placeholder: 'AIza…', secret: true }] },
  { id: 'shopify', group: SOC, name: 'Shopify API', desc: 'Sync products, carts and orders with your store.', color: 'from-lime-300 to-emerald-700', fields: [{ key: 'store_domain', label: 'Store Domain', placeholder: 'my-store.myshopify.com' }, { key: 'access_token', label: 'Admin API Access Token', placeholder: 'shpat_…', secret: true }] },

  { id: 'stripe', group: PAY, name: 'Stripe', desc: 'Accept cards and subscriptions worldwide.', color: 'from-indigo-300 to-violet-600', fields: PAIR() },
  { id: 'paypal', group: PAY, name: 'PayPal', desc: 'Checkout with PayPal balances and cards.', color: 'from-blue-300 to-blue-700', fields: PAIR() },
  { id: 'pesapal', group: PAY, name: 'Pesapal Tanzania', desc: 'Mobile money and cards across East Africa.', color: 'from-lime-300 to-emerald-600', fields: PAIR() },
  { id: 'dlocal', group: PAY, name: 'dLocal', desc: 'Local payment methods across emerging markets.', color: 'from-teal-300 to-cyan-600', fields: PAIR() },
  { id: 'square', group: PAY, name: 'Square', desc: 'Accept US retail, POS, and online card payments.', color: 'from-zinc-200 to-zinc-500', fields: [{ key: 'application_id', label: 'Application ID', placeholder: 'sq0idp-…' }, { key: 'access_token', label: 'Access Token', placeholder: 'EAAA…', secret: true }] },
  { id: 'plaid', group: PAY, name: 'Plaid', desc: 'Connect US bank accounts for instant ACH verification and payments.', color: 'from-slate-200 to-slate-500', fields: [{ key: 'client_id', label: 'Client ID', placeholder: 'Plaid client ID' }, { key: 'secret_key', label: 'Secret', placeholder: 'Plaid secret', secret: true }] },
  { id: 'shippo', group: PAY, name: 'Shippo', desc: 'Real-time US shipping rates and labels for USPS, UPS, and FedEx.', color: 'from-sky-300 to-blue-600', fields: KEY('API Token', 'shippo_live_…') },

  { id: 'twilio', group: EML, name: 'Twilio', desc: 'Send SMS notifications, 2FA OTP codes, and voice calls in the US.', color: 'from-red-300 to-rose-600', fields: [{ key: 'account_sid', label: 'Account SID', placeholder: 'AC…' }, { key: 'auth_token', label: 'Auth Token', placeholder: 'Auth token', secret: true }] },
  { id: 'resend', group: EML, name: 'Resend', desc: 'Modern transactional email API for user signups and receipts.', color: 'from-zinc-200 to-zinc-500', fields: KEY('API Key', 're_…') },
  { id: 'sendgrid', group: EML, name: 'SendGrid', desc: 'Automated email delivery and marketing campaigns.', color: 'from-sky-300 to-blue-600', fields: KEY('API Key', 'SG.…') },
  { id: 'mailchimp', group: EML, name: 'Mailchimp', desc: 'Email newsletters and customer audience automation.', color: 'from-yellow-200 to-amber-500', fields: [{ key: 'api_key', label: 'API Key', placeholder: 'xxxx-us21', secret: true }, { key: 'audience_id', label: 'Audience ID', placeholder: 'a1b2c3d4e5' }] },
  { id: 'hubspot', group: EML, name: 'HubSpot', desc: 'CRM, lead capture forms, and customer sales tracking.', color: 'from-orange-300 to-red-500', fields: KEY('Private App Access Token', 'pat-na1-…') },
  { id: 'zapier', group: EML, name: 'Zapier', desc: 'Connect your app to 6,000+ US business tools via webhooks.', color: 'from-orange-300 to-orange-600', fields: [{ key: 'webhook_url', label: 'Webhook URL', placeholder: 'https://hooks.zapier.com/hooks/catch/…', secret: true }] },
  { id: 'gmaps', group: EML, name: 'Google Maps API', desc: 'Location autocomplete, interactive maps, and delivery distance.', color: 'from-green-300 to-emerald-600', fields: KEY('Maps API Key', 'AIza…') },
];

const GROUPS = [AI, DBG, SOC, PAY, EML];

const BRAND: Record<string, { slug?: string; hex: string; mark: string }> = {
  openai: { hex: '10A37F', mark: 'O' }, anthropic: { slug: 'anthropic', hex: 'D97757', mark: 'A' },
  deepseek: { slug: 'deepseek', hex: '4D6BFE', mark: 'D' }, fal: { hex: 'E11D8A', mark: 'fal' },
  midjourney: { hex: 'FFFFFF', mark: 'M' }, stability: { hex: '7C3AED', mark: 'S' },
  elevenlabs: { slug: 'elevenlabs', hex: 'FFFFFF', mark: 'XI' }, supabase: { slug: 'supabase', hex: '3ECF8E', mark: 'S' },
  postgres: { slug: 'postgresql', hex: '4169E1', mark: 'P' }, mongodb: { slug: 'mongodb', hex: '47A248', mark: 'M' },
  firebase: { slug: 'firebase', hex: 'FFCA28', mark: 'F' }, redis: { slug: 'redis', hex: 'DC382D', mark: 'R' },
  whatsapp: { slug: 'whatsapp', hex: '25D366', mark: 'W' }, telegram: { slug: 'telegram', hex: '26A5E4', mark: 'T' },
  instagram: { slug: 'instagram', hex: 'E4405F', mark: 'I' }, sheets: { slug: 'googlesheets', hex: '34A853', mark: 'S' },
  shopify: { slug: 'shopify', hex: '7AB55C', mark: 'S' }, stripe: { slug: 'stripe', hex: '635BFF', mark: 'S' },
  paypal: { slug: 'paypal', hex: '00457C', mark: 'P' }, pesapal: { hex: '8DC63F', mark: 'PP' }, dlocal: { hex: '00C2A8', mark: 'dL' },
  square: { slug: 'square', hex: 'FFFFFF', mark: 'Sq' }, plaid: { hex: 'FFFFFF', mark: 'Pl' },
  shippo: { hex: '2D6BFF', mark: 'Sh' }, twilio: { slug: 'twilio', hex: 'F22F46', mark: 'T' },
  resend: { slug: 'resend', hex: 'FFFFFF', mark: 'R' }, sendgrid: { hex: '1A82E2', mark: 'SG' },
  mailchimp: { slug: 'mailchimp', hex: 'FFE01B', mark: 'M' }, hubspot: { slug: 'hubspot', hex: 'FF7A59', mark: 'H' },
  zapier: { slug: 'zapier', hex: 'FF4F00', mark: 'Z' }, gmaps: { slug: 'googlemaps', hex: '4285F4', mark: 'G' },
};

function Logo({ id, size = 40 }: { id: string; size?: number }) {
  const b = BRAND[id];
  const [failed, setFailed] = useState(false);
  const light = ['FFFFFF', 'FFCA28', '8DC63F', '25D366', '3ECF8E', '7AB55C'].includes(b.hex);
  return (
    <span className="grid shrink-0 place-items-center rounded-lg border border-line bg-bg" style={{ width: size, height: size }}>
      {id === 'supabase' ? (
        <svg viewBox="0 0 24 24" style={{ width: size * 0.58, height: size * 0.58 }} aria-label="Supabase" role="img">
          <path fill="#3ECF8E" d="M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C-.33 13.427.65 15.455 2.409 15.455h9.579l.113 7.51c.014.985 1.259 1.408 1.873.636l9.262-11.653c1.093-1.375.113-3.403-1.645-3.403h-9.642z" />
        </svg>
      ) : b.slug && !failed ? (
        <img src={`https://cdn.simpleicons.org/${b.slug}/${b.hex === 'FFFFFF' ? 'ffffff' : b.hex}`} alt="" onError={() => setFailed(true)} style={{ width: size * 0.55, height: size * 0.55 }} />
      ) : (
        <span className="grid place-items-center rounded-md font-bold" style={{ width: size * 0.65, height: size * 0.65, background: '#' + b.hex, color: light ? '#111' : '#fff', fontSize: size * (b.mark.length > 1 ? 0.24 : 0.34) }}>{b.mark}</span>
      )}
    </span>
  );
}


export default function ConnectorsPage({ account, onClose }: { account: Account; onClose: () => void }) {
  const [saved, setSaved] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Connector | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    supabase
      .from('connector_credentials')
      .select('connector_id,secrets')
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setErr(error.message);
        const m: Record<string, Record<string, string>> = {};
        (data || []).forEach((r: { connector_id: string; secrets: Record<string, string> }) => (m[r.connector_id] = r.secrets));
        setSaved(m);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  function openDialog(c: Connector) {
    setActive(c);
    setVals(saved[c.id] || {});
    setShow({});
    setErr('');
  }

  async function save() {
    if (!active) return;
    if (active.fields.some((f) => !(vals[f.key] || '').trim())) {
      setErr('Please fill in every field.');
      return;
    }
    setBusy(true);
    setErr('');
    const clean: Record<string, string> = {};
    active.fields.forEach((f) => (clean[f.key] = vals[f.key].trim()));
    const { error } = await supabase
      .from('connector_credentials')
      .upsert({ user_id: account.id, connector_id: active.id, secrets: clean, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) return setErr(error.message);
    setSaved((s) => ({ ...s, [active.id]: clean }));
    setActive(null);
  }

  async function disconnect() {
    if (!active) return;
    setBusy(true);
    const { error } = await supabase.from('connector_credentials').delete().eq('user_id', account.id).eq('connector_id', active.id);
    setBusy(false);
    if (error) return setErr(error.message);
    setSaved((s) => {
      const n = { ...s };
      delete n[active.id];
      return n;
    });
    setActive(null);
  }

  const count = Object.keys(saved).length;
  const input = 'w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none transition focus:border-volt/60';

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg text-fg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        <button onClick={onClose} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted transition hover:bg-raised hover:text-fg">
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-sm font-semibold">Connector API</h1>
        <span className="ml-auto rounded-full border border-line px-2.5 py-1 text-xs text-muted">{count} connected</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-[1400px] space-y-8">
          <p className="text-sm text-muted">Connect external services. Your keys are saved to your private Supabase account and used when building your apps.</p>
          {loading && <p className="text-sm text-faint">Loading connectors…</p>}
          {GROUPS.map((g) => (
            <section key={g}>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-faint">{g}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {CONNECTORS.filter((c) => c.group === g).map((c) => {
                  const on = !!saved[c.id];
                  return (
                    <div key={c.id} className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4 transition duration-300 hover:-translate-y-0.5 hover:border-volt/40">
                      <div className="flex items-center gap-3">
                        <Logo id={c.id} />
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</p>
                        {on && <span className="flex items-center gap-1 text-[11px] text-volt"><Check size={12} /> Connected</span>}
                      </div>
                      <p className="flex-1 text-xs leading-snug text-faint">{c.desc}</p>
                      <button
                        onClick={() => openDialog(c)}
                        className={`rounded-lg py-1.5 text-xs font-medium transition active:scale-[0.98] ${
                          on ? 'border border-volt/40 bg-volt/10 text-volt' : 'bg-fg text-bg hover:opacity-90'
                        }`}
                      >
                        {on ? 'Manage' : 'Connect'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {active && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => setActive(null)}>
          <div role="dialog" aria-label={`Connect ${active.name}`} onClick={(e) => e.stopPropagation()} className="max-h-full w-full max-w-md animate-pop overflow-y-auto rounded-2xl border border-line-strong bg-panel p-5 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <Logo id={active.id} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Connect {active.name}</p>
                <p className="text-xs text-faint">Saved securely to your Supabase account.</p>
              </div>
              <button onClick={() => setActive(null)} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-raised hover:text-fg"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              {active.fields.map((f) => (
                <label key={f.key} className="block">
                  <span className="mb-1 block text-xs text-muted">{f.label}</span>
                  <div className="relative">
                    <input
                      type={f.secret && !show[f.key] ? 'password' : 'text'}
                      value={vals[f.key] || ''}
                      onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      autoComplete="off"
                      spellCheck={false}
                      className={input + (f.secret ? ' pr-9' : '')}
                    />
                    {f.secret && (
                      <button type="button" onClick={() => setShow((s) => ({ ...s, [f.key]: !s[f.key] }))} aria-label="Toggle visibility" className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-fg">
                        {show[f.key] ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    )}
                  </div>
                </label>
              ))}
            </div>
            {err && <p className="mt-3 text-xs text-danger">{err}</p>}
            <div className="mt-5 flex gap-2">
              {saved[active.id] && (
                <button onClick={disconnect} disabled={busy} className="rounded-lg border border-line px-3 py-2 text-sm text-muted transition hover:text-danger disabled:opacity-50">Disconnect</button>
              )}
              <button onClick={save} disabled={busy} className="ml-auto flex items-center gap-2 rounded-lg bg-volt px-4 py-2 text-sm font-semibold text-volt-ink transition hover:shadow-glow active:scale-[0.98] disabled:opacity-60">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />} Save Connection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
