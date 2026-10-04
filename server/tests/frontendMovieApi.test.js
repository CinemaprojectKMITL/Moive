import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let getMovie
let client
let storage
let dispatchEvent
const movieData = { movie: { _id: 'movie-a', title: 'Movie A' }, shows: [] }
const key = (user = 'user-a', movie = 'movie-a') => `movie-api-request:${user}:${movie}`
const response = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
const initial = (id = 'request-a', expiresAt = Date.now() + 1_800_000) => ({ success: true, apiRequestId: id, expiresAt: new Date(expiresAt).toISOString(), expiresIn: 1800 })
const cache = (expiresAt = Date.now() + 1_800_000) => storage.set(key(), JSON.stringify({ userId: 'user-a', movieId: 'movie-a', apiRequestId: 'request-a', expiresAt }))
const paths = () => fetch.mock.calls.map(([path]) => path)

beforeEach(async () => {
  vi.resetModules()
  storage = new Map()
  dispatchEvent = vi.fn()
  vi.stubGlobal('window', { sessionStorage: { getItem: (name) => storage.get(name) ?? null, setItem: (name, value) => storage.set(name, value), removeItem: (name) => storage.delete(name) }, dispatchEvent })
  vi.stubGlobal('fetch', vi.fn(async () => response({ success: true, data: movieData })))
  ;({ getMovie } = await import('../../src/api/movies.js'))
  client = await import('../../src/api/client.js')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('frontend movie request IDs', () => {
  it('returns the existing movie payload, caches metadata, and reuses the exact ID and expiry', async () => {
    const payload = initial()
    fetch.mockResolvedValueOnce(response(payload)).mockResolvedValueOnce(response({ success: true, data: movieData }))
    expect(await getMovie('movie-a', 'user-a')).toEqual(movieData)
    const cached = storage.get(key())
    expect(JSON.parse(cached)).toEqual({ userId: 'user-a', movieId: 'movie-a', apiRequestId: payload.apiRequestId, expiresAt: Date.parse(payload.expiresAt) })
    expect(await getMovie('movie-a', 'user-a')).toEqual(movieData)
    expect(paths()).toEqual(['/api/movies/movie-a/request-access', '/api/movies/movie-a/user-a/request-a', '/api/movies/movie-a/user-a/request-a'])
    expect(storage.get(key())).toBe(cached)
    for (const [, options] of fetch.mock.calls) expect(options.credentials).toBe('include')
    expect(fetch.mock.calls[0][1].method).toBe('POST')
    expect(fetch.mock.calls[1][1].method).toBeUndefined()
  })

  it('reuses sessionStorage after the module is reloaded, as on a page refresh', async () => {
    fetch.mockResolvedValueOnce(response(initial()))
    await getMovie('movie-a', 'user-a')
    vi.resetModules()
    const fresh = await import('../../src/api/movies.js')
    fetch.mockResolvedValueOnce(response({ success: true, data: movieData }))
    await fresh.getMovie('movie-a', 'user-a')
    expect(paths().at(-1)).toBe('/api/movies/movie-a/user-a/request-a')
  })

  it('removes an expired cache entry at the exact deadline before obtaining a new ID', async () => {
    cache(Date.now())
    fetch.mockImplementationOnce(() => {
      expect(storage.has(key())).toBe(false)
      return Promise.resolve(response(initial('replacement')))
    })
    expect(await getMovie('movie-a', 'user-a')).toEqual(movieData)
    expect(paths()).toEqual(['/api/movies/movie-a/request-access', '/api/movies/movie-a/user-a/replacement'])
    expect(JSON.parse(storage.get(key())).apiRequestId).toBe('replacement')
  })

  it.each([401, 403])('recovers once from token status %s without clearing auth state', async (status) => {
    cache()
    fetch.mockResolvedValueOnce(response({ success: false, error: 'Invalid API request ID' }, status)).mockImplementationOnce(() => {
      expect(storage.has(key())).toBe(false)
      return Promise.resolve(response(initial('replacement')))
    })
    expect(await getMovie('movie-a', 'user-a')).toEqual(movieData)
    expect(paths()).toEqual(['/api/movies/movie-a/user-a/request-a', '/api/movies/movie-a/request-access', '/api/movies/movie-a/user-a/replacement'])
    expect(dispatchEvent).not.toHaveBeenCalled()
    expect(JSON.parse(storage.get(key())).apiRequestId).toBe('replacement')
  })

  it('stops after one recovery request and retains normal handling of an expired login', async () => {
    cache()
    fetch.mockResolvedValueOnce(response({ success: false, error: 'API request ID expired' }, 401)).mockResolvedValueOnce(response({ success: false, message: 'Login expired', code: 'UNAUTHORIZED' }, 401))
    await expect(getMovie('movie-a', 'user-a')).rejects.toMatchObject({ status: 401, message: 'Login expired' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(storage.has(key())).toBe(false)
    expect(dispatchEvent).toHaveBeenCalledOnce()
    expect(dispatchEvent.mock.calls[0][0].type).toBe('auth:unauthorized')
  })

  it.each([404, 500])('propagates status %s without refreshing a valid cached ID', async (status) => {
    cache()
    const before = storage.get(key())
    fetch.mockResolvedValueOnce(response({ success: false, message: 'Failed' }, status))
    await expect(getMovie('movie-a', 'user-a')).rejects.toMatchObject({ status })
    expect(fetch).toHaveBeenCalledOnce()
    expect(storage.get(key())).toBe(before)
  })

  it('shares concurrent initial loads and concurrent recovery operations', async () => {
    let finish
    fetch.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const first = getMovie('movie-a', 'user-a')
    const second = getMovie('movie-a', 'user-a')
    expect(second).toBe(first)
    expect(fetch).toHaveBeenCalledOnce()
    finish(response(initial()))
    expect(await first).toEqual(movieData)
    fetch.mockResolvedValueOnce(response({ success: false, error: 'Invalid API request ID' }, 401)).mockResolvedValueOnce(response(initial('replacement')))
    const retryA = getMovie('movie-a', 'user-a')
    const retryB = getMovie('movie-a', 'user-a')
    expect(retryA).toBe(retryB)
    await retryA
    expect(fetch).toHaveBeenCalledTimes(5)
  })

  it('isolates users and movies and refuses anonymous requests without calling the API', async () => {
    cache()
    fetch.mockResolvedValueOnce(response(initial('user-b-id')))
    await getMovie('movie-a', 'user-b')
    fetch.mockResolvedValueOnce(response(initial('movie-b-id')))
    await getMovie('movie-b', 'user-a')
    await expect(getMovie('movie-a')).rejects.toMatchObject({ status: 401 })
    expect(paths()).toEqual(['/api/movies/movie-a/request-access', '/api/movies/movie-a/user-b/user-b-id', '/api/movies/movie-b/request-access', '/api/movies/movie-b/user-a/movie-b-id'])
    expect(JSON.parse(storage.get(key())).apiRequestId).toBe('request-a')
    expect(JSON.parse(storage.get(key('user-b'))).apiRequestId).toBe('user-b-id')
    expect(storage.has(key('', 'movie-a'))).toBe(false)
  })

  it('does not bootstrap again when the protected read with a refreshed ID fails', async () => {
    cache()
    fetch.mockResolvedValueOnce(response({ success: false, error: 'Invalid API request ID' }, 401))
      .mockResolvedValueOnce(response(initial('replacement')))
      .mockResolvedValueOnce(response({ success: false, error: 'Invalid API request ID' }, 401))
    await expect(getMovie('movie-a', 'user-a')).rejects.toMatchObject({ status: 401 })
    expect(paths()).toEqual(['/api/movies/movie-a/user-a/request-a', '/api/movies/movie-a/request-access', '/api/movies/movie-a/user-a/replacement'])
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('rejects bootstrap responses missing valid request ID metadata without reading data', async () => {
    fetch.mockResolvedValueOnce(response({ success: true, data: movieData }))
    await expect(getMovie('movie-a', 'user-a')).rejects.toMatchObject({ status: 502, code: 'INVALID_MOVIE_ACCESS' })
    expect(paths()).toEqual(['/api/movies/movie-a/request-access'])
    expect(storage.has(key())).toBe(false)
  })

  it.each(['not JSON', JSON.stringify({ userId: 'wrong-user', movieId: 'movie-a', apiRequestId: 'bad', expiresAt: 9e15 })])('discards malformed or mismatched cache records', async (raw) => {
    storage.set(key(), raw)
    fetch.mockResolvedValueOnce(response(initial()))
    await getMovie('movie-a', 'user-a')
    expect(paths()).toEqual(['/api/movies/movie-a/request-access', '/api/movies/movie-a/user-a/request-a'])
  })

  it('uses RAM when sessionStorage is blocked', async () => {
    window.sessionStorage = { getItem: () => { throw new Error('Blocked') }, setItem: () => { throw new Error('Blocked') }, removeItem: () => { throw new Error('Blocked') } }
    fetch.mockResolvedValueOnce(response(initial())).mockResolvedValueOnce(response({ success: true, data: movieData }))
    await getMovie('movie-a', 'user-a')
    await getMovie('movie-a', 'user-a')
    expect(paths().at(-1)).toBe('/api/movies/movie-a/user-a/request-a')
  })

  it('uses expiresIn conservatively from the start of the request when expiresAt is absent', async () => {
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    fetch.mockImplementationOnce(() => {
      clock.mockReturnValue(now + 1000)
      return Promise.resolve(response({ success: true, apiRequestId: 'request-a', expiresIn: 1800 }))
    })
    await getMovie('movie-a', 'user-a')
    expect(JSON.parse(storage.get(key())).expiresAt).toBe(now + 1_800_000)
  })
})

describe('existing shared API behavior', () => {
  it('keeps unrelated apiGet data normalization, API prefix, credentials, and error details', async () => {
    fetch.mockResolvedValueOnce(response({ success: true, data: { bookings: [] }, apiRequestId: 'ignored' })).mockResolvedValueOnce(response({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED', details: { reason: 'expired' } }, 401))
    expect(await client.apiGet('/bookings/me')).toEqual({ bookings: [] })
    await expect(client.apiGet('/api/auth/me')).rejects.toMatchObject({ status: 401, message: 'Unauthorized', code: 'UNAUTHORIZED', details: { reason: 'expired' } })
    expect(paths()).toEqual(['/api/bookings/me', '/api/auth/me'])
    expect(fetch.mock.calls[0][1].credentials).toBe('include')
    expect(dispatchEvent).toHaveBeenCalledOnce()
  })

  it('preserves custom headers and JSON request bodies', async () => {
    fetch.mockResolvedValueOnce(response({ success: true, data: { saved: true } }))
    expect(await client.api('/bookings', { method: 'POST', headers: { 'X-Test': 'value' }, body: { seats: ['A1'] } })).toEqual({ saved: true })
    const options = fetch.mock.calls[0][1]
    expect(options.method).toBe('POST')
    expect(options.headers.get('X-Test')).toBe('value')
    expect(options.headers.get('Content-Type')).toBe('application/json')
    expect(options.body).toBe('{"seats":["A1"]}')
  })
})
