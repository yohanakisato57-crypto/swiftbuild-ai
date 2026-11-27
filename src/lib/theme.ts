import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
const KEY = 'swiftbuild-theme';

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(t: Theme) {
  const el = document.documentElement;
  el.classList.toggle('light', t === 'light');
  el.style.colorScheme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
}

applyTheme(getTheme());

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getTheme);
  useEffect(() => applyTheme(theme), [theme]);
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) };
}
