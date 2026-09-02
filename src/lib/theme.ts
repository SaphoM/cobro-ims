/**
 * Theme plumbing shared by the no-flash bootstrap script and the toggle.
 *
 * Dark is the committed default — the app's whole palette was designed dark
 * first, and an operations tool shouldn't change appearance on someone
 * because of an OS setting they made for a different reason. Light is
 * therefore opt-in and sticky: choosing it writes `data-theme="light"` onto
 * <html> and remembers it, and nothing else is stored.
 */

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'cobro-ims-theme';

/**
 * Runs as a blocking inline <script> before the first paint, so a light-mode
 * user never sees a dark frame first. It is stringified into the document, so
 * it can't reference anything outside itself — hence the literal key rather
 * than THEME_STORAGE_KEY. Wrapped in try/catch because localStorage throws
 * outright in some privacy modes, and a theme preference is never worth
 * breaking the page over.
 */
export const THEME_BOOTSTRAP_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}`;

/**
 * Fired after a theme change so every mounted toggle re-reads the DOM. There
 * are two of them (sidebar and mobile header) and they must never disagree,
 * and the <html> attribute — not React state — is the source of truth, since
 * the bootstrap script sets it before React exists.
 */
export const THEME_CHANGE_EVENT = 'cobro-ims:themechange';

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Preference just won't persist — the toggle still works this session.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/** Reads the live theme off <html>, which the bootstrap script has already set. */
export function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/**
 * Pulls the stored preference back onto <html>. Used when another tab changes
 * the theme: that tab's write fires a `storage` event here, but only the
 * originating document had its attribute updated.
 */
export function syncThemeFromStorage() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    const theme: Theme = stored === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch {
    // Nothing to sync.
  }
}
