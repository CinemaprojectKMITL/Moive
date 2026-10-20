import { afterEach, describe, expect, it, vi } from 'vitest'
import { paginateItems } from '../../src/utils/pagination.js'
import { getBookingCountdown, mergeBookingSnapshot, startBookingCountdown } from '../../src/utils/bookingCountdown.js'
import { formatShowDate, formatShowTime } from '../../src/utils/format.js'

const now = Date.parse('2026-10-20T10:00:00.000Z')
const booking = { _id: 'booking-a', status: 'pending', seats: [{ seatCode: 'A1' }], expiresAt: new Date(now + 300_000).toISOString() }
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('catalog pagination', () => {
  it('bounds a large catalog without losing or duplicating items across pages', () => {
    const movies = Array.from({ length: 1003 }, (_, id) => ({ id }))
    const all = []
    for (let page = 1; page <= 101; page += 1) {
      const result = paginateItems(movies, page, 10)
      expect(result.items.length).toBeLessThanOrEqual(10)
      all.push(...result.items)
    }
    expect(all).toEqual(movies)
    expect(paginateItems(movies, 101, 10)).toMatchObject({ page: 101, pages: 101, offset: 1000, total: 1003 })
  })

  it('clamps the page when a refreshed catalog shrinks and handles empty catalogs', () => {
    expect(paginateItems(['a', 'b'], 8, 9)).toEqual({ items: ['a', 'b'], total: 2, pages: 1, page: 1, offset: 0 })
    expect(paginateItems([], 0, 9)).toEqual({ items: [], total: 0, pages: 1, page: 1, offset: 0 })
  })
})

describe('show dates at the cinema', () => {
  it('includes the correct Bangkok date when a show crosses midnight UTC', () => {
    const before = '2026-10-20T16:30:00.000Z'
    const after = '2026-10-20T17:30:00.000Z'
    expect(formatShowDate(before)).toContain('20')
    expect(formatShowDate(after)).toContain('21')
    expect(formatShowDate(after)).toContain('2569')
    expect(formatShowTime(before)).toBe('23:30')
    expect(formatShowTime(after)).toBe('00:30')
  })
})

describe('checkout countdown lifecycle', () => {
  it('uses the original server deadline without restarting it after a poll', () => {
    expect(getBookingCountdown(booking, 'booking-a', now)).toEqual({ remaining: 300, active: true, expired: false })
    expect(getBookingCountdown({ ...booking }, 'booking-a', now + 120_000)).toEqual({ remaining: 180, active: true, expired: false })
  })

  it.each(['cancelled', 'paid', 'expired'])('clears countdown for status %s', (status) => {
    expect(getBookingCountdown({ ...booking, status }, 'booking-a', now)).toEqual({ remaining: 0, active: false, expired: false })
  })

  it('clears countdown and payment eligibility when all seats are removed', () => {
    expect(getBookingCountdown({ ...booking, seats: [] }, 'booking-a', now)).toEqual({ remaining: 0, active: false, expired: false })
  })

  it('does not display a countdown from a previous booking or missing booking', () => {
    expect(getBookingCountdown(booking, 'booking-b', now).active).toBe(false)
    expect(getBookingCountdown(null, 'booking-a', now).remaining).toBe(0)
  })

  it('expires at the exact deadline and never shows zero early', () => {
    expect(getBookingCountdown(booking, 'booking-a', now + 299_999)).toEqual({ remaining: 1, active: true, expired: false })
    expect(getBookingCountdown(booking, 'booking-a', now + 300_000)).toEqual({ remaining: 0, active: false, expired: true })
  })

  it('stops interval ticks when selection/booking is cancelled and cleanup runs', () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const onTick = vi.fn()
    const stop = startBookingCountdown(booking, 'booking-a', onTick)
    vi.advanceTimersByTime(2000)
    expect(onTick).toHaveBeenCalledTimes(3)
    stop()
    expect(vi.getTimerCount()).toBe(0)
    const idle = vi.fn()
    startBookingCountdown({ ...booking, status: 'cancelled', seats: [] }, 'booking-a', idle)
    vi.advanceTimersByTime(60_000)
    expect(onTick).toHaveBeenCalledTimes(3)
    expect(idle).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('automatically clears the interval when the original deadline is reached', () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const onTick = vi.fn()
    startBookingCountdown({ ...booking, expiresAt: new Date(now + 2000).toISOString() }, 'booking-a', onTick)
    vi.advanceTimersByTime(20_000)
    expect(onTick).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('prevents an in-flight poll from restarting a cancelled countdown', () => {
    const cancelled = { ...booking, status: 'cancelled' }
    expect(mergeBookingSnapshot(cancelled, booking)).toBe(cancelled)
    expect(mergeBookingSnapshot({ ...booking, status: 'paid' }, booking).status).toBe('paid')
    const other = { ...booking, _id: 'booking-b' }
    expect(mergeBookingSnapshot(cancelled, other)).toBe(other)
    expect(mergeBookingSnapshot(booking, cancelled)).toBe(cancelled)
  })
})
