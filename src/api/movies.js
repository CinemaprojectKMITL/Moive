import { ApiError, apiResponse } from './client'

const memoryCache = new Map()
const pendingRequests = new Map()
const cacheKey = (movieId, userId) => `movie-api-request:${encodeURIComponent(userId)}:${encodeURIComponent(movieId)}`

function clearCachedRequest(key) {
  memoryCache.delete(key)
  try { window.sessionStorage.removeItem(key) } catch { /* Storage may be unavailable. */ }
}

function getCachedRequest(key, movieId, userId) {
  let raw
  try { raw = window.sessionStorage.getItem(key) } catch { raw = memoryCache.get(key) }
  let record
  try { record = raw ? JSON.parse(raw) : null } catch { record = null }
  if (record?.movieId === movieId && record?.userId === userId && typeof record.apiRequestId === 'string' && record.apiRequestId && Number.isFinite(record.expiresAt) && Date.now() < record.expiresAt) return record
  clearCachedRequest(key)
  return null
}

async function fetchMovie(movieId, userId, key) {
  const path = `/movies/${encodeURIComponent(movieId)}`
  const cached = userId ? getCachedRequest(key, movieId, userId) : null
  if (cached) {
    try {
      const response = await apiResponse(`${path}/${encodeURIComponent(userId)}/${encodeURIComponent(cached.apiRequestId)}`, {}, { notifyUnauthorized: false })
      return response.data
    } catch (error) {
      if (error.status !== 401 && error.status !== 403) throw error
      clearCachedRequest(key)
    }
  }

  // One authenticated bootstrap per operation; the following read never loops back here.
  const startedAt = Date.now()
  const response = await apiResponse(`${path}/request-access`, { method: 'POST' })
  if (userId && typeof response.apiRequestId === 'string' && response.apiRequestId) {
    const expiresAt = response.expiresAt
      ? Date.parse(response.expiresAt)
      : startedAt + Number(response.expiresIn) * 1000
    if (Number.isFinite(expiresAt) && Date.now() < expiresAt) {
      const record = JSON.stringify({ apiRequestId: response.apiRequestId, movieId, userId, expiresAt })
      memoryCache.set(key, record)
      try { window.sessionStorage.setItem(key, record) } catch { /* Keep the memory fallback. */ }
      return (await apiResponse(`${path}/${encodeURIComponent(userId)}/${encodeURIComponent(response.apiRequestId)}`)).data
    }
  }
  throw new ApiError('Invalid movie access response', 502, 'INVALID_MOVIE_ACCESS')
}

export function getMovie(movieId, userId) {
  if (!userId) return Promise.reject(new ApiError('กรุณาเข้าสู่ระบบ', 401, 'UNAUTHORIZED'))
  movieId = String(movieId)
  userId = userId == null ? '' : String(userId)
  const key = cacheKey(movieId, userId)
  if (!pendingRequests.has(key)) {
    const request = fetchMovie(movieId, userId, key).finally(() => pendingRequests.delete(key))
    pendingRequests.set(key, request)
  }
  return pendingRequests.get(key)
}
