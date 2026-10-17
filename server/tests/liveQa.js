import crypto from 'node:crypto'
import { resolveAccessPolicy } from '../../shared/apiAccessPolicy.js'

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:3000/api'
const runId = crypto.randomUUID()

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function rawCall(path, { cookie, method = 'GET', body, access } = {}) {
  const options = {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...(access ? { 'X-API-User-ID': access.userId, 'X-API-Request-ID': access.apiRequestId } : {}) },
  }
  if (body) options.body = JSON.stringify(body)
  const response = await fetch(`${baseUrl}${path}`, options)
  const payload = await response.json()
  return { response, payload, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}

const accessCache = new Map()
async function call(path, options = {}) {
  const policy = resolveAccessPolicy(options.method || 'GET', path, options.body)
  if (!policy) return rawCall(path, options)
  const key = JSON.stringify([options.cookie, policy])
  let access = accessCache.get(key)
  const bootstrap = async () => {
    const result = await rawCall('/request-access', { cookie: options.cookie, method: 'POST', body: { method: options.method || 'GET', path, context: { showId: options.body?.showId, consume: options.body?.consume } } })
    if (result.response.status === 200) accessCache.set(key, result.payload)
    return result
  }
  if (!access || Date.now() >= Date.parse(access.expiresAt)) {
    const result = await bootstrap()
    if (result.response.status !== 200) return result
    access = result.payload
  }
  let result = await rawCall(path, { ...options, access })
  if (['API_REQUEST_ID_INVALID', 'API_REQUEST_ID_EXPIRED', 'API_REQUEST_ID_MISMATCH'].includes(result.payload.code)) {
    accessCache.delete(key)
    const refreshed = await bootstrap()
    if (refreshed.response.status !== 200) return refreshed
    result = await rawCall(path, { ...options, access: refreshed.payload })
  }
  return result
}

async function register(username) {
  const result = await call('/auth/register', { method: 'POST', body: { username, password: 'live-qa-password-123', displayName: username } })
  assert(result.response.status === 201, `Registration failed: ${result.payload.message}`)
  return result.cookie
}

const health = await call('/health')
assert(health.payload.data.status === 'ok' && health.payload.data.database === 'connected', 'Health check failed')

const home = await call('/home')
assert(home.payload.data.branches.length === 5, 'Expected five seeded branches')
assert(home.payload.data.theaterCount === 25, 'Expected twenty-five seeded theaters')
assert(home.payload.data.movies.length > 0, 'Expected seeded now-showing movies')

const cookieA = await register(`qa-a-${runId}`)
const cookieB = await register(`qa-b-${runId}`)
const movie = home.payload.data.movies[0]
const movieAccess = await call(`/movies/${movie._id}/request-access`, { cookie: cookieA, method: 'POST' })
assert(movieAccess.response.status === 200, 'Movie bootstrap failed')
const movieDetails = await call(`/movies/${movie._id}/${movieAccess.payload.userId}/${movieAccess.payload.apiRequestId}`, { cookie: cookieA })
const show = movieDetails.payload.data.shows[0]
assert(show, 'Expected a future seeded show')
const seatMap = await call(`/shows/${show._id}/seats`, { cookie: cookieA })
assert(seatMap.payload.data.seats.length === 300, 'Expected a 300-seat show map')
const available = seatMap.payload.data.seats.filter((seat) => seat.status === 'available')
assert(available.length >= 3, 'Expected available QA seats')

const bookingResult = await call('/bookings', { cookie: cookieA, method: 'POST', body: { showId: show._id, seats: [available[0].seatCode], idempotencyKey: `qa-book-${runId}` } })
assert(bookingResult.response.status === 201, `Checkout failed: ${bookingResult.payload.message}`)
const booking = bookingResult.payload.data

const paymentQr = await call(`/bookings/${booking._id}/payment-qr`, { cookie: cookieA })
assert(paymentQr.response.status === 200 && paymentQr.payload.data.dataUrl.startsWith('data:image/svg+xml;base64,'), 'PromptPay QR was not generated; configure a valid backend target')
assert(paymentQr.payload.data.amount === booking.totalPrice, 'Payment amount differs from booking')
assert(paymentQr.payload.data.expiresAt === booking.expiresAt, 'QR changed the booking expiry')
const paymentBooking = await call(`/bookings/${booking._id}`, { cookie: cookieA })
assert(paymentBooking.payload.data.status === 'pending', 'QR must leave payment pending')
const ticket = await call(`/bookings/${booking._id}/ticket-qr`, { cookie: cookieA })
assert(ticket.response.status === 409, 'Unverified payment must not issue a ticket')
const adminLogin = await call('/auth/login', { method: 'POST', body: { username: process.env.QA_ADMIN_USERNAME || 'admin', password: process.env.QA_ADMIN_PASSWORD || 'change-me' } })
assert(adminLogin.response.status === 200 && adminLogin.payload.data.user.role === 'admin', 'Seeded admin login failed')
const analytics = await call('/admin/analytics', { cookie: adminLogin.cookie })
assert(analytics.response.status === 200 && analytics.payload.data.kpis, 'Admin analytics failed')
const userAdminAttempt = await call('/admin/analytics', { cookie: cookieA })
assert(userAdminAttempt.response.status === 403, 'Normal user reached admin analytics')

const raceSeat = available[1].seatCode
const raceResponses = await Promise.all([
  call('/bookings', { cookie: cookieA, method: 'POST', body: { showId: show._id, seats: [raceSeat], idempotencyKey: `qa-race-a-${runId}` } }),
  call('/bookings', { cookie: cookieB, method: 'POST', body: { showId: show._id, seats: [raceSeat], idempotencyKey: `qa-race-b-${runId}` } }),
])
assert(raceResponses.every((result) => result.response.status === 409 && result.payload.code === 'RACE_CONFLICT'), 'Strict race did not cancel both attempts')
const refreshed = await call(`/shows/${show._id}/seats`, { cookie: cookieA })
assert(refreshed.payload.data.seats.find((seat) => seat.seatCode === raceSeat).status === 'available', 'Strict race left a seat locked')

console.log(JSON.stringify({
  status: 'ok',
  health: health.payload.data,
  catalog: { branches: home.payload.data.branches.length, theaters: home.payload.data.theaterCount, movies: home.payload.data.movies.length, showSeats: seatMap.payload.data.seats.length },
  booking: { id: booking._id, status: paymentBooking.payload.data.status, ticketIssued: false },
  admin: { login: true, analytics: true, userBlocked: true },
  strictRace: { seat: raceSeat, responses: raceResponses.map((result) => result.payload.code), finalSeatStatus: 'available' },
}, null, 2))
