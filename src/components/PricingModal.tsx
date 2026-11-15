import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/auth';
import PlansGrid, { planFromPacks } from './PlansGrid';

interface Props {
  balance: number;
  onClose: () => void;
}

// Full-screen "Plans & Credit Usage" view: the five official plans only.
export default function PricingModal({ balance, onClose }: Props) {
  const [currentKey, setCurrentKey] = useState('free');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    supabase
      .from('orders')
      .select('pack_id,credited')
      .eq('credited', true)
      .then(({ data }) => {
        setCurrentKey(planFromPacks(((data as { pack_id: number }[]) || []).map((o) => o.pack_id)));
      });
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg text-ink">
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3 sm:px-8">
        <button onClick={onClose} aria-label="Back" className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-panel transition hover:border-volt/50">
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-base font-semibold">Plans & Credit Usage</h1>
        <span className="ml-auto rounded-full border border-line px-3 py-1 text-xs text-muted">{balance.toLocaleString()} credits left</span>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8">
          <h2 className="text-2xl font-semibold sm:text-3xl">Choose your plan</h2>
          <p className="mb-6 mt-1 text-sm text-muted">Upgrade any time. Credits are added automatically after Pesapal payment.</p>
          <PlansGrid currentKey={currentKey} />
        </div>
      </main>
    </div>
  );
}
