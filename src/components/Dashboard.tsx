import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Globe, MessageCircle, MessageSquare, Search, Trash2, X } from 'lucide-react';
import BottomNav, { type Tab } from './BottomNav';
import { api, deleteProject, loadActiveJobs, loadProjects, type Account, type ActiveJob } from '../lib/auth';
import type { Project } from '../lib/generator';
import LoadingOverlay from './LoadingOverlay';
import { createSession, deleteSession, loadSessions, type ChatSession } from '../lib/chat';
import ChatView from './ChatView';
import PublishMenu from './PublishMenu';
import { previewDoc, templatePreviewDoc } from '../lib/preview';
import Header from './Header';
import Sidebar, { type TemplateItem } from './Sidebar';
import Composer, { type UiMode } from './Composer';
import TemplatesPage from './TemplatesPage';
import ConnectorsPage from './ConnectorsPage';
import SettingsPage from './SettingsPage';
import PricingModal from './PricingModal';

interface Props {
  account: Account;
  onCredits: (balance: number) => void;
  onAccount?: (patch: Partial<Account>) => void;
  onSignOut: () => void;
}


const TEMPLATE_CARDS = [
  { title: 'Modern Store', badge: 'E-commerce', img: 'photo-1542744095-291d1f67b221', prompt: 'Build a modern online store with product grid, cart and checkout', desc: 'A complete online shop with a product catalog, search and filters, a working cart and a smooth checkout flow, ready to sell.', features: ['Product grid', 'Cart', 'Checkout', 'Filters'] },
  { title: 'School Website', badge: 'Education', img: 'photo-1549057446-9f5c6ac91a04', prompt: 'Build a school website with admissions, programs, news and contact pages', desc: 'A trusted public face for your school: admissions info, academic programs, latest news and an easy way for parents to get in touch.', features: ['Admissions', 'Programs', 'News', 'Contact'] },
  { title: 'Designer Portfolio', badge: 'Portfolio', img: 'photo-1626785774573-4b799315345d', prompt: 'Build a personal portfolio website with projects, about and contact sections', desc: 'A sleek personal site that showcases your best work, tells your story and turns visitors into clients with a clear contact form.', features: ['Projects', 'About', 'Contact', 'Gallery'] },
  { title: 'Hotel System', badge: 'Hospitality', img: 'photo-1625244724120-1fd1d34d00f6', prompt: 'Build a hotel management system with room booking, guests and a dashboard', desc: 'Manage rooms, reservations and guests from one dashboard, with live availability and booking summaries for the front desk.', features: ['Room booking', 'Guests', 'Dashboard', 'Availability'] },
  { title: 'Restaurant Website', badge: 'Restaurant', img: 'photo-1763568258153-0b73dae57f43', prompt: 'Build a restaurant website with menu, online orders and table reservations', desc: 'An appetizing site with a browsable menu, online ordering and table reservations that keep your dining room full.', features: ['Menu', 'Online orders', 'Reservations', 'Gallery'] },
  { title: 'Gym & Fitness', badge: 'Fitness', img: 'photo-1580983693000-5654250f64d1', prompt: 'Build a gym and fitness app with workout plans, memberships and progress tracking', desc: 'Motivate members with workout plans, membership tiers and progress tracking that shows real results over time.', features: ['Workouts', 'Memberships', 'Progress', 'Trainers'] },
  { title: 'Personal Blog', badge: 'Blog', img: 'photo-1496181133206-80ce9b88a853', prompt: 'Build a modern blog with articles, categories, search and newsletter signup', desc: 'A clean reading experience with articles, categories, search and a newsletter signup to grow your audience.', features: ['Articles', 'Categories', 'Search', 'Newsletter'] },
  { title: 'Clinic System', badge: 'Healthcare', img: 'photo-1777269749032-d8d458ae594d', prompt: 'Build a clinic management system with patients, appointments and records', desc: 'Keep your clinic organized with patient profiles, appointment scheduling and medical records in one secure place.', features: ['Patients', 'Appointments', 'Records', 'Dashboard'] },
  { title: 'Real Estate Website', badge: 'Real Estate', img: 'photo-1580587771525-78b9dba3b914', prompt: 'Build a real estate website with property listings, filters and contact forms', desc: 'Present properties beautifully with detailed listings, price and location filters, and inquiry forms that capture leads.', features: ['Listings', 'Filters', 'Inquiries', 'Agents'] },
  { title: 'Food Delivery App', badge: 'Delivery', img: 'photo-1601972602237-8c79241e468b', prompt: 'Build a food delivery app with restaurants, cart, order tracking and checkout', desc: 'Browse restaurants, fill a cart, pay and follow the order live from kitchen to doorstep.', features: ['Restaurants', 'Cart', 'Order tracking', 'Checkout'] },
  { title: 'SaaS Landing Page', badge: 'SaaS', img: 'photo-1460925895917-afdab827c52f', prompt: 'Build a SaaS landing page with hero, features, pricing and signup', desc: 'A high-converting launch page with a bold hero, feature highlights, pricing tiers and a clear signup call to action.', features: ['Hero', 'Features', 'Pricing', 'Signup'] },
  { title: 'Analytics Dashboard', badge: 'Dashboard', img: 'photo-1551288049-bebda4e38f71', prompt: 'Build an analytics dashboard with charts, KPIs and data tables', desc: 'Track the numbers that matter with live KPIs, clean charts and sortable tables in a tidy admin layout.', features: ['Charts', 'KPIs', 'Tables', 'Filters'] },
  { title: 'Online Course Platform', badge: 'E-learning', img: 'photo-1501504905252-473c47e087f8', prompt: 'Build an online course platform with lessons, progress tracking and student dashboard', desc: 'Teach online with course catalogs, video lessons, quizzes and a student dashboard that tracks progress.', features: ['Courses', 'Lessons', 'Quizzes', 'Progress'] },
  { title: 'Event Booking', badge: 'Events', img: 'photo-1540575467063-178a50c2df87', prompt: 'Build an event booking website with schedule, tickets and registration', desc: 'Promote your event with a speaker schedule, ticket tiers and a simple registration flow.', features: ['Schedule', 'Tickets', 'Speakers', 'Register'] },
  { title: 'Travel Agency', badge: 'Travel', img: 'photo-1488646953014-85cb44e25828', prompt: 'Build a travel agency website with destinations, tour packages and booking inquiries', desc: 'Inspire wanderlust with destination galleries, tour packages and inquiry forms that turn visitors into travelers.', features: ['Destinations', 'Packages', 'Gallery', 'Inquiries'] },
  { title: 'Job Board', badge: 'Careers', img: 'photo-1521737604893-d14cc237f11d', prompt: 'Build a job board with listings, search filters and applications', desc: 'Connect talent and employers with searchable listings, category filters and a quick application form.', features: ['Listings', 'Search', 'Apply', 'Employers'] },
];

const THUMB_GRADIENTS = [
  'from-volt/30 via-emerald-900/40 to-bg',
  'from-violet-500/30 via-indigo-900/40 to-bg',
  'from-amber-400/25 via-rose-900/40 to-bg',
  'from-sky-400/25 via-slate-900/40 to-bg',
];

export default function Dashboard({ account, onCredits, onAccount, onSignOut }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [mode, setMode] = useState<UiMode>('build');
  const [chat, setChat] = useState<{ session: ChatSession; prompt?: string; mode?: UiMode } | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [pricing, setPricing] = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [quick, setQuick] = useState('');
  const [templatePreview, setTemplatePreview] = useState<TemplateItem | null>(null);
  const [templatesPage, setTemplatesPage] = useState(false);
  const [connectorsPage, setConnectorsPage] = useState(false);
  const [settingsPage, setSettingsPage] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Load saved projects from the SQLite database.
  useEffect(() => {
    loadProjects().then(setProjects).catch(() => undefined);
    loadSessions().then(setSessions).catch(() => undefined);
  }, []);

  // Background builds: read live status from Supabase while the Projects list is open.
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  useEffect(() => {
    if (tab !== 'projects') return;
    let on = true;
    const tick = () => {
      loadActiveJobs().then((j) => {
        if (!on) return;
        setJobs((prev) => {
          if (prev.length > j.length) loadProjects().then(setProjects).catch(() => undefined); // a build just finished
          return j;
        });
      }).catch(() => undefined);
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => { on = false; clearInterval(t); };
  }, [tab]);

  // Returning from Pesapal checkout: confirm the payment and add credits.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('pay');
    if (!ref) return;
    window.history.replaceState({}, '', window.location.pathname);
    api<{ credited: boolean; added: number; credits: number; status: string }>(`/api/pay/verify?ref=${encodeURIComponent(ref)}`).then((d) => {
      if (d.error) return notify(d.error);
      onCredits(d.credits);
      notify(d.credited ? `${d.added.toLocaleString()} credits added to your account.` : `Payment ${d.status}. Credits are added once it completes.`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const [prefill, setPrefill] = useState({ text: '', n: 0 });

  // Refresh the project list whenever the menu opens so new builds appear.
  useEffect(() => {
    if (menuOpen) loadProjects().then(setProjects).catch(() => undefined);
  }, [menuOpen]);

  // Refresh after leaving a chat (a build may have just saved a project).
  useEffect(() => {
    if (!chat) loadProjects().then(setProjects).catch(() => undefined);
  }, [chat]);

  // Track the visible viewport so the layout shrinks above the on-screen keyboard.
  const [vvH, setVvH] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const upd = () => setVvH(window.innerHeight - vv.height > 120 ? Math.round(vv.height) : null);
    upd();
    vv.addEventListener('resize', upd);
    return () => vv.removeEventListener('resize', upd);
  }, []);
  const kbOpen = vvH !== null;
  const [tplQuery, setTplQuery] = useState('');
  const filteredCards = TEMPLATE_CARDS.filter((c) => {
    const q = tplQuery.trim().toLowerCase();
    return !q || `${c.title} ${c.badge} ${c.desc} ${c.features.join(' ')}`.toLowerCase().includes(q);
  });

  // Any prompt (Build, Plan or Chat) opens its own saved chat session.
  async function run(prompt: string) {
    if (busy) return;
    setBusy(true);
    const [s] = await Promise.all([createSession(account.id, prompt, mode), new Promise((r) => setTimeout(r, 1200))]);
    setBusy(false);
    if (!s) return notify('Could not start a chat. Please try again.');
    setChat({ session: s, prompt, mode });
    setSessions((p) => [s, ...p]);
  }

  function openSession(s: ChatSession) {
    setTab('home');
    setChat({ session: s });
  }

  async function removeProject(p: Project) {
    if (p.id === undefined) return notify('Reopen the app to delete this project.');
    if (!window.confirm('Are you sure you want to delete this project?')) return;
    const err = await deleteProject(p.id);
    if (err) return notify(`Could not delete: ${err}`);
    setPreviewIdx(null);
    setProjects((prev) => prev.filter((x) => x.id !== p.id));
    notify('Project deleted.');
  }

  async function removeSession(s: ChatSession) {
    if (!window.confirm('Delete this chat and its messages?')) return;
    const err = await deleteSession(s.id);
    if (err) return notify(`Could not delete: ${err}`);
    setSessions((prev) => prev.filter((x) => x.id !== s.id));
    notify('Chat deleted.');
  }

  const previewing = previewIdx !== null ? projects[previewIdx] : null;

  return (
    <div style={kbOpen ? { height: vvH! } : undefined} className="flex h-dvh w-full flex-col overflow-hidden bg-bg text-fg">
      <LoadingOverlay show={busy} />
      <Header account={account} onMenu={() => setMenuOpen(true)} onBuy={() => setPricing(true)} />

      <Sidebar
        open={menuOpen}
        account={account}
        projects={projects}
        onClose={closeMenu}
        onOpenProject={(i) => setPreviewIdx(i)}
        onDeleteProject={removeProject}
        onNewProject={() => { setChat(null); setPreviewIdx(null); setTab('home'); setMode('build'); setPrefill((p) => ({ text: '', n: p.n + 1 })); }}
        onTemplates={() => setTemplatesPage(true)}
        onConnectors={() => setConnectorsPage(true)}
        onSettings={() => setSettingsPage(true)}
        onBuy={() => setPricing(true)}
        onSignOut={onSignOut}
      />

      <main className="flex min-h-0 flex-1 flex-col items-center overflow-hidden px-4">
        <div className={`mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col items-center gap-5 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-6 ${kbOpen ? 'justify-end' : 'justify-center'}`}>
          <h1 className={`shrink-0 text-center font-semibold leading-tight tracking-tight ${kbOpen ? 'text-2xl' : 'text-4xl sm:text-5xl'}`}>
            What can <span className="bg-gradient-to-r from-volt to-emerald-300 bg-clip-text text-transparent">SwiftBuild AI</span> build for you?
          </h1>
          <div className={`w-full transition-all duration-500 ${busy ? 'pointer-events-none translate-y-2 opacity-0' : 'opacity-100'}`}>
            <Composer
              busy={busy}
              mode={mode}
              onModeChange={setMode}
              onSubmit={run}
              prefill={prefill}
              onAttach={(names) => notify(`Attached ${names.length > 1 ? names.length + ' files' : names[0]}.`)}
            />
            {!kbOpen && (
              <div className="mt-3">
                <div className="flex flex-wrap justify-center gap-2.5">
                  {TEMPLATE_CARDS.slice(0, 10).map((c) => (
                    <button
                      key={c.title}
                      onClick={() => setPrefill({ text: c.prompt, n: Date.now() })}
                      className="rounded-full border border-line-strong bg-panel/70 px-4 py-2 text-sm text-muted transition hover:border-volt/60 hover:text-fg active:scale-95"
                    >
                      {c.title}
                    </button>
                  ))}
                  <button
                    onClick={() => setTemplatesPage(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-volt/50 bg-volt/10 px-4 py-2 text-sm font-medium text-volt transition hover:bg-volt/20 active:scale-95"
                  >
                    More templates <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </main>

      {tab === 'projects' && (
        <div className="fixed inset-x-0 bottom-20 top-14 z-30 overflow-y-auto bg-bg px-4 py-5">
          <div className="mx-auto w-full max-w-5xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Projects</h2>
            </div>
            {sessions.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-faint">Chats</h3>
                <div className="grid grid-cols-1 gap-3">
                  {sessions.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-xl border border-line bg-panel p-3 transition hover:border-volt/50">
                      <button
                        onClick={() => removeSession(s)}
                        aria-label={`Delete ${s.title}`}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-red-500/15 hover:text-red-400 active:scale-90"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button onClick={() => openSession(s)} className="flex min-w-0 flex-1 items-center gap-3 text-left active:scale-[0.99]">
                        <MessageSquare size={15} className="shrink-0 text-volt" />
                        <span className="min-w-0 flex-1 break-words text-sm leading-snug">{s.title}</span>
                        <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[10px] capitalize text-muted">{s.mode}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {projects.length === 0 && sessions.length === 0 && jobs.length === 0 ? (
              <p className="py-10 text-center text-sm text-faint">No projects yet. Go Home and describe an app to start.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {jobs.map((j) => {
                  const s = sessions.find((x) => x.id === j.session_id);
                  return (
                    <button
                      key={j.id}
                      onClick={() => s && openSession(s)}
                      className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3 text-left transition hover:border-amber-400/50 active:scale-[0.99]"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-400/10 text-amber-400"><Globe size={18} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-medium leading-snug">{j.title || j.prompt.slice(0, 80)}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-faint">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2 py-0.5 font-medium text-amber-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />Building...</span>
                          <span>{new Date(j.created_at).toLocaleDateString()}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
                {projects.map((p, i) => (
                  <div key={String(p.id ?? p.title + i)} className="flex items-center gap-2 rounded-xl border border-line bg-panel p-3 transition hover:border-volt/50">
                    <button
                      onClick={() => removeProject(p)}
                      aria-label={`Delete ${p.title}`}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-red-500/15 hover:text-red-400 active:scale-90"
                    >
                      <Trash2 size={16} />
                    </button>
                    <button onClick={() => setPreviewIdx(i)} className="flex min-w-0 flex-1 items-center gap-3 text-left active:scale-[0.99]">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-volt/10 text-volt"><Globe size={18} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-medium leading-snug">{p.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-faint">
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-400">Ready</span>
                          {p.createdAt && <span>{new Date(p.createdAt).toLocaleDateString()}</span>}
                          <span>{p.files.length} files</span>
                        </span>
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <BottomNav tab={tab} onTab={setTab} />

      {settingsPage && (
        <SettingsPage account={account} onClose={() => setSettingsPage(false)} onBuy={() => setPricing(true)} onAccount={(p) => onAccount?.(p)} />
      )}
      {connectorsPage && <ConnectorsPage account={account} onClose={() => setConnectorsPage(false)} />}

      {templatesPage && (
        <TemplatesPage account={account} onClose={() => setTemplatesPage(false)} onPreview={(t) => setTemplatePreview(t)} onBuy={() => setPricing(true)} />
      )}

      {(previewing || templatePreview) && (
        <div className="fixed inset-0 z-50 flex animate-pop flex-col bg-bg">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4 text-sm">
            <span className="truncate font-medium">
              {previewing ? previewing.title : <>Template preview · {templatePreview?.name}</>}
            </span>
            <div className="flex items-center gap-2">
              {previewing && <PublishMenu account={account} sessionId={null} project={previewing} onBuy={() => setPricing(true)} notify={notify} />}
              <button
                onClick={() => {
                  setPreviewIdx(null);
                  setTemplatePreview(null);
                }}
                className="rounded-lg px-2.5 py-1 text-muted transition hover:bg-raised hover:text-fg active:scale-95"
              >
                Close
              </button>
            </div>
          </div>
          <div className={`flex min-h-0 flex-1 flex-col ${previewing ? 'pb-14' : ''}`}>
            <iframe
              title="Preview"
              sandbox="allow-scripts"
              srcDoc={previewing ? previewDoc(previewing.files, { storageKey: 'project-' + String(previewing.id ?? previewIdx) }) : templatePreviewDoc(templatePreview!)}
              className="min-h-0 flex-1 bg-white"
            />
          </div>
          {previewing && (
            <button
              type="button"
              aria-label="Back to chat"
              onClick={() => { setPreviewIdx(null); const s = sessions[0]; if (s) setChat({ session: s }); }}
              className="fixed bottom-5 left-5 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/90 text-zinc-100 shadow-lg active:scale-95"
            >
              <MessageCircle size={20} />
            </button>
          )}
        </div>
      )}

      {chat && (
        <ChatView
          key={chat.session.id}
          account={account}
          session={chat.session}
          firstPrompt={chat.prompt}
          firstMode={chat.mode}
          onClose={() => setChat(null)}
          onCredits={onCredits}
          onBuy={() => setPricing(true)}
          onProject={(p) => setProjects((prev) => [p, ...prev])}
          notify={notify}
        />
      )}

      {pricing && <PricingModal balance={account.credits} onClose={() => setPricing(false)} />}

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[60] flex max-w-[calc(100%-24px)] -translate-x-1/2 animate-pop items-center gap-2 rounded-lg border border-line-strong bg-raised px-4 py-2.5 text-sm shadow-xl">
          <CheckCircle2 size={16} className="shrink-0 text-volt" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
