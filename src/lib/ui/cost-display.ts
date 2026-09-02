/**
 * Client-safe display constants for withheld money.
 *
 * Deliberately separate from `src/lib/costs.ts`: that module imports the
 * repositories and the permission matrix, so importing it from a client
 * component would pull server-only code into the browser bundle. The
 * placeholder itself is just a string and is needed on both sides, so it
 * lives here where either can import it safely.
 */

/**
 * Shown in place of a figure the current user may not see. A visible marker
 * rather than a blank, so a withheld price reads as "you are not being shown
 * this" instead of "there is no price".
 */
export const HIDDEN_COST = '- - -';
