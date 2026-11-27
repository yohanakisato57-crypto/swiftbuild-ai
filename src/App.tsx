import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import AuthScreen from './components/AuthScreen';
import Dashboard from './components/Dashboard';
import { previewDoc } from './lib/preview';
import type { ProjectFile } from './lib/generator';
import { getSession, signOut, supabase, type Account } from './lib/auth';

/** Public view of a published project: /?site=<slug> */
function PublicSite({ slug }: { slug: string }) {
  const [doc, setDoc] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [badge, setBadge] = useState(false);
  const clientView = new URLSearchParams(window.location.search).get('view') === 'client';
  useEffect(() => {
    supabase
      .from('published_sites')
      .select('title,files,show_badge')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return setMissing(true);
        document.title = data.title as string;
        setBadge(data.show_badge !== false);
        if (!clientView) void supabase.from('site_views').insert({ slug, referrer: document.referrer.slice(0, 200) || null });
        setDoc(previewDoc(data.files as ProjectFile[]));
      });
  }, [slug]);
  if (missing) return <div className="grid h-dvh place-items-center bg-bg text-sm text-muted">This site is not published.</div>;
  if (!doc)
    return (
      <div className="grid h-dvh w-full place-items-center bg-bg text-volt">
        <Loader2 className="animate-spin" />
      </div>
    );
  return (
    <div className="relative h-dvh w-full">
      <iframe title="Published site" sandbox="allow-scripts allow-forms allow-popups" srcDoc={doc} className="block h-dvh w-full border-0 bg-white" />
      {badge && !clientView && (
        <a
          href={window.location.origin}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-3 right-3 z-50 flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0b0f0d]/90 px-3 py-1.5 text-xs font-medium text-[#eef3ef] shadow-lg shadow-black/30 transition hover:-translate-y-0.5 hover:border-[#c6ff3d]/60"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#c6ff3d]" /> Built with <b className="font-semibold text-[#c6ff3d]">SwiftBuild AI</b>
        </a>
      )}
    </div>
  );
}

export default function App() {
  const slug = new URLSearchParams(window.location.search).get('site');
  return slug ? <PublicSite slug={slug} /> : <Main />;
}

function Main() {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession()
      .then(setAccount)
      .finally(() => setLoading(false));
  }, []);

  // Live Auth: pick up the session when Google redirects back (or on any sign-in/out).
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        void getSession().then((a) => {
          if (a) setAccount(a);
          setLoading(false);
        });
      } else if (event === 'SIGNED_OUT') setAccount(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Live Sync: the credit balance follows the database (payments, deductions) in real time.
  const uid = account ? account.email : null;
  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel('profile-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (p) => {
        const c = (p.new as { credits?: number }).credits;
        if (typeof c === 'number') setAccount((prev) => (prev ? { ...prev, credits: c } : prev));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [uid]);

  // Activity tracking: last_seen_at + total time in app (heartbeat while the tab is visible).
  useEffect(() => {
    if (!uid) return;
    const beat = () => {
      if (document.visibilityState === 'visible') void supabase.rpc('touch_presence');
    };
    beat();
    const t = window.setInterval(beat, 60000);
    document.addEventListener('visibilitychange', beat);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [uid]);

  if (loading)
    return (
      <div className="grid h-dvh w-full place-items-center bg-bg text-volt">
        <Loader2 className="animate-spin" />
      </div>
    );

  if (!account) return <AuthScreen onAuth={setAccount} />;

  return (
    <Dashboard
      account={account}
      onCredits={(credits) => setAccount((prev) => (prev ? { ...prev, credits } : prev))}
      onAccount={(p) => setAccount((prev) => (prev ? { ...prev, ...p } : prev))}
      onSignOut={() => {
        void signOut();
        setAccount(null);
      }}
    />
  );
}
