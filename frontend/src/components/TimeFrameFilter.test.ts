import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TimeFrameFilter from './TimeFrameFilter.vue'
import { useRaceStore } from '@/stores/raceStore'

/**
 * The "Updated X min ago" label is the only UI that tells a user the
 * leaderboard is not live. It previously read Date.now() inside a computed
 * whose only reactive dependency was aggregateLastUpdated, so Vue evaluated it
 * once when the aggregate loaded and cached it forever: the label sat at
 * "Updated <1 min ago" while the data aged arbitrarily. These tests pin the
 * ticking behavior so that regression can't return silently.
 */
describe('TimeFrameFilter staleness label', () => {
  const LOADED_AT = '2026-09-04T12:00:00Z'

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(new Date(LOADED_AT))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function mountWithAggregate(frame: 'last10' | 'last50' | '24h' | '7d' = 'last10') {
    const store = useRaceStore()
    store.aggregateLastUpdated = LOADED_AT
    store.activeTimeFrame = frame
    return mount(TimeFrameFilter)
  }

  it('advances the label as time passes without a new aggregate load', async () => {
    const wrapper = mountWithAggregate()
    expect(wrapper.text()).toContain('Updated <1 min ago')

    // Eight minutes pass. No new aggregate has loaded, so
    // aggregateLastUpdated is unchanged — the label must still move.
    vi.advanceTimersByTime(8 * 60_000)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Updated 8 min ago')
    expect(wrapper.text()).not.toContain('Updated <1 min ago')
  })

  it('switches to hours after 60 minutes', async () => {
    const wrapper = mountWithAggregate()

    vi.advanceTimersByTime(150 * 60_000)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Updated 2h ago')
  })

  it('renders no label when no server aggregate is loaded', () => {
    // aggregateLastUpdated is null in the client-side fallback state
    // (buildLeaderboardFromRecent), where "updated" has no meaning.
    const store = useRaceStore()
    store.aggregateLastUpdated = null
    store.activeTimeFrame = 'last10'

    const wrapper = mount(TimeFrameFilter)
    expect(wrapper.text()).not.toContain('Updated')
  })

  it('shows the label only for the recent-N frames', async () => {
    const wrapper = mountWithAggregate('7d')
    vi.advanceTimersByTime(8 * 60_000)
    await wrapper.vm.$nextTick()

    // Rolling windows barely move per block, so staleness is not meaningful
    // there and the label is intentionally suppressed.
    expect(wrapper.text()).not.toContain('Updated')
  })

  it('clears its interval on unmount', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const wrapper = mountWithAggregate()

    wrapper.unmount()

    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})
