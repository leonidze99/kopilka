import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

// index.html reads the same key before the first paint.
const STORAGE_KEY = 'kopilka:theme';
// Optional: jsdom in tests has no matchMedia.
const darkQuery = (): MediaQueryList | undefined =>
  window.matchMedia?.('(prefers-color-scheme: dark)');

const listeners = new Set<() => void>();

/** The user's choice if any, otherwise the system theme. */
function currentTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return darkQuery()?.matches ? 'dark' : 'light';
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Without a choice of their own the page follows the system theme live.
  const query = darkQuery();
  query?.addEventListener('change', onChange);
  return () => {
    listeners.delete(onChange);
    query?.removeEventListener('change', onChange);
  };
}

function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: the choice lasts until reload.
  }
  listeners.forEach((listener) => listener());
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, currentTheme);
  const toggle = useCallback(
    () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'),
    [],
  );
  return { theme, toggle };
}
