import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Code2, Eye, FileCode2, MessageSquare } from 'lucide-react';
import { streamGenerate, startBuild, pollBuild, resumeBuild, supabase, type Account, type BuildFile } from '../lib/auth';
import { estimateCost } from '../lib/costs';
import type { Project, ProjectFile } from '../lib/generator';
import { loadMessages, saveMessage, type ChatMessage, type ChatSession } from '../lib/chat';
import { previewDoc } from '../lib/preview';
import Composer, { type UiMode } from './Composer';
import PublishMenu from './PublishMenu';
import LivePreviewCard from './LivePreviewCard';

const BASE_HTML = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100vh;background:#0b0f0d;color:#9aa8a0;font:14px ui-sans-serif,system-ui,sans-serif}#root:empty::before{content:"Starting your app…";display:grid;place-items:center;height:100vh}</style></head><body><div id="root"></div></body></html>';
const BASE_FILE: ProjectFile = { name: 'index.html', lang: 'html', content: BASE_HTML } as ProjectFile;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Props {
  account: Account;
  session: ChatSession;
  firstPrompt?: string;
  firstMode?: UiMode;
  onClose: () => void;
  onCredits: (n: number) => void;
  onBuy: () => void;
  onProject: (p: Project) => void;
  notify: (m: string) => void;
}

type Pane = 'chat' | 'preview';

export default function ChatView({ account, session, firstPrompt, firstMode, onClose, onCredits, onBuy, onProject, notify }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState('');
  const [mode, setMode] = useState<UiMode>(firstMode || (session.mode as UiMode) || 'build');
  const [pane, setPane] = useState<Pane>('chat');
  const [view, setView] = useState<'preview' | 'code'>('preview');
  const [fileIdx, setFileIdx] = useState(0);
  const [, setActiveJob] = useState<string | null>(null);
  const [liveFiles, setLiveFiles] = useState<BuildFile[]>([]);
  const [liveProj, setLiveProj] = useState<ProjectFile[]>([]);
  const credits = useRef(account.credits);
  const started = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  credits.current = account.credits;

  // Follow the visible viewport so the layout sits above the on-screen keyboard.
  const [vvH, setVvH] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const upd = () => setVvH(window.innerHeight - vv.height > 120 ? Math.round(vv.height) : null);
    upd();
    vv.addEventListener('resize', upd);
    return () => vv.removeEventListener('resize', upd);
  }, []);

  const project: Project | null = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant' && m.files && m.files.length) return { title: m.title || session.title, mode: m.mode === 'plan' ? 'plan' : 'build', files: m.files as ProjectFile[] };
    }
    return null;
  }, [messages, session.title]);

  const history = useCallback(
    () =>
      messages
        .slice(-4)
        .map((x) => `${x.role === 'user' ? 'User' : 'Assistant'}: ${x.content.slice(0, 300)}`)
        .join('\n'),
    [messages],
  );

  /**
   * Builds use the modular pipeline: a background job plans the files and writes each one
   * into Supabase. The client polls the job and shows every file as it lands in the live preview.
   * Chat and Plan still stream text directly.
   */
  const runBuild = useCallback(
    async (prompt: string, m: UiMode, ans?: { question: string; answer: string }[], questionnaireId?: string | null) => {
      const est = estimateCost(prompt);
      setBusy(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        setLive('');
        if (m !== 'build') {
          const h = history();
          const full = h ? `Conversation so far:\n${h}\n\nNew request: ${prompt}` : prompt;
          const d = await streamGenerate<{ text?: string; project?: Project; cost: number; credits: number; id?: number | string }>(
            { prompt: full.slice(0, 3900), heavy: est.heavy, estCost: est.cost, mode: m, answers: ans },
            (t) => setLive((s) => (s + t).slice(-1200)),
            ctrl.signal,
          );
          if (d.stopped) return void notify('Stopped. You were not charged.');
          if (d.status === 402) {
            notify('You need credits for this. Top up to continue.');
            onBuy();
            throw new Error('Not enough credits.');
          }
          if (d.error) throw new Error(d.error);
          onCredits(d.credits);
          const content = d.text || 'Done.';
          const reply: Omit<ChatMessage, 'id'> = { role: 'assistant', mode: m, content, files: d.project?.files ?? null, title: d.project?.title ?? null, cost: d.cost };
          setMessages((p) => [...p, { ...reply, id: 'a' + Date.now() }]);
          void saveMessage(account.id, session.id, reply);
          if (d.project) {
            onProject({ ...d.project, id: d.id });
            setFileIdx(0);
          }
          return;
        }

        // Build: the sandbox lights up instantly with a base index.html, then fills in as files land.
        setLiveProj([BASE_FILE]);
        const started = await startBuild({ prompt: prompt.slice(0, 3900), answers: ans, sessionId: session.id, questionnaireId: questionnaireId || undefined });
        if (started.status === 402) {
          notify('You need credits for this. Top up to continue.');
          onBuy();
          throw new Error('Not enough credits.');
        }
        if (!started.jobId) throw new Error(started.error || 'Could not start the build.');
        const jobId = started.jobId;
        setActiveJob(jobId);

        // Poll until finished. Each poll reads the files written so far, so the preview grows live.
        // The job runs on the server, so a dropped connection or a long build doesn't cancel it.
        let resumes = 0;
        let retries = 0;
        let lastResume = 0;
        let lastDone = 0;
        for (;;) {
          if (ctrl.signal.aborted) {
            notify('Stopped. The build was cancelled and you were not charged.');
            break;
          }
          const r = await pollBuild(jobId);
          if (r.error) {
            // Transient network hiccup: keep polling rather than failing the build.
            await sleep(2000);
            continue;
          }
          const files = (r.files || []).filter((f) => f.content && (f.status === 'done' || f.name === 'index.html')).map((f) => ({ name: f.name, lang: f.lang as ProjectFile['lang'], content: f.content as string }));
          const doneNow = (r.files || []).filter((f) => f.status === 'done').length;
          if (doneNow > lastDone) { lastDone = doneNow; resumes = 0; retries = 0; } // progress made: reset stall counters
          setLiveFiles(r.files || []);
          if (files.length) setLiveProj(files.some((f) => f.name === 'index.html' && f.content.trim()) ? files : [BASE_FILE, ...files]);
          if (files.length) onProject({ title: r.job?.title || session.title, mode: 'build', files });
          if (r.job?.status === 'error') {
            // A file failed: keep everything already written and continue only the missing files (up to 3 times).
            if (retries < 3) {
              retries++;
              const rr = await resumeBuild(jobId, true);
              if (rr.resumed) { lastResume = Date.now(); await sleep(1500); continue; }
            }
            const kept = files.filter((f) => f.name !== 'index.html' || f.content.trim()).length;
            throw new Error(`${r.job.error || 'The build stopped.'}${kept ? ` Your ${kept} finished file(s) are kept in the Preview.` : ''} You were not charged. Send the prompt again to retry.`);
          }
          // Never stay stuck: if the server job has made no progress for 4 minutes, give up with a clear message.
          const upd = r.job && (r.job as { updated_at?: string }).updated_at;
          // If the server worker went quiet, resume from the files already saved (up to 8 times).
          if (upd && r.job?.status !== 'done' && Date.now() - new Date(upd).getTime() > 30_000 && Date.now() - lastResume > 15_000) {
            if (resumes >= 8) throw new Error('The build kept stalling on the server and was stopped. You were not charged. Please try again.');
            lastResume = Date.now();
            resumes++;
            await resumeBuild(jobId);
          }
          if (r.job?.status === 'done') {
            const doneFiles = files;
            const cost = r.job.cost;
            if (typeof r.job.project_id !== 'undefined') onProject({ id: r.job.project_id ?? undefined, title: r.job.title || session.title, mode: 'build', files: doneFiles });
            const { data: bal } = await supabase.from('profiles').select('credits').eq('id', account.id).single();
            if (bal) onCredits(bal.credits as number);
            const content = `Built “${r.job.title || session.title}”, ${doneFiles.length} files. Open Preview to see it live.`;
            const reply: Omit<ChatMessage, 'id'> = { role: 'assistant', mode: 'build', content, files: doneFiles, title: r.job.title, cost };
            setMessages((p) => [...p, { ...reply, id: 'a' + Date.now() }]);
            void saveMessage(account.id, session.id, reply);
            setFileIdx(0);
            break;
          }
          await sleep(800);
        }
      } catch (e) {
        const err = e instanceof Error ? e.message : 'Something went wrong.';
        setMessages((p) => [...p, { id: 'e' + Date.now(), role: 'assistant', mode: m, content: err, cost: 0 }]);
      } finally {
        abortRef.current = null;
        setActiveJob(null);
        setLiveFiles([]);
        setLiveProj([]);
        setBusy(false);
        setLive('');
      }
    },
    [account.id, history, notify, onBuy, onCredits, onProject, session.id, session.title],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (prompt: string, m: UiMode) => {
      const base = estimateCost(prompt);
      const est = m === 'build' ? base : { heavy: false, cost: m === 'chat' ? 0 : Math.min(base.cost, 2) };
      if (credits.current < est.cost) {
        notify(`You need ${est.cost} credits for this. Top up to continue.`);
        onBuy();
        return;
      }
      const userMsg: Omit<ChatMessage, 'id'> = { role: 'user', mode: m, content: prompt, cost: 0 };
      setMessages((p) => [...p, { ...userMsg, id: 'u' + Date.now() }]);
      void saveMessage(account.id, session.id, userMsg);

      // Every prompt goes straight to the build: no questions.
      await runBuild(prompt, m);
    },
    [account.id, notify, onBuy, runBuild, session.id],
  );

  // Load saved messages, then send the prompt that opened this session.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    loadMessages(session.id).then((rows) => {
      setMessages(rows);
      setLoaded(true);
      if (!rows.length && firstPrompt) void send(firstPrompt, firstMode || 'build');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, busy, pane]);

  const building = busy;
  const shown: Project | null = building && liveProj.length ? { title: session.title, mode: 'build', files: liveProj } : project;
  const file = shown?.files[fileIdx] || shown?.files[0];

  return (
    <div style={vvH ? { height: vvH } : undefined} className="fixed inset-x-0 top-0 z-[55] flex h-dvh flex-col bg-bg text-fg">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-5">
        <button onClick={onClose} aria-label="Back to home" className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-panel transition hover:border-volt/50 active:scale-95">
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{project?.title || session.title}</h1>
          <p className="text-[11px] text-faint">{account.credits.toLocaleString()} credits left</p>
        </div>
        <PublishMenu userId={account.id} sessionId={session.id} project={project} onBuy={onBuy} notify={notify} />
      </header>

      {/* mobile pane switch */}
      <div role="tablist" className="flex shrink-0 gap-1 border-b border-line p-1.5 md:hidden">
        {(['chat', 'preview'] as Pane[]).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={pane === p}
            onClick={() => setPane(p)}
            className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-medium capitalize transition ${pane === p ? 'bg-raised text-fg' : 'text-muted'}`}
          >
            {p === 'chat' ? <MessageSquare size={14} /> : <Eye size={14} />} {p}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* chat column */}
        <section className={`${pane === 'chat' ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col md:flex md:max-w-[460px] md:border-r md:border-line lg:max-w-[520px]`}>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-4">
            {!loaded && <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-volt border-t-transparent" />}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user' ? 'rounded-br-md bg-volt text-volt-ink' : 'rounded-bl-md border border-line bg-panel'
                  }`}
                >
                  {m.content}
                  {m.role === 'assistant' && m.files && (
                    <button
                      onClick={() => { setPane('preview'); setView('preview'); }}
                      className="mt-2 flex items-center gap-1.5 rounded-lg border border-line-strong bg-raised px-2.5 py-1.5 text-xs font-medium text-fg transition hover:border-volt/50"
                    >
                      <FileCode2 size={13} className="text-volt" /> {m.title || 'Project'} · {m.files.length} files
                    </button>
                  )}
                  {m.role === 'assistant' && m.cost > 0 && <span className="mt-1 block text-[11px] text-faint">Used {m.cost} credit{m.cost === 1 ? '' : 's'}</span>}
                  {m.role === 'assistant' && m.mode === 'chat' && m.cost === 0 && !m.content.startsWith('OpenAI') && <span className="mt-1 block text-[11px] text-faint">Free</span>}
                </div>
              </div>
            ))}

            {/* Inline loading state under the prompt — the chat stays visible. */}
            {building && mode === 'build' && liveProj.length > 0 && <LivePreviewCard files={liveProj} steps={liveFiles} title={session.title} />}
            {building && mode !== 'build' && (
              <p className="text-xs text-muted">{mode === 'plan' ? 'Writing the plan…' : 'Thinking…'}</p>
            )}
            {building && mode !== 'build' && live && (
              <pre className="max-h-48 overflow-hidden whitespace-pre-wrap break-words rounded-xl border border-line bg-panel p-3 font-sans text-xs leading-relaxed text-muted">
                {live.slice(-700)}
              </pre>
            )}
            {busy && mode === 'build' && (
              <button onClick={stop} className="mx-auto block text-xs text-muted underline-offset-4 transition hover:text-red-400 hover:underline">
                Stop building
              </button>
            )}
            <div ref={endRef} />
          </div>
          <div className="shrink-0 px-3 pb-2 pt-1 sm:px-4">
            <Composer busy={busy} mode={mode} onModeChange={setMode} onSubmit={(p) => send(p, mode)} onStop={stop} onAttach={(n) => notify(`Attached ${n.length > 1 ? n.length + ' files' : n[0]}.`)} />
          </div>
        </section>

        {/* workspace column */}
        <section className={`${pane === 'preview' ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col md:flex`}>
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-3">
            {(['preview', 'code'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium capitalize transition ${view === v ? 'bg-raised text-fg' : 'text-muted hover:text-fg'}`}
              >
                {v === 'preview' ? <Eye size={14} /> : <Code2 size={14} />} {v}
              </button>
            ))}
          </div>
          {!shown ? (
            <div className="grid min-h-0 flex-1 place-items-center p-6 text-center text-sm text-faint">
              {busy ? 'Your project will appear here.' : 'Your project preview and code appear here once built.'}
            </div>
          ) : view === 'preview' ? (
            <iframe title="Preview" sandbox="allow-scripts" srcDoc={previewDoc(shown.files)} className="min-h-0 flex-1 bg-white" />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-3 py-1.5">
                {shown.files.map((f, i) => (
                  <button
                    key={f.name}
                    onClick={() => setFileIdx(i)}
                    className={`shrink-0 rounded-md px-2.5 py-1 font-mono text-xs transition ${file?.name === f.name ? 'bg-raised text-volt' : 'text-muted hover:text-fg'}`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
              <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-muted">{file?.content}</pre>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
