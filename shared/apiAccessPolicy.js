// Explicit operation allowlist shared by the server gate and browser transport.
// Query filters/pagination do not change authority within a scoped collection.
export const protectedEndpoints = [
  ['GET', '/home', 'home', 'read', 'collection'],
  ['GET', '/auth/me', 'profile', 'read', 'self'],
  ['GET', '/shows/:id/seats', 'seat', 'read', 'id'],
  ['POST', '/bookings', 'booking', 'create', 'showId'],
  ['GET', '/bookings/me', 'booking', 'list', 'self'],
  ['GET', '/bookings/:id', 'booking', 'read', 'id'],
  ['POST', '/bookings/:id/cancel', 'booking', 'cancel', 'id'],
  ['GET', '/bookings/:id/payment-qr', 'payment', 'generate-qr', 'id'],
  ['GET', '/bookings/:id/ticket-qr', 'ticket', 'read', 'id'],
  ['POST', '/bookings/:id/debug-confirm-payment', 'payment', 'debug-confirm', 'id'],
  ['GET', '/admin/analytics', 'admin-analytics', 'read', 'collection'],
  ['POST', '/admin/tickets/verify', 'admin-ticket', 'verify', 'collection'],
  ...['movies', 'branches', 'theaters', 'shows', 'banners'].flatMap((resource) => [
    ['GET', `/admin/${resource}`, `admin-${resource}`, 'list', 'collection'],
    ['POST', `/admin/${resource}`, `admin-${resource}`, 'create', 'collection'],
    ['PATCH', `/admin/${resource}/:id`, `admin-${resource}`, 'update', 'id'],
  ]),
  ['DELETE', '/admin/movies/:id', 'admin-movies', 'archive', 'id'],
  ['POST', '/admin/movies/:id/poster', 'admin-movies', 'upload', 'id'],
  ['DELETE', '/admin/banners/:id', 'admin-banners', 'disable', 'id'],
  ['POST', '/admin/banners/:id/image', 'admin-banners', 'upload', 'id'],
  ['GET', '/admin/bookings', 'admin-bookings', 'list', 'collection'],
]

export function resolveAccessPolicy(method, path, body = {}) {
  method = method.toUpperCase() === 'HEAD' ? 'GET' : method.toUpperCase()
  const pathname = path.split('?')[0].replace(/^\/api(?=\/|$)/, '').replace(/\/+$/, '') || '/'
  for (const [verb, template, resourceType, scope, binding] of protectedEndpoints) {
    if (method !== verb) continue
    const match = pathname.match(new RegExp(`^${template.replace(':id', '([^/]+)')}$`, 'i'))
    if (!match) continue
    const resourceId = binding === 'id' ? decodeURIComponent(match[1]) : binding === 'showId' ? body?.showId : binding
    return { method: verb, template, resourceType, scope: resourceType === 'admin-ticket' && body?.consume === true ? 'consume' : scope, resourceId: String(resourceId ?? ''), admin: template.startsWith('/admin/') }
  }
  return null
}
