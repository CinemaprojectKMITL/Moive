import { resolveAccessPolicy } from '../../shared/apiAccessPolicy.js'
import { ApiError, sendApiRequest } from './transport.js'

const memoryCache = new Map()
const bootstrapRequests = new Map()
const readRequests = new Map()
let authenticatedUserId = null
let identityVersion = 0
const prefix = 'api-request:'
const cacheKey = (userId, policy) => prefix + [userId, policy.resourceType, policy.resourceId, policy.scope].map(encodeURIComponent).join(':')
const refreshCodes = new Set(['API_REQUEST_ID_INVALID', 'API_REQUEST_ID_EXPIRED', 'API_REQUEST_ID_MISMATCH'])

export function setApiUser(user) {
  const nextId = user?.id || user?._id || null
  if (nextId !== authenticatedUserId) identityVersion += 1
  authenticatedUserId = nextId
  if (!nextId) {
    memoryCache.clear()
    try {
      const storage = window.sessionStorage
      for (let i = storage.length - 1; i >= 0; i -= 1) {
        const key = storage.key(i)
        if (key?.startsWith(prefix)) storage.removeItem(key)
      }
    } catch { /* Storage can be disabled. */ }
  }
}

function clearAccess(key) {
  memoryCache.delete(key)
  try { window.sessionStorage.removeItem(key) } catch { /* Storage can be disabled. */ }
}

function readAccess(key) {
  let raw
  try { raw = window.sessionStorage.getItem(key) } catch { raw = memoryCache.get(key) }
  let record
  try { record = JSON.parse(raw || 'null') } catch { record = null }
  if (record && typeof record.apiRequestId === 'string' && record.apiRequestId && typeof record.userId === 'string' && Number.isFinite(record.expiresAt) && Date.now() < record.expiresAt) return record
  clearAccess(key)
  return null
}

async function bootstrap(policy, path, options, userId, movie, version) {
  const key = JSON.stringify([version, userId, policy])
  if (!bootstrapRequests.has(key)) {
    const operation = (async () => {
      const startedAt = Date.now()
      const metadata = movie
        ? await sendApiRequest(`/movies/${encodeURIComponent(policy.resourceId)}/request-access`, { method: 'POST' })
        : await sendApiRequest('/request-access', { method: 'POST', body: { method: options.method || 'GET', path, context: policy.resourceType === 'booking' && policy.scope === 'create' ? { showId: policy.resourceId } : policy.resourceType === 'admin-ticket' ? { consume: policy.scope === 'consume' } : undefined } })
      const resolvedUserId = metadata.userId || userId
      const expiresAt = metadata.expiresAt ? Date.parse(metadata.expiresAt) : startedAt + Number(metadata.expiresIn) * 1000
      if (!resolvedUserId || userId && resolvedUserId !== userId || typeof metadata.apiRequestId !== 'string' || !metadata.apiRequestId || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new ApiError('Invalid API access response', 502, 'INVALID_API_ACCESS')
      if (version !== identityVersion) throw new ApiError('Session changed during request', 401, 'SESSION_CHANGED')
      const record = { userId: resolvedUserId, apiRequestId: metadata.apiRequestId, expiresAt }
      const raw = JSON.stringify(record)
      memoryCache.set(cacheKey(resolvedUserId, policy), raw)
      try { window.sessionStorage.setItem(cacheKey(resolvedUserId, policy), raw) } catch { /* Use RAM fallback. */ }
      return record
    })().finally(() => bootstrapRequests.delete(key))
    bootstrapRequests.set(key, operation)
  }
  return bootstrapRequests.get(key)
}

async function performScopedRequest(path, options, policy, userId, movie, settings) {
  const version = identityVersion
  let access = userId ? readAccess(cacheKey(userId, policy)) : null
  if (!access || access.userId !== userId) access = await bootstrap(policy, path, options, userId, movie, version)
  const send = (record) => {
    if (identityVersion !== version) throw new ApiError('Session changed during request', 401, 'SESSION_CHANGED')
    const headers = new Headers(options.headers)
    headers.set('X-API-User-ID', record.userId)
    headers.set('X-API-Request-ID', record.apiRequestId)
    const target = movie ? `/movies/${encodeURIComponent(policy.resourceId)}/${encodeURIComponent(record.userId)}/${encodeURIComponent(record.apiRequestId)}` : path
    return sendApiRequest(target, { ...options, headers }, settings)
  }
  try {
    return await send(access)
  } catch (error) {
    // Only pre-controller access rejection codes authorize a replay, never business errors.
    if (!refreshCodes.has(error.code)) throw error
    const key = cacheKey(access.userId, policy)
    if (readAccess(key)?.apiRequestId === access.apiRequestId) clearAccess(key)
    access = readAccess(key) || await bootstrap(policy, path, options, userId, movie, version)
    try { return await send(access) } catch (retryError) {
      if (refreshCodes.has(retryError.code) && readAccess(key)?.apiRequestId === access.apiRequestId) clearAccess(key)
      throw retryError
    }
  }
}

export function scopedApiResponse(path, options = {}, settings = {}, movieAccess = null) {
  let body = options.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = null } }
  const policy = movieAccess ? { resourceType: 'movie', resourceId: String(movieAccess.movieId), scope: 'read' } : resolveAccessPolicy(options.method || 'GET', path, body)
  if (!policy) return sendApiRequest(path, options, settings)
  const userId = movieAccess?.userId || authenticatedUserId
  const run = () => performScopedRequest(path, options, policy, userId, Boolean(movieAccess), settings)
  if ((options.method || 'GET').toUpperCase() !== 'GET') return run()
  const key = JSON.stringify([identityVersion, userId, path, policy])
  if (!readRequests.has(key)) readRequests.set(key, run().finally(() => readRequests.delete(key)))
  return readRequests.get(key)
}
