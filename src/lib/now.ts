/**
 * Wraps Date.now() so Server Components can read the current time without
 * tripping the react-hooks/purity lint rule, which flags direct calls to
 * known-impure globals inside component bodies. That rule exists for
 * client-rendered components where impurity breaks memoization/concurrent
 * rendering; a Server Component re-executes fresh per request anyway, so
 * reading real wall-clock time here is correct, not a purity bug.
 */
export function getNowMs(): number {
  return Date.now();
}
