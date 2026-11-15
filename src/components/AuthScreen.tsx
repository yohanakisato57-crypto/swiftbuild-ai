import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, Gift, Loader2, Zap } from 'lucide-react';
import { FREE_CREDITS, signIn, signInWithGoogle, signUp, type Account } from '../lib/auth';

const LINES = [
  { t: '$ swiftbuild "habit tracker with streaks"', c: 'text-fg' },
  { t: '✓ planned 3 files', c: 'text-volt' },
  { t: '✓ wrote index.html', c: 'text-volt' },
  { t: '✓ wrote styles.css', c: 'text-volt' },
  { t: '✓ wrote script.js', c: 'text-volt' },
  { t: '→ preview ready in 2.1s', c: 'text-muted' },
];

export default function AuthScreen({ onAuth }: { onAuth: (a: Account) => void }) {
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'signup';

  async function google() {
    setError('');
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const m = err instanceof Error ? err.message : '';
      setError(/provider|enabled|client/i.test(m) ? 'Google sign-in is not enabled yet in Supabase (Authentication → Providers → Google).' : m || 'Google sign-in failed.');
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    setBusy(true);
    try {
      const acc = isSignup ? await signUp(email, password) : await signIn(email, password);
      onAuth(acc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <div className="h-dvh w-full overflow-hidden bg-bg text-fg flex">
      {/* Brand panel */}
      <aside className="hidden lg:flex relative flex-1 flex-col justify-between overflow-hidden border-r border-line bg-grid p-12">
        <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-volt/15 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-volt text-volt-ink">
            <Zap size={18} strokeWidth={2.5} />
          </span>
          <span className="text-lg font-semibold tracking-tight">SwiftBuild AI</span>
        </div>

        <div className="relative max-w-lg">
          <h1 className="text-5xl font-semibold leading-tight tracking-tight animate-fade-up">
            Describe it.
            <br />
            <span className="text-volt">Ship it in seconds.</span>
          </h1>
          <p className="mt-4 max-w-md text-base text-muted animate-fade-up" style={{ animationDelay: '80ms' }}>
            A cloud IDE that plans, writes and previews your app while you watch. Edit any file and the preview follows.
          </p>

          <div className="mt-8 animate-drift">
            <div className="rounded-xl border border-line-strong bg-panel/90 shadow-2xl">
              <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-danger/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-gold/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-volt/80" />
                <span className="ml-3 font-mono text-xs text-faint">terminal</span>
              </div>
              <div className="space-y-1.5 p-4 font-mono text-sm">
                {LINES.map((l, i) => (
                  <div key={i} className={`${l.c} animate-fade-up`} style={{ animationDelay: `${400 + i * 350}ms` }}>
                    {l.t}
                  </div>
                ))}
                <span className="inline-block h-4 w-2 translate-y-0.5 bg-volt animate-blink" />
              </div>
            </div>
          </div>
        </div>

        <p className="relative text-sm text-faint">Plan mode for blueprints. Build mode for working code.</p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-volt text-volt-ink">
              <Zap size={18} strokeWidth={2.5} />
            </span>
            <span className="text-lg font-semibold tracking-tight">SwiftBuild AI</span>
          </div>

          <div className="mb-5 grid grid-cols-2 rounded-lg border border-line bg-panel p-1" role="tablist">
            {(['signup', 'signin'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setError('');
                }}
                className={`rounded-md py-2 text-sm font-medium transition-colors ${
                  mode === m ? 'bg-raised text-fg shadow-sm' : 'text-muted hover:text-fg'
                }`}
              >
                {m === 'signup' ? 'Create account' : 'Sign in'}
              </button>
            ))}
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">{isSignup ? 'Start building today' : 'Welcome back'}</h2>
          <p className="mt-1 text-sm text-muted">
            {isSignup ? `Get ${FREE_CREDITS} free credits the moment you sign up.` : 'Pick up where you left off.'}
          </p>

          <button
            type="button"
            onClick={google}
            disabled={busy}
            className="mt-5 flex w-full items-center justify-center gap-3 rounded-lg border border-line-strong bg-panel py-2.5 text-sm font-medium text-fg transition hover:bg-raised active:scale-[0.99] disabled:opacity-70"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.600-.4-3.900z" />
              <path fill="#FF3D00" d="M6.300 14.700l6.600 4.800C14.700 16.100 19 13 24 13c3.100 0 5.800 1.200 8 3l5.700-5.700C34 6.100 29.300 4 24 4 16.300 4 9.700 8.300 6.300 14.700z" />
              <path fill="#4CAF50" d="M24 44c5.200 0 9.900-2 13.400-5.200l-6.200-5.200C29.200 35.100 26.700 36 24 36c-5.200 0-9.600-3.300-11.300-7.900l-6.500 5C9.500 39.600 16.200 44 24 44z" />
              <path fill="#1976D2" d="M43.600 20.100H42V20H24v8h11.300c-.8 2.200-2.200 4.100-4.100 5.600l6.200 5.200C37 39.200 44 34 44 24c0-1.300-.1-2.600-.4-3.900z" />
            </svg>
            Continue with Google
          </button>

          <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wider text-faint">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={submit} className="space-y-3" noValidate>
            <div>
              <label htmlFor="email" className="mb-1 block text-xs font-medium text-muted">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-lg border border-line-strong bg-panel px-3 py-2.5 text-sm outline-none transition focus:border-volt"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-xs font-medium text-muted">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full rounded-lg border border-line-strong bg-panel py-2.5 pl-3 pr-10 text-sm outline-none transition focus:border-volt"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-fg"
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="group flex w-full items-center justify-center gap-2 rounded-lg bg-volt py-2.5 text-sm font-semibold text-volt-ink transition hover:shadow-glow active:scale-[0.99] disabled:opacity-70"
            >
              {busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  {isSignup ? 'Create account' : 'Sign in'}
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          {isSignup && (
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted">
              <Gift size={14} className="text-volt" /> {FREE_CREDITS} free credits added instantly
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
