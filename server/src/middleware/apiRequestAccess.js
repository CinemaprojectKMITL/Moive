import { resolveAccessPolicy } from '../../../shared/apiAccessPolicy.js'
import { authorizeApiAccess } from '../services/ApiAccessService.js'
import { getOrCreateApiRequestId, validateApiRequestId } from '../services/ApiRequestStore.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { badRequest, notFound } from '../utils/errors.js'
import { requireAuth } from './auth.js'

export function sendRequestIdError(res, reason) {
  const errors = { invalid: 'Invalid API request ID', expired: 'API request ID expired', mismatch: 'API request ID does not match this user or resource' }
  return res.status(reason === 'mismatch' ? 403 : 401).json({ success: false, code: `API_REQUEST_ID_${reason.toUpperCase()}`, error: errors[reason] })
}

export function sendAccessMetadata(res, userId, access) {
  const { apiRequestId, expiresAt } = getOrCreateApiRequestId(userId, access)
  res.set('Cache-Control', 'private, no-store')
  return res.json({ success: true, userId: String(userId), apiRequestId, expiresIn: Math.ceil((expiresAt - Date.now()) / 1000), expiresAt: new Date(expiresAt).toISOString() })
}

export const bootstrapApiAccess = asyncHandler(async (req, res) => {
  const { method, path, context } = req.body || {}
  if (typeof method !== 'string' || typeof path !== 'string') throw badRequest('method and path are required')
  const policy = resolveAccessPolicy(method, path, context)
  if (!policy) throw notFound()
  const access = await authorizeApiAccess(policy, req.user)
  return sendAccessMetadata(res, req.user._id, access)
})

const enforceAccess = asyncHandler(async (req, res, next) => {
  const access = await authorizeApiAccess(req.apiAccessPolicy, req.user)
  res.set('Cache-Control', 'private, no-store')
  if (!req.get('X-API-User-ID')) return sendRequestIdError(res, 'invalid')
  if (req.get('X-API-User-ID') !== String(req.user._id)) {
    return res.status(403).json({ success: false, code: 'API_REQUEST_USER_MISMATCH', error: 'User ID does not match authenticated user' })
  }
  const result = validateApiRequestId(req.get('X-API-Request-ID'), req.user._id, access)
  if (!result.valid) return sendRequestIdError(res, result.reason)
  return next()
})

export function apiRequestAccess(req, res, next) {
  const policy = resolveAccessPolicy(req.method, req.path, req.body)
  if (!policy) {
    // These namespaces fail closed if a future route is missing from the policy.
    if (/^\/(?:admin|bookings)(?:\/|$)/i.test(req.path)) return next(notFound())
    return next()
  }
  req.apiAccessPolicy = policy
  return requireAuth(req, res, (error) => error ? next(error) : enforceAccess(req, res, next))
}
