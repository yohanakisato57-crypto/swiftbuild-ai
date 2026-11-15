import { useEffect, useState } from 'react';
import { FolderOpen, Home } from 'lucide-react';

export type Tab = 'home' | 'projects';

function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const check = () => setOpen(window.innerHeight - vv.height > 120);
    check();
    vv.addEventListener('resize', check);
    return () => vv.removeEventListener('resize', check);
  }, []);
  return open;
}

export default function BottomNav({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const kb = useKeyboardOpen();
  if (kb) return null;
  const items = [
    { id: 'home' as const, label: 'Home', Icon: Home },
    { id: 'projects' as const, label: 'Project', Icon: FolderOpen },
  ];
  return (
    <nav className="flex h-20 shrink-0 items-center justify-center gap-3 bg-transparent px-4 pb-[env(safe-area-inset-bottom)]">
      {items.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onTab(id)}
          aria-current={tab === id}
          className={`flex min-w-32 flex-1 max-w-44 items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-base font-semibold transition active:scale-95 ${tab === id ? 'bg-volt/10 text-volt' : 'text-muted hover:text-fg'}`}
        >
          <Icon size={22} />
          {label}
        </button>
      ))}
    </nav>
  );
}
