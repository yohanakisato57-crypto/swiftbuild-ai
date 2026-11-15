import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, Check, ChevronDown, FileText, Hammer, ImageIcon, MessageSquare, Mic, NotebookPen, Plus, Square } from 'lucide-react';

interface Props {
  busy: boolean;
  mode?: UiMode;
  onModeChange?: (m: UiMode) => void;
  onSubmit: (prompt: string) => void;
  onStop?: () => void;
  onAttach: (names: string[]) => void;
}

const HINTS: Record<UiMode, string[]> = {
  build: [
    'Ask SwiftBuild to build a school website...',
    'Ask SwiftBuild to build an online delivery app...',
    'Ask SwiftBuild to build a mini puzzle game...',
    'Ask SwiftBuild to build a restaurant booking page...',
  ],
  chat: ['Ask SwiftBuild about your project...', 'Ask how to improve your layout...'],
  plan: ['Describe what to plan...', 'Plan the pages for a real estate site...'],
};

function useTypewriter(lines: string[], active: boolean) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!active) return;
    let li = 0, ci = 0, del = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const line = lines[li % lines.length];
      if (!del) {
        ci++;
        setText(line.slice(0, ci));
        if (ci === line.length) { del = true; t = setTimeout(tick, 1600); return; }
        t = setTimeout(tick, 45);
      } else {
        ci--;
        setText(line.slice(0, ci));
        if (ci === 0) { del = false; li++; t = setTimeout(tick, 350); return; }
        t = setTimeout(tick, 20);
      }
    };
    t = setTimeout(tick, 300);
    return () => clearTimeout(t);
  }, [lines, active]);
  return text;
}

export default function Composer({ busy, mode = 'build', onModeChange, onSubmit, onStop, onAttach }: Props) {
  const [prompt, setPrompt] = useState('');
  const [menu, setMenu] = useState(false);
  const [modeMenu, setModeMenu] = useState(false);
  const cur = MODES.find((m) => m.id === mode)!;
  const [listening, setListening] = useState(false);
  const [lift, setLift] = useState(0);
  const [holdH, setHoldH] = useState(0);
  const holdRef = useRef(0);
  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);
  const placeholder = useTypewriter(HINTS[mode], !prompt);

  // Keyboard avoidance: lift composer by the space the on-screen keyboard takes.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const l = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      if (l > 80 && wrapRef.current && !holdRef.current) { holdRef.current = wrapRef.current.offsetHeight; setHoldH(holdRef.current); }
      if (l <= 80) { holdRef.current = 0; setHoldH(0); setLift(0); return; }
      setLift(l);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);

  useEffect(() => {
    if (!menu && !modeMenu) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) { setMenu(false); setModeMenu(false); }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu, modeMenu]);

  const send = () => {
    if (busy || !prompt.trim()) return;
    onSubmit(prompt.trim());
    setPrompt('');
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const voice = () => {
    setMenu(false);
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Voice input is not supported in this browser.'); return; }
    if (listening) { recRef.current?.stop(); return; }
    const r = new SR();
    r.lang = 'en-US';
    r.interimResults = false;
    r.onresult = (e: any) => {
      const said = Array.from(e.results).map((x: any) => x[0].transcript).join(' ');
      setPrompt((p) => (p ? p + ' ' : '') + said);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recRef.current = r;
    setListening(true);
    r.start();
  };

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const names = Array.from(e.target.files ?? []).map((f) => f.name);
    if (names.length) onAttach(names);
    e.target.value = '';
  };

  const item = 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-fg transition hover:bg-raised active:scale-[0.98]';

  return (
    <div style={{ height: lift > 0 && holdH ? holdH : undefined }} className="w-full">
    <div
      ref={wrapRef}
      style={lift > 0 ? { position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: lift + 6, width: 'min(calc(100% - 24px), 42rem)', zIndex: 50 } : undefined}
      className="relative w-full"
    >
      {menu && (
        <div role="menu" className="absolute bottom-full left-0 z-30 mb-2 w-56 rounded-2xl border border-line-strong bg-panel p-1.5 shadow-2xl shadow-black/50">
          <button role="menuitem" className={item} onClick={() => { setMenu(false); imgRef.current?.click(); }}>
            <ImageIcon size={16} className="text-volt" /> Upload Image
          </button>
          <button role="menuitem" className={item} onClick={() => { setMenu(false); fileRef.current?.click(); }}>
            <FileText size={16} className="text-volt" /> Attach File
          </button>
          <button role="menuitem" className={item} onClick={voice}>
            <Mic size={16} className="text-volt" /> Voice Input
          </button>
        </div>
      )}
      <div className="w-full rounded-[1.75rem] border border-line-strong bg-gradient-to-b from-panel to-panel/60 p-3.5 shadow-2xl shadow-black/40 transition duration-300 focus-within:border-volt/50 focus-within:shadow-glow">
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholder || ' '}
          aria-label="Describe the app you want to build"
          className="max-h-28 min-h-[4.5rem] w-full resize-none bg-transparent px-2 pt-1 text-base leading-relaxed outline-none"
        />
        <div className="relative flex items-center justify-between gap-2 pt-2">
          <input ref={imgRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
          <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.json,.js,.ts,.tsx,.html,.css" multiple hidden onChange={onFiles} />
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { setMenu((m) => !m); setModeMenu(false); }}
              aria-label="Attach"
              aria-expanded={menu}
              className={`grid h-9 w-9 place-items-center rounded-full border border-line-strong transition hover:text-volt active:scale-90 ${menu ? 'bg-raised text-volt' : 'text-muted'}`}
            >
              <Plus size={18} className={`transition-transform ${menu ? 'rotate-45' : ''}`} />
            </button>
            <div className="relative">
              <button
                onClick={() => { setModeMenu((m) => !m); setMenu(false); }}
                aria-haspopup="menu"
                aria-expanded={modeMenu}
                className="flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-3 text-sm font-medium text-fg transition hover:bg-raised active:scale-95"
              >
                <cur.Icon size={14} className="text-volt" /> {cur.label}
                <ChevronDown size={14} className={`text-muted transition-transform ${modeMenu ? 'rotate-180' : ''}`} />
              </button>
              {modeMenu && (
                <div role="menu" className="absolute bottom-full left-0 z-30 mb-2 w-64 rounded-2xl border border-line-strong bg-panel p-1.5 shadow-2xl shadow-black/50">
                  {MODES.map(({ id, label, hint, Icon }) => (
                    <button key={id} role="menuitemradio" aria-checked={mode === id} className={item} onClick={() => { onModeChange?.(id); setModeMenu(false); }}>
                      <Icon size={16} className="text-volt" />
                      <span className="flex-1"><span className="block font-medium">{label}</span><span className="block text-xs text-muted">{hint}</span></span>
                      {mode === id && <Check size={15} className="text-volt" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={voice}
              aria-label={listening ? 'Stop recording' : 'Voice input'}
              className={`grid h-9 w-9 place-items-center rounded-full transition active:scale-90 ${listening ? 'bg-red-500/20 text-red-400' : 'text-muted hover:text-volt'}`}
            >
              <Mic size={18} className={listening ? 'animate-pulse' : ''} />
            </button>
            {busy ? (
              <button
                onClick={() => onStop?.()}
                aria-label="Stop"
                title="Stop"
                className="grid h-9 w-9 place-items-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition active:scale-90 hover:brightness-110"
              >
                <Square size={14} fill="currentColor" strokeWidth={0} />
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!prompt.trim()}
                aria-label="Send"
                className="grid h-9 w-9 place-items-center rounded-full bg-volt text-volt-ink transition-all duration-200 hover:shadow-glow active:scale-90 disabled:cursor-not-allowed disabled:bg-raised disabled:text-faint disabled:shadow-none"
              >
                <ArrowUp size={18} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

export type UiMode = 'build' | 'chat' | 'plan';

const MODES: { id: UiMode; label: string; hint: string; Icon: typeof Hammer }[] = [
  { id: 'build', label: 'Build', hint: 'Create or edit your app', Icon: Hammer },
  { id: 'chat', label: 'Chat', hint: 'Talk through your project · Free', Icon: MessageSquare },
  { id: 'plan', label: 'Plan', hint: 'Map the structure first · 1–2 credits', Icon: NotebookPen },
];

export function ModeTabs({ mode, onChange }: { mode: UiMode; onChange: (m: UiMode) => void }) {
  return (
    <div role="tablist" aria-label="Mode" className="mx-auto mt-3 flex w-full max-w-sm gap-1 rounded-2xl border border-line bg-panel/70 p-1">
      {MODES.map(({ id, label, hint, Icon }) => (
        <button
          key={id}
          role="tab"
          aria-selected={mode === id}
          title={hint}
          onClick={() => onChange(id)}
          className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition active:scale-95 ${
            mode === id ? 'bg-volt text-volt-ink shadow-glow' : 'text-muted hover:bg-raised hover:text-fg'
          }`}
        >
          <Icon size={15} />
          {label}
        </button>
      ))}
    </div>
  );
}
