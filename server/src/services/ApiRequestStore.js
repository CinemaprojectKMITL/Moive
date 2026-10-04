import crypto from 'node:crypto'

const REQUEST_TTL_MS = 30 * 60 * 1000
const apiRequestStore = new Map()
const activeRequestByUserResource = new Map()
const resourceKey = (userId, movieId) => JSON.stringify([String(userId), String(movieId)])

function removeRequest(apiRequestId, record) {
  apiRequestStore.delete(apiRequestId)
  const key = resourceKey(record.userId, record.movieId)
  if (activeRequestByUserResource.get(key) === apiRequestId) activeRequestByUserResource.delete(key)
}

export function getOrCreateApiRequestId(userId, movieId) {
  const key = resourceKey(userId, movieId)
  const existingId = activeRequestByUserResource.get(key)
  const existing = apiRequestStore.get(existingId)
  const now = Date.now()
  if (existing && now < existing.expiresAt) return { apiRequestId: existingId, expiresAt: existing.expiresAt }
  if (existing) removeRequest(existingId, existing)
  else activeRequestByUserResource.delete(key)

  const apiRequestId = crypto.randomUUID()
  const record = { userId: String(userId), movieId: String(movieId), createdAt: now, expiresAt: now + REQUEST_TTL_MS }
  apiRequestStore.set(apiRequestId, record)
  activeRequestByUserResource.set(key, apiRequestId)
  return { apiRequestId, expiresAt: record.expiresAt }
}

export function validateApiRequestId(apiRequestId, userId, movieId) {
  const record = apiRequestStore.get(apiRequestId)
  if (!record) return { valid: false, reason: 'invalid' }
  if (Date.now() >= record.expiresAt) {
    removeRequest(apiRequestId, record)
    return { valid: false, reason: 'expired' }
  }
  if (record.userId !== String(userId) || record.movieId !== String(movieId)) return { valid: false, reason: 'mismatch' }
  return { valid: true, record: { ...record } }
}

const cleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const [id, record] of apiRequestStore) {
    if (now >= record.expiresAt) removeRequest(id, record)
  }
}, 60 * 1000)
cleanupTimer.unref?.()
