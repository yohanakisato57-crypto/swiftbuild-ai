import { Check, Loader2 } from 'lucide-react';

const STEPS = [
  { key: 'orchestrator', label: 'AI Orchestrator & Planning AI' },
  { key: 'coding', label: 'Coding Agent & Backend Manager' },
  { key: 'debug', label: 'Debug & Build Engine' },
  { key: 'preview', label: 'Live Preview Ready' },
];

export default function PipelineCard({ step }: { step?: string | null }) {
  const cur = step === 'done' ? STEPS.length : Math.max(0, STEPS.findIndex((s) => s.key === step));
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-faint">Multi-agent pipeline</p>
      <ul className="space-y-1.5">
        {STEPS.map((s, i) => {
          const done = i < cur;
          const active = i === cur;
          return (
            <li key={s.key} className={`flex items-center gap-2 text-xs transition ${done ? 'text-green-400' : active ? 'text-fg' : 'text-faint'}`}>
              <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${done ? 'border-green-500/60 bg-green-500/15' : active ? 'border-lime-400/70' : 'border-line'}`}>
                {done ? <Check size={10} /> : active ? <Loader2 size={10} className="animate-spin" /> : null}
              </span>
              <span className={active ? 'animate-pulse' : ''}>{s.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
