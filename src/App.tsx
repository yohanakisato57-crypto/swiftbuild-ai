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
  useEffect(() => {
    supabase
      .from('published_sites')
      .select('title,files')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return setMissing(true);
        document.title = data.title as string;
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
  return <iframe title="Published site" sandbox="allow-scripts allow-forms allow-popups" srcDoc={doc} className="block h-dvh w-full border-0 bg-white" />;
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
