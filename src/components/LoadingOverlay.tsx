import { useEffect, useState } from 'react';

const STEPS = [
  'Analyzing prompt...',
  'Designing database architecture and user interface...',
  'Writing optimized code via GPT-6.1 Sol...',
  'Deploying your project live to the web...',
];

/** Inline loading card shown under the user's prompt in the chat. Not a full-screen overlay. */
export default function LoadingOverlay({ show, label }: { show: boolean; label?: string }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!show) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2000);
    return () => clearInterval(t);
  }, [show]);

  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-line bg-panel/70 px-3.5 py-3 backdrop-blur-md"
      style={{ animation: 'sb-in .35s ease-out both' }}
    >
      <style>{`
        @keyframes sb-in { from { opacity:0; transform: translateY(6px) } to { opacity:1; transform:none } }
        @keyframes sb-aura { 0%,100% { opacity:.45 } 50% { opacity:.9 } }
        @keyframes sb-spin { to { transform: rotate(360deg) } }
        @media (prefers-reduced-motion: reduce) { .sb-anim { animation: none !important } }
      `}</style>

      <div
        aria-hidden
        className="sb-anim pointer-events-none absolute -left-6 top-1/2 h-20 w-20 -translate-y-1/2 rounded-full blur-2xl"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,.6), rgba(59,130,246,.35) 55%, transparent 75%)', animation: 'sb-aura 2.8s ease-in-out infinite' }}
      />

      <div className="relative grid h-9 w-9 shrink-0 place-items-center">
        <div
          className="sb-anim absolute inset-0 rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0 55%, #8b5cf6 80%, #3b82f6 100%)',
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2.5px))',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2.5px))',
            animation: 'sb-spin 1.2s linear infinite',
          }}
        />
        <span className="relative text-[11px] font-bold text-volt">SB</span>
      </div>

      <div className="relative min-w-0 flex-1">
        <p className="text-xs font-semibold text-fg">{label || 'SwiftBuild AI'}</p>
        <p key={step} className="truncate text-xs text-muted" style={{ animation: 'sb-in .4s ease-out both' }}>
          {STEPS[step]}
        </p>
      </div>
    </div>
  );
}
