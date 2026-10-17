import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let store
const start = new Date('2026-10-04T03:30:00.000Z')
const ttl = 30 * 60 * 1000

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(start)
  vi.resetModules()
  store = await import('../src/services/ApiRequestStore.js')
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('RAM API request IDs', () => {
  it('separates resource types, resource IDs, users, and operation scopes', () => {
    const access = { resourceType: 'booking', resourceId: 'booking-a', scope: 'read' }
    const issued = store.getOrCreateApiRequestId('user-a', access)
    expect(store.getOrCreateApiRequestId('user-a', access)).toEqual(issued)
    for (const other of [{ ...access, scope: 'cancel' }, { ...access, resourceType: 'payment' }, { ...access, resourceId: 'booking-b' }]) {
      expect(store.validateApiRequestId(issued.apiRequestId, 'user-a', other).reason).toBe('mismatch')
      expect(store.getOrCreateApiRequestId('user-a', other).apiRequestId).not.toBe(issued.apiRequestId)
    }
    expect(store.validateApiRequestId(issued.apiRequestId, 'user-b', access).reason).toBe('mismatch')
  })
  it('generates a UUID and reuses it without changing creation or expiration', () => {
    const first = store.getOrCreateApiRequestId('user-a', 'movie-a')
    expect(first.apiRequestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(first.expiresAt).toBe(start.getTime() + ttl)
    vi.setSystemTime(start.getTime() + ttl - 1)
    expect(store.getOrCreateApiRequestId('user-a', 'movie-a')).toEqual(first)
    expect(store.validateApiRequestId(first.apiRequestId, 'user-a', 'movie-a')).toEqual({ valid: true, record: { userId: 'user-a', resourceType: 'movie', resourceId: 'movie-a', scope: 'read', createdAt: start.getTime(), expiresAt: first.expiresAt } })
  })

  it('rejects expiry at exactly 30 minutes before cleanup runs and replaces the index', () => {
    const first = store.getOrCreateApiRequestId('user-a', 'movie-a')
    vi.setSystemTime(first.expiresAt)
    expect(store.validateApiRequestId(first.apiRequestId, 'user-a', 'movie-a')).toEqual({ valid: false, reason: 'expired' })
    expect(store.validateApiRequestId(first.apiRequestId, 'user-a', 'movie-a').reason).toBe('invalid')
    const next = store.getOrCreateApiRequestId('user-a', 'movie-a')
    expect(next.apiRequestId).not.toBe(first.apiRequestId)
    expect(next.expiresAt).toBe(first.expiresAt + ttl)
    expect(store.getOrCreateApiRequestId('user-a', 'movie-a')).toEqual(next)
  })

  it('rejects unknown IDs, different users, and different movies without deleting a valid ID', () => {
    const first = store.getOrCreateApiRequestId('user-a', 'movie-a')
    expect(store.validateApiRequestId('unknown', 'user-a', 'movie-a').reason).toBe('invalid')
    expect(store.validateApiRequestId(first.apiRequestId, 'user-b', 'movie-a').reason).toBe('mismatch')
    expect(store.validateApiRequestId(first.apiRequestId, 'user-a', 'movie-b').reason).toBe('mismatch')
    expect(store.validateApiRequestId(first.apiRequestId, 'user-a', 'movie-a').valid).toBe(true)
    expect(store.getOrCreateApiRequestId('user-b', 'movie-a').apiRequestId).not.toBe(first.apiRequestId)
    expect(store.getOrCreateApiRequestId('user-a', 'movie-b').apiRequestId).not.toBe(first.apiRequestId)
  })

  it('automatically removes expired records and their index while preserving newer IDs', () => {
    const first = store.getOrCreateApiRequestId('user-a', 'movie-a')
    vi.advanceTimersByTime(ttl - 60_000)
    const newer = store.getOrCreateApiRequestId('user-b', 'movie-a')
    vi.advanceTimersByTime(60_000)
    expect(store.validateApiRequestId(first.apiRequestId, 'user-a', 'movie-a').reason).toBe('invalid')
    expect(store.validateApiRequestId(newer.apiRequestId, 'user-b', 'movie-a').valid).toBe(true)
    const replacement = store.getOrCreateApiRequestId('user-a', 'movie-a')
    expect(replacement.apiRequestId).not.toBe(first.apiRequestId)
    expect(store.getOrCreateApiRequestId('user-a', 'movie-a')).toEqual(replacement)
  })

  it('loses all IDs when the service is reloaded with a fresh process-local store', async () => {
    const first = store.getOrCreateApiRequestId('user-a', 'movie-a')
    vi.resetModules()
    const fresh = await import('../src/services/ApiRequestStore.js')
    expect(fresh.validateApiRequestId(first.apiRequestId, 'user-a', 'movie-a').reason).toBe('invalid')
  })
})
