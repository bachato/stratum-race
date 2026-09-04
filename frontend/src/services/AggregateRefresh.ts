/**
 * Periodic leaderboard aggregate refresh.
 *
 * WHY THIS EXISTS
 * ---------------
 * Recent Blocks updates in real time (WebSocket `addRaceResult`, or the polling
 * fallback re-fetching recent-blocks.json). The leaderboard does not: it is
 * driven entirely by pre-computed aggregate files, which were only ever fetched
 * on initial page load, on a Period button click, and on tab resume.
 *
 * The result was that a tab left open drifted: Recent Blocks advanced block by
 * block while the "Last 10" leaderboard stayed frozen on the 10-block window
 * that happened to be current when the aggregate was last fetched. After ten
 * blocks the two views described disjoint sets of races, which reads as a data
 * bug rather than staleness.
 *
 * WHY A TIMER RATHER THAN A BLOCK-ARRIVAL HOOK
 * -------------------------------------------
 * Refetching when a race arrives is the obvious hook and the wrong one:
 *
 *  1. The server only recomputes the aggregates on a 5-minute schedule, so a
 *     fetch at the instant a race lands almost always returns the same bytes
 *     the browser already has.
 *  2. Each block produces one race POST per vantage (four in production), so
 *     a per-race hook fires a burst of redundant requests per block.
 *
 * A plain interval is decoupled from both the block cadence and the server's
 * schedule, and is naturally de-duplicated.
 *
 * WHY 120s
 * --------
 * The aggregate changes at most once per block (~10 min) and at most once per
 * 5-minute Lambda run, so a 120s poll loses nothing perceptible versus 60s
 * while halving request volume. Requests, not bytes, are the metric that
 * matters here: unchanged polls are answered 304 with no body, but every poll
 * still counts as a CloudFront request, and a tab left open all day is the
 * dominant contributor.
 *
 * Refreshes are skipped while the document is hidden — a backgrounded tab
 * should cost nothing. `main.ts` already refreshes on `visibilitychange`, so
 * returning to a tab brings it current immediately rather than waiting out the
 * remainder of an interval.
 */

/** Default refresh cadence. See "WHY 120s" above before changing. */
export const AGGREGATE_REFRESH_INTERVAL_MS = 120_000

/**
 * Begin periodically invoking `refresh` while the document is visible.
 *
 * @param refresh   Callback that re-fetches the active aggregate (normally
 *                  `store.reloadActiveTimeFrame`).
 * @param intervalMs Override the cadence (tests, or a future runtime setting).
 * @returns A stop function that cancels the timer.
 */
export function startAggregateAutoRefresh(
  refresh: () => unknown,
  intervalMs: number = AGGREGATE_REFRESH_INTERVAL_MS,
): () => void {
  const timer = setInterval(() => {
    // Guard for non-browser environments (SSR, bare unit tests) as well as
    // backgrounded tabs.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return
    }
    refresh()
  }, intervalMs)

  return () => clearInterval(timer)
}
