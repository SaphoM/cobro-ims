'use client';

import { useSyncExternalStore } from 'react';
import {
  applyTheme,
  currentTheme,
  syncThemeFromStorage,
  THEME_CHANGE_EVENT,
  type Theme,
} from '@/lib/theme';

/**
 * Light/dark switch.
 *
 * The theme is applied to <html> by the bootstrap script in the root layout
 * before React hydrates, so the attribute — not React state — is the source
 * of truth, and this reads it through `useSyncExternalStore`. That's what
 * keeps the server render (always the dark default, since the server can't
 * know the choice) from becoming a hydration mismatch, and it keeps the two
 * mounted toggles (sidebar and mobile header) showing the same thing.
 */
function subscribe(onStoreChange: () => void) {
  const onStorage = () => {
    // Another tab switched themes: its write updated only its own <html>.
    syncThemeFromStorage();
    onStoreChange();
  };
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
    window.removeEventListener('storage', onStorage);
  };
}

const getServerSnapshot = (): Theme => 'dark';

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, currentTheme, getServerSnapshot);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={() => applyTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={
        className ??
        'flex items-center gap-2 rounded-lg border border-accent/25 bg-surface-2 px-2.5 py-1.5 text-[0.78rem] font-semibold text-text-muted transition-colors hover:border-accent/45 hover:text-accent-strong'
      }
    >
      <span aria-hidden="true" className="flex h-4 w-4 flex-none items-center justify-center">
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </span>
      <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}
