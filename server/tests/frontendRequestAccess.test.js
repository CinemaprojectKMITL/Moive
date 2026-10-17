import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { protectedEndpoints } from '../../shared/apiAccessPolicy.js'

let client
let storage
let dispatch
const data = { result: 'protected data' }
const metadata = (id = 'request-a', expiresAt = Date.now() + 1_800_000) => ({ success: true, userId: 'user-a', apiRequestId: id, expiresAt: new Date(expiresAt).toISOString(), expiresIn: 1800 })
const response = (payload, status = 200) => new Response(JSON.stringify(payload), { status })
const success = () => response({ success: true, data })
const rejectId = () => response({ success: false, code: 'API_REQUEST_ID_INVALID', error: 'Invalid API request ID' }, 401)
const paths = () => fetch.mock.calls.map(([path]) => path)
const key = 'api-request:user-a:booking:booking-a:read'

beforeEach(async () => {
  vi.resetModules()
  storage = new Map()
  dispatch = vi.fn()
  vi.stubGlobal('window', { dispatchEvent: dispatch, sessionStorage: {
    getItem: (name) => storage.get(name) ?? null,
    setItem: (name, value) => storage.set(name, value),
    removeItem: (name) => storage.delete(name),
    get length() { return storage.size },
    key: (index) => [...storage.keys()][index],
  } })
  vi.stubGlobal('fetch', vi.fn())
  client = await import('../../src/api/client.js')
  client.setApiUser({ id: 'user-a' })
})

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('shared frontend API access', () => {
  it.each(protectedEndpoints)('scopes %s %s through bootstrap and preserves the actual request', async (method, template, resourceType, scope, binding) => {
    const path = template.replace(':id', 'resource-a')
    const body = method === 'POST' && path === '/bookings' ? { showId: 'show-a', seats: ['A1'], idempotencyKey: 'separate-idempotency' } : undefined
    fetch.mockResolvedValueOnce(response(metadata())).mockResolvedValueOnce(success())
    expect(await client.api(path, { method, body })).toEqual(data)
    expect(paths()).toEqual(['/api/request-access', `/api${path}`])
    const bootstrap = JSON.parse(fetch.mock.calls[0][1].body)
    expect(bootstrap).toMatchObject({ method, path })
    if (binding === 'showId') expect(bootstrap.context).toEqual({ showId: 'show-a' })
    const options = fetch.mock.calls[1][1]
    expect(options.method).toBe(method)
    expect(options.headers.get('X-API-User-ID')).toBe('user-a')
    expect(options.headers.get('X-API-Request-ID')).toBe('request-a')
    expect(options.credentials).toBe('include')
    const resourceId = binding === 'id' ? 'resource-a' : binding === 'showId' ? 'show-a' : binding
    expect(storage.has(`api-request:user-a:${resourceType}:${resourceId}:${scope}`)).toBe(true)
  })

  it('reuses cached IDs after refresh and removes expired cache entries', async () => {
    fetch.mockResolvedValueOnce(response(metadata())).mockResolvedValueOnce(success())
    await client.apiGet('/bookings/booking-a')
    const original = storage.get(key)
    vi.resetModules()
    client = await import('../../src/api/client.js')
    client.setApiUser({ id: 'user-a' })
    fetch.mockResolvedValueOnce(success())
    await client.apiGet('/bookings/booking-a')
    expect(paths().at(-1)).toBe('/api/bookings/booking-a')
    expect(storage.get(key)).toBe(original)
    storage.set(key, JSON.stringify({ userId: 'user-a', apiRequestId: 'expired', expiresAt: Date.now() }))
    fetch.mockImplementationOnce(() => { expect(storage.has(key)).toBe(false); return Promise.resolve(response(metadata('replacement'))) }).mockResolvedValueOnce(success())
    await client.apiGet('/bookings/booking-a')
    expect(JSON.parse(storage.get(key)).apiRequestId).toBe('replacement')
  })

  it('recovers once from a server RAM reset without logging the user out', async () => {
    storage.set(key, JSON.stringify({ userId: 'user-a', apiRequestId: 'lost-on-restart', expiresAt: Date.now() + 1_800_000 }))
    fetch.mockResolvedValueOnce(rejectId()).mockResolvedValueOnce(response(metadata('replacement'))).mockResolvedValueOnce(success())
    expect(await client.apiGet('/bookings/booking-a')).toEqual(data)
    expect(paths()).toEqual(['/api/bookings/booking-a', '/api/request-access', '/api/bookings/booking-a'])
    expect(dispatch).not.toHaveBeenCalled()
    expect(JSON.parse(storage.get(key)).apiRequestId).toBe('replacement')
  })

  it('retries a newly bootstrapped rejected ID at most once and clears a rejected replacement', async () => {
    fetch.mockResolvedValueOnce(response(metadata())).mockResolvedValueOnce(rejectId()).mockResolvedValueOnce(response(metadata('replacement'))).mockResolvedValueOnce(rejectId())
    await expect(client.apiGet('/bookings/booking-a')).rejects.toMatchObject({ code: 'API_REQUEST_ID_INVALID' })
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(paths().filter((path) => path === '/api/request-access')).toHaveLength(2)
    expect(storage.has(key)).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it.each([[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [409, 'SEAT_CONFLICT'], [500, 'INTERNAL_ERROR']])('never replays business/auth errors (%s %s)', async (status, code) => {
    fetch.mockResolvedValueOnce(response(metadata())).mockResolvedValueOnce(response({ success: false, code, message: 'Rejected' }, status))
    await expect(client.apiPost('/bookings', { showId: 'show-a', seats: ['A1'], idempotencyKey: 'keep-me' })).rejects.toMatchObject({ status, code })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(dispatch).toHaveBeenCalledTimes(status === 401 ? 1 : 0)
  })

  it('never replays a mutation after a network failure', async () => {
    fetch.mockResolvedValueOnce(response(metadata())).mockRejectedValueOnce(new TypeError('Network failed'))
    await expect(client.apiPost('/bookings', { showId: 'show-a', idempotencyKey: 'same-key' })).rejects.toThrow('Network failed')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('preserves idempotency keys and body on a pre-controller token rejection retry', async () => {
    fetch.mockResolvedValueOnce(response(metadata())).mockResolvedValueOnce(rejectId()).mockResolvedValueOnce(response(metadata('replacement'))).mockResolvedValueOnce(success())
    const body = { showId: 'show-a', seats: ['A1'], idempotencyKey: 'same-idempotency' }
    await client.apiPost('/bookings', body)
    expect(fetch.mock.calls[1][1].body).toBe(JSON.stringify(body))
    expect(fetch.mock.calls[3][1].body).toBe(JSON.stringify(body))
    expect(fetch.mock.calls[3][1].headers.get('X-API-Request-ID')).toBe('replacement')
  })

  it('shares access bootstrap but never collapses two distinct mutations', async () => {
    let finish
    fetch.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve })).mockResolvedValueOnce(success()).mockResolvedValueOnce(success())
    const one = client.apiPost('/bookings', { showId: 'show-a', seats: ['A1'], idempotencyKey: 'one' })
    const two = client.apiPost('/bookings', { showId: 'show-a', seats: ['A2'], idempotencyKey: 'two' })
    expect(fetch).toHaveBeenCalledOnce()
    finish(response(metadata()))
    await Promise.all([one, two])
    expect(paths()).toEqual(['/api/request-access', '/api/bookings', '/api/bookings'])
    expect(fetch.mock.calls[1][1].body).not.toBe(fetch.mock.calls[2][1].body)
  })

  it('deduplicates concurrent GETs and keeps pagination parameters', async () => {
    fetch.mockResolvedValueOnce(response(metadata())).mockResolvedValueOnce(success())
    const result = await Promise.all([client.apiGet('/bookings/me?page=2'), client.apiGet('/bookings/me?page=2')])
    expect(result).toEqual([data, data])
    expect(paths()).toEqual(['/api/request-access', '/api/bookings/me?page=2'])
  })

  it('separates resources and operations in cache keys', async () => {
    for (const path of ['/bookings/booking-a', '/bookings/booking-b', '/bookings/booking-a/payment-qr']) {
      fetch.mockResolvedValueOnce(response(metadata())).mockResolvedValueOnce(success())
      await client.apiGet(path)
    }
    expect([...storage.keys()].sort()).toEqual(['api-request:user-a:booking:booking-a:read', 'api-request:user-a:booking:booking-b:read', 'api-request:user-a:payment:booking-a:generate-qr'])
  })

  it('keeps multipart uploads intact while adding scoped headers', async () => {
    fetch.mockResolvedValueOnce(response(metadata())).mockResolvedValueOnce(success())
    const body = new FormData()
    body.append('image', new Blob(['image']), 'poster.png')
    await client.api('/admin/movies/movie-a/poster', { method: 'POST', body, headers: { 'X-Custom': 'preserved' } })
    const options = fetch.mock.calls[1][1]
    expect(options.body).toBe(body)
    expect(options.headers.has('Content-Type')).toBe(false)
    expect(options.headers.get('X-Custom')).toBe('preserved')
    expect(options.headers.get('X-API-Request-ID')).toBe('request-a')
  })

  it('requests a separate scope when an admin consumes a previously verified ticket', async () => {
    fetch.mockResolvedValueOnce(response(metadata('read-only'))).mockResolvedValueOnce(success())
    await client.apiPost('/admin/tickets/verify', { token: 'ticket', consume: false })
    fetch.mockResolvedValueOnce(response(metadata('consume'))).mockResolvedValueOnce(success())
    await client.apiPost('/admin/tickets/verify', { token: 'ticket', consume: true })
    expect(JSON.parse(fetch.mock.calls[2][1].body).context).toEqual({ consume: true })
    expect(storage.has('api-request:user-a:admin-ticket:collection:verify')).toBe(true)
    expect(storage.has('api-request:user-a:admin-ticket:collection:consume')).toBe(true)
  })

  it('bootstraps the profile from the authenticated cookie before user context is available', async () => {
    client.setApiUser(null)
    fetch.mockResolvedValueOnce(response(metadata())).mockResolvedValueOnce(response({ success: true, data: { user: { id: 'user-a' } } }))
    expect(await client.apiGet('/auth/me')).toEqual({ user: { id: 'user-a' } })
    expect(fetch.mock.calls[1][1].headers.get('X-API-User-ID')).toBe('user-a')
  })

  it('clears temporary IDs at logout and cancels a bootstrap from an earlier identity', async () => {
    storage.set(key, JSON.stringify(metadata()))
    storage.set('theme', 'dark')
    let finish
    fetch.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const pending = client.apiGet('/bookings/booking-b')
    client.setApiUser(null)
    finish(response(metadata()))
    await expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' })
    expect([...storage.keys()]).toEqual(['theme'])
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('keeps intentionally public APIs and auth control calls free of access bootstrap', async () => {
    for (const [path, method] of [['/health', 'GET'], ['/home', 'GET'], ['/movies', 'GET'], ['/branches', 'GET'], ['/branches/branch-a/shows', 'GET'], ['/auth/login', 'POST'], ['/auth/register', 'POST'], ['/auth/logout', 'POST']]) {
      fetch.mockResolvedValueOnce(success())
      expect(await client.api(path, { method })).toEqual(data)
    }
    expect(paths()).not.toContain('/api/request-access')
  })
})
