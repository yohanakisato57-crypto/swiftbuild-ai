import { Coins, Menu, Moon, Sun } from 'lucide-react';
import type { Account } from '../lib/auth';
import { useTheme } from '../lib/theme';

interface Props {
  account: Account;
  onMenu: () => void;
  onBuy: () => void;
}

export default function Header({ account, onMenu, onBuy }: Props) {
  const low = account.credits <= 2;
  const { theme, toggle } = useTheme();
  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center justify-between px-3 sm:px-5">
      <button
        onClick={onMenu}
        aria-label="Open menu"
        className="grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-fg active:scale-90"
      >
        <Menu size={20} />
      </button>

      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          className="grid h-9 w-9 place-items-center rounded-full border border-line-strong bg-raised/60 text-muted transition hover:border-volt/60 hover:text-fg active:scale-90"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          onClick={onBuy}
          aria-label={`${account.credits} credits left, buy more`}
          className={`flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-all duration-200 hover:-translate-y-px hover:shadow-glow active:translate-y-0 active:scale-[0.97] ${
            low ? 'border-danger/50 text-danger' : 'border-line-strong bg-raised/60 text-fg hover:border-volt/60'
          }`}
        >
          <Coins size={15} className={low ? 'text-danger' : 'text-volt'} />
          <span className="tabular-nums" aria-live="polite">{account.credits} Credits Left</span>
        </button>
      </div>
    </header>
  );
}
