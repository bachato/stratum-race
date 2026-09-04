import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  AGGREGATE_REFRESH_INTERVAL_MS,
  startAggregateAutoRefresh,
} from './AggregateRefresh'

/** Force document.visibilityState for the duration of a test. */
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

describe('startAggregateAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility('visible')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not refresh before the first interval elapses', () => {
    const refresh = vi.fn()
    const stop = startAggregateAutoRefresh(refresh, 1000)

    vi.advanceTimersByTime(999)
    expect(refresh).not.toHaveBeenCalled()

    stop()
  })

  it('refreshes once per interval while the document is visible', () => {
    const refresh = vi.fn()
    const stop = startAggregateAutoRefresh(refresh, 1000)

    vi.advanceTimersByTime(3000)
    expect(refresh).toHaveBeenCalledTimes(3)

    stop()
  })

  it('skips refreshes while the document is hidden', () => {
    // A backgrounded tab must cost nothing. main.ts refreshes on
    // visibilitychange, so returning to the tab brings it current immediately
    // rather than waiting out the remainder of an interval.
    const refresh = vi.fn()
    const stop = startAggregateAutoRefresh(refresh, 1000)

    setVisibility('hidden')
    vi.advanceTimersByTime(5000)
    expect(refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    vi.advanceTimersByTime(1000)
    expect(refresh).toHaveBeenCalledTimes(1)

    stop()
  })

  it('stops refreshing after the returned stop function is called', () => {
    const refresh = vi.fn()
    const stop = startAggregateAutoRefresh(refresh, 1000)

    vi.advanceTimersByTime(1000)
    expect(refresh).toHaveBeenCalledTimes(1)

    stop()
    vi.advanceTimersByTime(10_000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('defaults to a 120s cadence', () => {
    // Requests, not bytes, are the cost driver: unchanged polls return 304 with
    // no body but still count as CloudFront requests. The aggregate changes at
    // most once per block, so 120s loses nothing versus 60s. Tightening this
    // doubles request volume per open tab — see AggregateRefresh.ts.
    expect(AGGREGATE_REFRESH_INTERVAL_MS).toBe(120_000)

    const refresh = vi.fn()
    const stop = startAggregateAutoRefresh(refresh)

    vi.advanceTimersByTime(AGGREGATE_REFRESH_INTERVAL_MS - 1)
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(1)

    stop()
  })
})
