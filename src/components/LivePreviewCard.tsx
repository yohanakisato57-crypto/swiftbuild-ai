import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { previewDoc } from '../lib/preview';
import type { ProjectFile } from '../lib/generator';
import type { BuildFile } from '../lib/auth';

/** Dark inline card under the prompt: step checklist + a live sandbox that fills in as files land. */
export default function LivePreviewCard({ files, steps, title, storageKey }: { files: ProjectFile[]; steps: BuildFile[]; title: string; storageKey?: string }) {
  // Throttle iframe reloads so rapid updates stay smooth.
  const [doc, setDoc] = useState(() => previewDoc(files, { storageKey, partial: true }));
  useEffect(() => {
    const t = setTimeout(() => setDoc(previewDoc(files, { storageKey, partial: true })), 250);
    return () => clearTimeout(t);
  }, [files, storageKey]);

  const done = steps.filter((s) => s.status === 'done').length;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_8px_30px_rgba(0,0,0,.35)]">
      <ul className="space-y-2 p-3.5 text-sm">
        <li className="flex items-center gap-2.5 text-fg">
          <Loader2 size={16} className="animate-spin text-volt" />
          <span className="truncate">Building {title}</span>
          {steps.length > 0 && <span className="ml-auto font-mono text-[11px] text-faint">{done}/{steps.length}</span>}
        </li>
        {steps.map((f) => (
          <li key={f.idx} className="flex items-center gap-2.5 font-mono text-xs text-muted">
            {f.status === 'done' ? (
              <span className="grid h-4 w-4 place-items-center rounded-full bg-volt text-volt-ink"><Check size={10} strokeWidth={3} /></span>
            ) : f.status === 'writing' ? (
              <span className="h-4 w-4 animate-pulse rounded-full border-2 border-volt" />
            ) : (
              <span className="h-4 w-4 rounded-full border border-line-strong" />
            )}
            <span className="truncate">{f.name}</span>
            <span className="ml-auto text-[11px] text-faint">{f.status === 'done' ? 'ready' : f.status === 'writing' ? 'writing…' : 'queued'}</span>
          </li>
        ))}
      </ul>
      <div className="relative border-t border-line bg-bg">
        <div className="flex h-7 items-center gap-1.5 px-3">
          <span className="h-2 w-2 animate-pulse rounded-full bg-volt" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-faint">Live preview</span>
        </div>
        <iframe title="Live preview" sandbox="allow-scripts" srcDoc={doc} className="block h-64 w-full bg-white" />
      </div>
    </div>
  );
}
