import { Check, Loader2, Minus, X } from 'lucide-react';

export interface AgentStatus {
  state?: Record<string, string>;
  msg?: Record<string, string>;
  delivery?: Record<string, string>;
}

const DELIVERY = [
  { key: 'generated', label: 'Code generated' },
  { key: 'build', label: 'Build' },
  { key: 'tests', label: 'Tests' },
  { key: 'preview', label: 'Preview loaded' },
  { key: 'deployed', label: 'Deployed' },
];

const STEPS = [
  { key: 'planning', label: 'Planning Agent' },
  { key: 'coding', label: 'Coding Agent' },
  { key: 'review', label: 'Review Agent' },
  { key: 'backend', label: 'Backend Agent' },
  { key: 'debug', label: 'Debug Agent' },
  { key: 'testing', label: 'Testing Agent' },
  { key: 'engine', label: 'Project Execution Engine' },
  { key: 'preview', label: 'Live Preview Ready' },
];

/** Shows REAL stage states written by the worker to build_jobs.agent_status. Nothing here is simulated. */
export default function PipelineCard({ agents }: { agents?: AgentStatus | null }) {
  const st = agents?.state || {};
  const msg = agents?.msg || {};
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-faint">Multi-agent pipeline</p>
      <ul className="space-y-1.5">
        {STEPS.map((s) => {
          const v = st[s.key] || 'pending';
          const done = v === 'done';
          const active = v === 'running';
          const failed = v === 'failed';
          const skipped = v === 'skipped';
          return (
            <li key={s.key} className="text-xs">
              <div className={`flex items-center gap-2 transition ${done ? 'text-green-400' : active ? 'text-fg' : failed ? 'text-red-400' : 'text-faint'}`}>
                <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${done ? 'border-green-500/60 bg-green-500/15' : active ? 'border-lime-400/70' : failed ? 'border-red-500/60 bg-red-500/15' : 'border-line'}`}>
                  {done ? <Check size={10} /> : active ? <Loader2 size={10} className="animate-spin" /> : failed ? <X size={10} /> : skipped ? <Minus size={10} /> : null}
                </span>
                <span className={active ? 'animate-pulse' : ''}>{s.label}</span>
                {skipped && <span className="font-mono text-[9px] uppercase text-faint">skipped</span>}
              </div>
              {msg[s.key] && v !== 'pending' && <p className={`ml-6 truncate text-[10px] ${failed ? 'text-red-400/80' : 'text-faint'}`} title={msg[s.key]}>{msg[s.key]}</p>}
            </li>
          );
        })}
      </ul>
      {agents?.delivery && (
        <div className="mt-2.5 flex flex-wrap gap-1 border-t border-line pt-2">
          {DELIVERY.map((d) => {
            const v = agents.delivery?.[d.key] || 'pending';
            const cls = v === 'passed' ? 'border-green-500/50 text-green-400' : v === 'failed' ? 'border-red-500/50 text-red-400' : 'border-line text-faint';
            return <span key={d.key} className={`rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase ${cls}`}>{d.label}: {v === 'not_deployed' ? 'not yet' : v}</span>;
          })}
        </div>
      )}
    </div>
  );
}
