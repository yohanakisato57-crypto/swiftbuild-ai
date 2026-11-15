import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Globe, MessageSquare, Trash2 } from 'lucide-react';
import BottomNav, { type Tab } from './BottomNav';
import { api, deleteProject, loadProjects, type Account } from '../lib/auth';
import type { Project } from '../lib/generator';
import LoadingOverlay from './LoadingOverlay';
import { createSession, loadSessions, type ChatSession } from '../lib/chat';
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
        onTemplates={() => setTemplatesPage(true)}
        onConnectors={() => setConnectorsPage(true)}
        onSettings={() => setSettingsPage(true)}
        onBuy={() => setPricing(true)}
        onSignOut={onSignOut}
      />

      <main className="flex min-h-0 flex-1 flex-col items-center overflow-hidden px-4">
        <div className={`mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col items-center gap-5 pb-2 sm:gap-6 ${kbOpen ? 'justify-end' : 'justify-center'}`}>
          <h1 className={`shrink-0 text-center font-semibold leading-tight tracking-tight ${kbOpen ? 'text-2xl' : 'text-4xl sm:text-5xl'}`}>
            What can <span className="bg-gradient-to-r from-volt to-emerald-300 bg-clip-text text-transparent">SwiftBuild AI</span> build for you?
          </h1>
          <div className={`w-full transition-all duration-500 ${busy ? 'pointer-events-none translate-y-2 opacity-0' : 'opacity-100'}`}>
            <Composer
              busy={busy}
              mode={mode}
              onModeChange={setMode}
              onSubmit={run}
              onAttach={(names) => notify(`Attached ${names.length > 1 ? names.length + ' files' : names[0]}.`)}
            />
          </div>
        </div>

      </main>

      {tab === 'projects' && (
        <div className="fixed inset-x-0 bottom-20 top-14 z-30 overflow-y-auto bg-bg px-4 py-5">
          <div className="mx-auto w-full max-w-5xl">
            <h2 className="mb-4 text-xl font-semibold">Projects</h2>
            {sessions.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-faint">Chats</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {sessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => openSession(s)}
                      className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-left transition hover:border-volt/50 active:scale-[0.98]"
                    >
                      <MessageSquare size={15} className="shrink-0 text-volt" />
                      <span className="min-w-0 flex-1 truncate text-sm">{s.title}</span>
                      <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[10px] capitalize text-muted">{s.mode}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {projects.length === 0 ? (
              <p className="py-10 text-center text-sm text-faint">No projects yet. Go Home and describe an app to start.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {projects.map((p, i) => (
                  <div key={String(p.id ?? p.title + i)} className="group relative">
                    <button
                      onClick={() => setPreviewIdx(i)}
                      className="block w-full overflow-hidden rounded-xl border border-line bg-panel text-left transition duration-300 hover:-translate-y-1 hover:border-volt/50 active:scale-[0.98]"
                    >
                      <div className={`relative h-24 bg-gradient-to-br ${THUMB_GRADIENTS[i % THUMB_GRADIENTS.length]}`}>
                        <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-md bg-black/40 text-volt">
                          <Globe size={13} />
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 p-2.5">
                        <span className="truncate text-sm font-medium">{p.title}</span>
                        <span className="shrink-0 text-[11px] text-faint">{p.files.length} files</span>
                      </div>
                    </button>
                    <button
                      onClick={() => removeProject(p)}
                      aria-label={`Delete ${p.title}`}
                      className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md bg-black/50 text-muted transition hover:bg-red-500/20 hover:text-red-400 active:scale-90"
                    >
                      <Trash2 size={13} />
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
              {previewing && <PublishMenu userId={account.id} sessionId={null} project={previewing} onBuy={() => setPricing(true)} notify={notify} />}
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
          <iframe
            title="Preview"
            sandbox="allow-scripts"
            srcDoc={previewing ? previewDoc(previewing.files) : templatePreviewDoc(templatePreview!)}
            className="min-h-0 flex-1 bg-white"
          />
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
