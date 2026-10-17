import { describe, expect, it } from 'vitest'
import { protectedEndpoints, resolveAccessPolicy } from '../../shared/apiAccessPolicy.js'
import publicRoutes from '../src/routes/publicRoutes.js'
import authRoutes from '../src/routes/authRoutes.js'
import bookingRoutes from '../src/routes/bookingRoutes.js'
import adminRoutes from '../src/routes/adminRoutes.js'
import { createApp } from '../src/app.js'

const publicControls = new Set([
  'GET /home', 'GET /movies', 'GET /branches', 'GET /branches/:id', 'GET /branches/:id/shows',
  'POST /auth/register', 'POST /auth/login', 'POST /auth/logout',
])
const movieFlow = new Set(['POST /movies/:id/request-access', 'GET /movies/:id/:userId/:apiRequestId'])

function endpoints(router, prefix = '') {
  return router.stack.flatMap((layer) => layer.route
    ? Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${prefix}${layer.route.path === '/' ? '' : layer.route.path}`)
    : layer.handle.stack ? endpoints(layer.handle, prefix) : [])
}

describe('complete route inventory', () => {
  it('keeps only health and authenticated bootstrap registered directly on the app', () => {
    const directRoutes = createApp().router.stack.filter((layer) => layer.route).map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`)
    expect(directRoutes).toEqual(['GET /api/health', 'POST /api/request-access'])
  })
  it('classifies every registered route and covers every shared access policy', () => {
    const registered = [...endpoints(publicRoutes), ...endpoints(authRoutes, '/auth'), ...endpoints(bookingRoutes, '/bookings'), ...endpoints(adminRoutes, '/admin')]
    const protectedKeys = new Set(protectedEndpoints.map(([method, path]) => `${method} ${path}`))
    for (const endpoint of registered) expect(publicControls.has(endpoint) || movieFlow.has(endpoint) || protectedKeys.has(endpoint), `Unclassified endpoint: ${endpoint}`).toBe(true)
    for (const endpoint of protectedKeys) expect(registered, `Unused access policy: ${endpoint}`).toContain(endpoint)
    expect(registered).not.toContain('GET /movies/:id')
    expect(registered).not.toContain('GET /movies/:id/shows')
  })

  it('distinguishes ticket verification from consumption and booking creation by show', () => {
    expect(resolveAccessPolicy('POST', '/admin/tickets/verify', { consume: false }).scope).toBe('verify')
    expect(resolveAccessPolicy('POST', '/admin/tickets/verify', { consume: true }).scope).toBe('consume')
    expect(resolveAccessPolicy('POST', '/bookings', { showId: 'show-a' }).resourceId).toBe('show-a')
    expect(resolveAccessPolicy('POST', '/bookings', { showId: 'show-b' }).resourceId).toBe('show-b')
  })
})
