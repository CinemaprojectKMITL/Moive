import bcrypt from 'bcrypt'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import rawRequest from 'supertest'
import { scopedRequest as request } from './helpers/scopedRequest.js'
import { protectedEndpoints } from '../../shared/apiAccessPolicy.js'
import generatePayload from 'promptpay-qr'
import QRCode from 'qrcode'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

let replSet
let mongoose
let app
let models
let services
let env
let adminCookie
let userACookie
let userBCookie
let userA
let userB
let show
let testMediaRoot

const register = (username) => request(app).post('/api/auth/register').send({ username, password: 'secure-pass-123', displayName: username })
const cookieFrom = (response) => response.headers['set-cookie']

beforeAll(async () => {
  testMediaRoot = await mkdtemp(path.join(tmpdir(), 'cinema-test-media-'))
  process.env.MIGDATA_ROOT = testMediaRoot
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  process.env.NODE_ENV = 'test'
  process.env.MONGO_URI = replSet.getUri('cinema')
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-cinema-tests'
  process.env.STRICT_RACE_CANCEL_BOTH = 'false'
  process.env.RACE_WINDOW_MS = '25'
  process.env.PAYMENT_QR_TARGET = '000000000000001' // Synthetic wallet fixture, never a live recipient
  ;({ default: mongoose } = await import('mongoose'))
  const [{ connectDatabase }, { createApp }, userModule, branchModule, movieModule, theaterModule, showModule, showSeatModule, bookingModule, ticketModule, bookingServiceModule, paymentQrServiceModule, envModule] = await Promise.all([
    import('../src/config/database.js'), import('../src/app.js'), import('../src/models/User.js'), import('../src/models/Branch.js'), import('../src/models/Movie.js'), import('../src/models/Theater.js'), import('../src/models/Show.js'), import('../src/models/ShowSeat.js'), import('../src/models/Booking.js'), import('../src/models/Ticket.js'), import('../src/services/BookingService.js'), import('../src/services/PaymentQrService.js'), import('../src/config/env.js'),
  ])
  await connectDatabase({ attempts: 1 })
  app = createApp()
  models = { User: userModule.User, Branch: branchModule.Branch, Movie: movieModule.Movie, Theater: theaterModule.Theater, Show: showModule.Show, ShowSeat: showSeatModule.ShowSeat, Booking: bookingModule.Booking, Ticket: ticketModule.Ticket }
  services = { BookingService: bookingServiceModule.BookingService, PaymentQrService: paymentQrServiceModule.PaymentQrService }
  env = envModule.env
  await Promise.all(Object.values(models).map((Model) => Model.init()))

  const admin = await models.User.create({ username: 'admin', usernameNormalized: 'admin', passwordHash: await bcrypt.hash('admin-pass-123', 4), displayName: 'Admin', role: 'admin' })
  expect(admin.role).toBe('admin')
  const adminLogin = await request(app).post('/api/auth/login').send({ username: 'ADMIN', password: 'admin-pass-123' })
  adminCookie = cookieFrom(adminLogin)
  const resultA = await register('test-user-a')
  const resultB = await register('test-user-b')
  userACookie = cookieFrom(resultA)
  userBCookie = cookieFrom(resultB)
  userA = await models.User.findOne({ usernameNormalized: 'test-user-a' })
  userB = await models.User.findOne({ usernameNormalized: 'test-user-b' })
})

beforeEach(async () => {
  env.NODE_ENV = 'test'
  env.ENABLE_DEBUG_PAYMENT = false
  env.STRICT_RACE_CANCEL_BOTH = false
  env.PAYMENT_QR_TARGET = '000000000000001'
  await Promise.all([models.Booking.deleteMany({}), models.ShowSeat.deleteMany({}), models.Ticket.deleteMany({}), models.Show.deleteMany({}), models.Theater.deleteMany({}), models.Movie.deleteMany({}), models.Branch.deleteMany({})])
  const branch = await models.Branch.create({ name: 'Test Branch', code: 'TEST', address: 'Bangkok' })
  const movie = await models.Movie.create({ title: 'Test Movie', durationMinutes: 120, genres: ['Drama'] })
  const layout = [{ row: 'A', offset: 0, seats: ['A1', 'A2', 'A3'].map((code, index) => ({ code, type: index === 2 ? 'premium' : 'normal', enabled: true })) }]
  const theater = await models.Theater.create({ branchId: branch._id, name: 'Theater 1', code: 'T1', seatCount: 3, seatLayout: layout })
  const startsAt = new Date(Date.now() + 86_400_000)
  show = await models.Show.create({ movieId: movie._id, branchId: branch._id, theaterId: theater._id, startsAt, endsAt: new Date(startsAt.getTime() + 7_200_000), pricing: { normal: 220, premium: 350 }, status: 'open', bookingOpenAt: new Date(Date.now() - 1000), bookingCloseAt: startsAt })
  await models.ShowSeat.insertMany(layout[0].seats.map((seat) => ({ showId: show._id, seatCode: seat.code, seatType: seat.type, status: 'available', branchId: branch._id, theaterId: theater._id, movieId: movie._id, showTime: startsAt })))
})

afterAll(async () => {
  if (mongoose) await mongoose.disconnect()
  if (replSet) await replSet.stop()
  if (testMediaRoot) await rm(testMediaRoot, { recursive: true, force: true })
})

describe('authentication and authorization', () => {
  it('registers, normalizes duplicate usernames, logs in, and rejects a wrong password', async () => {
    const created = await register('UniqueUser')
    expect(created.status).toBe(201)
    expect(created.body.data.user).not.toHaveProperty('passwordHash')
    const duplicate = await register('uniqueuser')
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.code).toBe('USERNAME_TAKEN')
    const login = await request(app).post('/api/auth/login').send({ username: 'UNIQUEUSER', password: 'secure-pass-123' })
    expect(login.status).toBe(200)
    const wrong = await request(app).post('/api/auth/login').send({ username: 'uniqueuser', password: 'wrong-password' })
    expect(wrong.status).toBe(401)
  })

  it('requires authentication and blocks normal users from admin routes', async () => {
    expect((await request(app).get('/api/bookings/me')).status).toBe(401)
    expect((await request(app).get('/api/admin/movies').set('Cookie', userACookie)).status).toBe(403)
    expect((await request(app).post('/api/admin/movies').set('Cookie', userACookie).send({ title: 'Forbidden', durationMinutes: 90, genres: [] })).status).toBe(403)
    expect((await request(app).get('/api/admin/movies').set('Cookie', adminCookie)).status).toBe(200)
  })
})

describe('movie API request IDs', () => {
  const initial = (cookie = userACookie) => request(app).post(`/api/movies/${show.movieId}/request-access`).set('Cookie', cookie)
  const reuse = (id, userId = userA._id, movieId = show.movieId, cookie = userACookie) => request(app).get(`/api/movies/${movieId}/${userId}/${id}`).set('Cookie', cookie)

  it('blocks direct detail and shows bypasses even with authentication', async () => {
    for (const movieId of [show.movieId, '6a9d6a50e4141b46136898ca']) {
      for (const suffix of ['', '/shows']) {
        for (const cookie of [null, userACookie]) {
          const call = request(app).get(`/api/movies/${movieId}${suffix}`)
          if (cookie) call.set('Cookie', cookie)
          const result = await call
          expect(result.status).toBe(404)
          expect(result.body).not.toHaveProperty('data')
        }
      }
    }
    expect((await request(app).get(`/api/movies/${show.movieId}/request-access`)).status).toBe(404)
    expect((await request(app).post(`/api/movies/${show.movieId}/request-access`)).status).toBe(401)
    expect((await request(app).get('/api/admin/movies')).status).toBe(401)
    expect((await request(app).get('/api/admin/movies').set('Cookie', adminCookie)).status).toBe(200)
  })

  it('public catalogs expose summaries rather than full movie details', async () => {
    await models.Movie.updateOne({ _id: show.movieId }, { $set: { description: 'Protected movie description', originalTitle: 'Protected original title' } })
    for (const path of ['/api/movies', '/api/home', `/api/branches/${show.branchId}`, `/api/shows/${show._id}/seats`]) {
      const call = request(app).get(path)
      if (path.includes('/seats')) call.set('Cookie', userACookie)
      const response = await call
      expect(response.status).toBe(200)
      expect(JSON.stringify(response.body)).not.toContain('Protected movie')
      expect(JSON.stringify(response.body)).not.toContain('Protected original')
    }
    const access = await initial()
    expect(access.body).not.toHaveProperty('data')
    const details = await reuse(access.body.apiRequestId)
    expect(details.status).toBe(200)
    expect(details.body.data.movie.description).toBe('Protected movie description')
    expect(details.body.data.shows).toHaveLength(1)
  })

  it.each(['inactive', 'archived'])('refuses access to an %s movie', async (state) => {
    await models.Movie.updateOne({ _id: show.movieId }, { $set: state === 'inactive' ? { active: false } : { archived: true } })
    const response = await initial()
    expect(response.status).toBe(404)
    expect(response.body).not.toHaveProperty('apiRequestId')
  })

  it('bootstrap binds to the session user and ignores supplied user IDs', async () => {
    const response = await request(app).post(`/api/movies/${show.movieId}/request-access`).set('Cookie', userACookie).send({ userId: userB._id })
    expect(response.status).toBe(200)
    expect((await reuse(response.body.apiRequestId)).status).toBe(200)
    expect((await reuse(response.body.apiRequestId, userB._id, show.movieId, userBCookie)).status).toBe(403)
    await models.Movie.updateOne({ _id: show.movieId }, { $set: { archived: true } })
    expect((await reuse(response.body.apiRequestId)).status).toBe(404)
  })

  it('generates and reuses an ID with cookie or bearer authentication without writing to MongoDB', async () => {
    const collectionsBefore = await mongoose.connection.db.listCollections().toArray()
    const movieBefore = await models.Movie.findById(show.movieId).lean()
    const userBefore = await models.User.findById(userA._id).lean()
    const first = await initial()
    expect(first.status).toBe(200)
    expect(first.body.apiRequestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(first.body.expiresIn).toBe(1800)
    expect(first.headers['cache-control']).toContain('no-store')
    const second = await initial()
    expect(second.body.apiRequestId).toBe(first.body.apiRequestId)
    expect(second.body.expiresAt).toBe(first.body.expiresAt)
    const reused = await reuse(first.body.apiRequestId)
    expect(reused.status).toBe(200)
    expect(reused.body.success).toBe(true)
    expect(reused.body.data.movie._id).toBe(show.movieId.toString())
    expect(reused.body.data.shows).toHaveLength(1)
    expect(first.body).not.toHaveProperty('data')
    const bearer = decodeURIComponent(userACookie[0].split(';')[0].slice('cinema_session='.length))
    const viaBearer = await request(app).post(`/api/movies/${show.movieId}/request-access`).set('Authorization', `Bearer ${bearer}`)
    expect(viaBearer.status).toBe(200)
    expect(viaBearer.body.apiRequestId).toBe(first.body.apiRequestId)
    expect((await request(app).get(`/api/movies/${show.movieId}/${userA._id}/${first.body.apiRequestId}`).set('Authorization', `Bearer ${bearer}`)).status).toBe(200)
    expect(await mongoose.connection.db.listCollections().toArray()).toEqual(collectionsBefore)
    expect(await models.Movie.findById(show.movieId).lean()).toEqual(movieBefore)
    expect(await models.User.findById(userA._id).lean()).toEqual(userBefore)
  })

  it('rejects unknown IDs, missing/invalid authentication, URL impersonation, and wrong resources', async () => {
    const first = await initial()
    expect((await reuse('unknown')).body).toEqual({ success: false, code: 'API_REQUEST_ID_INVALID', error: 'Invalid API request ID' })
    expect((await reuse('unknown')).status).toBe(401)
    expect((await request(app).get(`/api/movies/${show.movieId}/${userA._id}/${first.body.apiRequestId}`)).status).toBe(401)
    expect((await request(app).post(`/api/movies/${show.movieId}/request-access`).set('Authorization', 'Bearer invalid')).status).toBe(401)
    const impersonation = await reuse(first.body.apiRequestId, userA._id, show.movieId, userBCookie)
    expect(impersonation.status).toBe(403)
    expect(impersonation.body.error).toBe('User ID does not match authenticated user')
    const otherUser = await reuse(first.body.apiRequestId, userB._id, show.movieId, userBCookie)
    expect(otherUser.status).toBe(403)
    expect(otherUser.body.error).toBe('API request ID does not match this user or resource')
    const otherMovie = await models.Movie.create({ title: 'Other movie', durationMinutes: 90 })
    const mismatch = await reuse(first.body.apiRequestId, userA._id, otherMovie._id)
    expect(mismatch.status).toBe(403)
    expect(mismatch.body.error).toBe('API request ID does not match this user or resource')
  })

  it('does not refresh expiry and rejects at the exact original deadline', async () => {
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    try {
      const first = await initial()
      expect(first.body.expiresAt).toBe(new Date(now + 1_800_000).toISOString())
      clock.mockReturnValue(now + 900_000)
      const second = await initial()
      expect(second.body.apiRequestId).toBe(first.body.apiRequestId)
      expect(second.body.expiresAt).toBe(first.body.expiresAt)
      expect(second.body.expiresIn).toBe(900)
      expect((await reuse(first.body.apiRequestId)).status).toBe(200)
      clock.mockReturnValue(now + 1_799_999)
      expect((await reuse(first.body.apiRequestId)).status).toBe(200)
      clock.mockReturnValue(now + 1_800_000)
      const expired = await reuse(first.body.apiRequestId)
      expect(expired.status).toBe(401)
      expect(expired.body).toEqual({ success: false, code: 'API_REQUEST_ID_EXPIRED', error: 'API request ID expired' })
      const replacement = await initial()
      expect(replacement.body.apiRequestId).not.toBe(first.body.apiRequestId)
      expect(replacement.body.expiresIn).toBe(1800)
    } finally {
      clock.mockRestore()
    }
  })

  it('preserves missing/malformed movie errors and does not issue tokens for failed lookups', async () => {
    const missing = await request(app).post(`/api/movies/${new mongoose.Types.ObjectId()}/request-access`).set('Cookie', userACookie)
    expect(missing.status).toBe(404)
    expect(missing.body).not.toHaveProperty('apiRequestId')
    const malformed = await request(app).post('/api/movies/invalid/request-access').set('Cookie', userACookie)
    expect(malformed.status).toBe(400)
    expect(malformed.body).not.toHaveProperty('apiRequestId')
  })

  it('keeps request IDs and internal failure details out of error logs and responses', async () => {
    const first = await initial()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const query = vi.spyOn(models.Movie, 'findOne').mockImplementationOnce(() => {
      throw new Error(`Internal failure ${first.body.apiRequestId}`)
    })
    try {
      const response = await reuse(first.body.apiRequestId)
      expect(response.status).toBe(500)
      expect(log).toHaveBeenCalledOnce()
      expect(JSON.stringify(log.mock.calls)).not.toContain(first.body.apiRequestId)
      expect(JSON.stringify(response.body)).not.toContain(first.body.apiRequestId)
      expect(response.body).not.toHaveProperty('stack')
    } finally {
      query.mockRestore()
      log.mockRestore()
    }
  })
})

describe('application-wide scoped API access', () => {
  const bootstrap = (method, path, cookie = userACookie, context) => rawRequest(app).post('/api/request-access').set('Cookie', cookie).send({ method, path, context })
  const withAccess = (method, path, metadata, cookie = userACookie) => rawRequest(app)[method](path).set('Cookie', cookie).set('X-API-User-ID', metadata.userId).set('X-API-Request-ID', metadata.apiRequestId)
  const reserve = () => services.BookingService.create({ userId: userA._id, showId: show._id, seatCodes: ['A1'], clientRequestId: 'scoped-api-booking' })

  it('rejects bare calls to every migrated endpoint before executing any operation', async () => {
    const booking = await reserve()
    const { Banner } = await import('../src/models/Banner.js')
    const banner = await Banner.create({ title: 'Scope test', imagePath: '/media/banner.png' })
    env.ENABLE_DEBUG_PAYMENT = true
    const ids = { 'admin-movies': show.movieId, 'admin-branches': show.branchId, 'admin-theaters': show.theaterId, 'admin-shows': show._id, 'admin-banners': banner._id, seat: show._id, booking: booking._id, payment: booking._id, ticket: booking._id }
    for (const [method, template, resourceType] of protectedEndpoints) {
      const path = `/api${template.replace(':id', String(ids[resourceType]))}`
      const cookie = template.startsWith('/admin/') ? adminCookie : userACookie
      const call = rawRequest(app)[method.toLowerCase()](path).set('Cookie', cookie)
      if (method === 'POST' && template === '/bookings') call.send({ showId: show._id, seats: ['A2'], idempotencyKey: 'must-not-run' })
      const result = await call
      expect(result.status, `${method} ${template}`).toBe(401)
      expect(result.body.code).toBe('API_REQUEST_ID_INVALID')
      expect(result.body).not.toHaveProperty('data')
      expect((await rawRequest(app).post('/api/request-access').send({ method, path })).status).toBe(401)
    }
    expect(await models.Booking.countDocuments({})).toBe(1)
    expect((await models.ShowSeat.findOne({ showId: show._id, seatCode: 'A2' })).status).toBe('available')
  })

  it('bootstraps scoped metadata, reuses the original lifetime, and never persists IDs', async () => {
    const collectionsBefore = await mongoose.connection.db.listCollections().toArray()
    const userBefore = await models.User.findById(userA._id).lean()
    const first = await bootstrap('GET', '/auth/me')
    expect(first.status).toBe(200)
    expect(first.body).not.toHaveProperty('data')
    expect(first.body.userId).toBe(String(userA._id))
    expect(first.body.expiresIn).toBe(1800)
    const second = await bootstrap('GET', '/auth/me')
    expect(second.body.apiRequestId).toBe(first.body.apiRequestId)
    expect(second.body.expiresAt).toBe(first.body.expiresAt)
    const profile = await withAccess('get', '/api/auth/me', first.body)
    expect(profile.status).toBe(200)
    expect(profile.body.data.user.id).toBe(String(userA._id))
    expect(await mongoose.connection.db.listCollections().toArray()).toEqual(collectionsBefore)
    expect(await models.User.findById(userA._id).lean()).toEqual(userBefore)
  })

  it('rejects unknown IDs, missing auth, identity mismatch, and another user token', async () => {
    const first = await bootstrap('GET', '/auth/me')
    const absent = await withAccess('get', '/api/auth/me', { ...first.body, apiRequestId: 'unknown' })
    expect(absent.status).toBe(401)
    expect(absent.body.code).toBe('API_REQUEST_ID_INVALID')
    expect((await rawRequest(app).get('/api/auth/me').set('X-API-User-ID', first.body.userId).set('X-API-Request-ID', first.body.apiRequestId)).status).toBe(401)
    const impersonation = await withAccess('get', '/api/auth/me', first.body, userBCookie)
    expect(impersonation.status).toBe(403)
    expect(impersonation.body.code).toBe('API_REQUEST_USER_MISMATCH')
    const tokenTheft = await withAccess('get', '/api/auth/me', { ...first.body, userId: String(userB._id) }, userBCookie)
    expect(tokenTheft.status).toBe(403)
    expect(tokenTheft.body.code).toBe('API_REQUEST_ID_MISMATCH')
  })

  it('binds resources, types, and operations independently, keeping idempotency keys separate', async () => {
    const booking = await reserve()
    const path = `/api/bookings/${booking._id}`
    const read = await bootstrap('GET', path)
    expect((await withAccess('get', path, read.body)).status).toBe(200)
    const cancel = await withAccess('post', `${path}/cancel`, read.body)
    expect(cancel.status).toBe(403)
    expect(cancel.body.code).toBe('API_REQUEST_ID_MISMATCH')
    expect((await withAccess('get', `${path}/payment-qr`, read.body)).status).toBe(403)
    expect((await bootstrap('GET', path, userBCookie)).status).toBe(404)
    const list = await bootstrap('GET', '/bookings/me')
    expect((await withAccess('get', path, list.body)).status).toBe(403)
    const secondBooking = await services.BookingService.create({ userId: userA._id, showId: show._id, seatCodes: ['A2'], clientRequestId: 'different-booking' })
    expect((await withAccess('get', `/api/bookings/${secondBooking._id}`, read.body)).status).toBe(403)
    const create = await bootstrap('POST', '/bookings', userACookie, { showId: String(show._id) })
    const payload = { showId: String(show._id), seats: ['A3'], idempotencyKey: 'independent-idempotency' }
    const created = await withAccess('post', '/api/bookings', create.body).send(payload)
    const repeated = await withAccess('post', '/api/bookings', create.body).send(payload)
    expect(created.status).toBe(201)
    expect(repeated.status).toBe(201)
    expect(repeated.body.data._id).toBe(created.body.data._id)
    expect(create.body.apiRequestId).not.toBe(payload.idempotencyKey)
  })

  it('rejects expiry at the exact deadline and never slides it on bootstrap or access', async () => {
    const start = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start)
    try {
      const first = await bootstrap('GET', '/auth/me')
      const deadline = Date.parse(first.body.expiresAt)
      clock.mockReturnValue(deadline - 1)
      expect((await withAccess('get', '/api/auth/me', first.body)).status).toBe(200)
      const again = await bootstrap('GET', '/auth/me')
      expect(again.body.expiresAt).toBe(first.body.expiresAt)
      clock.mockReturnValue(deadline)
      const expired = await withAccess('get', '/api/auth/me', first.body)
      expect(expired.status).toBe(401)
      expect(expired.body.code).toBe('API_REQUEST_ID_EXPIRED')
    } finally { clock.mockRestore() }
  })

  it('keeps admin authorization authoritative even after a role is revoked', async () => {
    expect((await bootstrap('GET', '/admin/movies', userACookie)).status).toBe(403)
    const admin = await models.User.findOne({ role: 'admin' })
    const access = await bootstrap('GET', '/admin/movies', adminCookie)
    expect(access.status).toBe(200)
    expect((await withAccess('get', '/api/admin/movies', access.body, adminCookie)).status).toBe(200)
    await models.User.updateOne({ _id: admin._id }, { $set: { role: 'user' } })
    try { expect((await withAccess('get', '/api/admin/movies', access.body, adminCookie)).status).toBe(403) }
    finally { await models.User.updateOne({ _id: admin._id }, { $set: { role: 'admin' } }) }
  })

  it('preserves public infrastructure and catalogs, blocks HEAD and route variants', async () => {
    for (const path of ['/api/health', '/api/home', '/api/movies', '/api/branches', `/api/branches/${show.branchId}`, `/api/branches/${show.branchId}/shows`]) expect((await rawRequest(app).get(path)).status).toBe(200)
    for (const path of ['/api/auth/me/', '/api/AUTH/ME', `/api/shows/${show._id}/seats/`]) {
      expect((await rawRequest(app).get(path).set('Cookie', userACookie)).status).toBe(401)
      expect((await rawRequest(app).head(path).set('Cookie', userACookie)).status).toBe(401)
    }
    expect((await bootstrap('GET', '/health')).status).toBe(404)
    expect((await bootstrap('PUT', '/bookings')).status).toBe(404)
    expect((await rawRequest(app).get('/api/bookings/anything/details').set('Cookie', userACookie)).status).toBe(404)
  })

  it('prevents a verification ID from consuming a ticket and a show ID from creating bookings for another show', async () => {
    const verify = await bootstrap('POST', '/admin/tickets/verify', adminCookie, { consume: false })
    const consumed = await withAccess('post', '/api/admin/tickets/verify', verify.body, adminCookie).send({ token: 'not-a-ticket', consume: true })
    expect(consumed.status).toBe(403)
    expect(consumed.body.code).toBe('API_REQUEST_ID_MISMATCH')
    const otherShow = await models.Show.create({ movieId: show.movieId, branchId: show.branchId, theaterId: show.theaterId, startsAt: new Date(show.startsAt.getTime() + 86_400_000), endsAt: new Date(show.endsAt.getTime() + 86_400_000), pricing: show.pricing, status: 'open', bookingOpenAt: show.bookingOpenAt, bookingCloseAt: new Date(show.bookingCloseAt.getTime() + 86_400_000) })
    const access = await bootstrap('POST', '/bookings', userACookie, { showId: String(show._id) })
    const crossed = await withAccess('post', '/api/bookings', access.body).send({ showId: otherShow._id, seats: ['A1'], idempotencyKey: 'cross-show' })
    expect(crossed.status).toBe(403)
    expect(crossed.body.code).toBe('API_REQUEST_ID_MISMATCH')
    expect(await models.Booking.countDocuments({})).toBe(0)
  })
})

describe('booking, pricing, expiry, and ownership', () => {
  it('holds multiple seats atomically and calculates authoritative server pricing', async () => {
    const response = await request(app).post('/api/bookings').set('Cookie', userACookie).send({ showId: show._id.toString(), seats: ['A1', 'A3'], idempotencyKey: 'price-test-request', totalPrice: 1 })
    expect(response.status).toBe(201)
    expect(response.body.data.totalPrice).toBe(570)
    expect(await models.ShowSeat.countDocuments({ heldByBookingId: response.body.data._id, status: 'held' })).toBe(2)
  })

  it('rejects an unavailable group without leaving a partial lock', async () => {
    const first = await request(app).post('/api/bookings').set('Cookie', userACookie).send({ showId: show._id.toString(), seats: ['A1'], idempotencyKey: 'first-lock-request' })
    expect(first.status).toBe(201)
    const second = await request(app).post('/api/bookings').set('Cookie', userBCookie).send({ showId: show._id.toString(), seats: ['A1', 'A2'], idempotencyKey: 'partial-lock-request' })
    expect(second.status).toBe(409)
    expect(second.body.code).toBe('SEAT_CONFLICT')
    expect((await models.ShowSeat.findOne({ showId: show._id, seatCode: 'A2' })).status).toBe('available')
  })

  it('expires a booking and releases only seats owned by that booking', async () => {
    const booking = await services.BookingService.create({ userId: userA._id, showId: show._id, seatCodes: ['A1'], clientRequestId: 'expiry-request' })
    await models.Booking.updateOne({ _id: booking._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    await models.ShowSeat.updateOne({ seatCode: 'A1', showId: show._id }, { $set: { holdExpiresAt: new Date(Date.now() - 1000) } })
    await services.BookingService.expireOne(booking._id)
    expect((await models.Booking.findById(booking._id)).status).toBe('expired')
    expect((await models.ShowSeat.findOne({ showId: show._id, seatCode: 'A1' })).status).toBe('available')

    const bookingB = await services.BookingService.create({ userId: userB._id, showId: show._id, seatCodes: ['A2'], clientRequestId: 'owner-b-request' })
    await models.Booking.updateOne({ _id: booking._id }, { $set: { status: 'holding', expiresAt: new Date(Date.now() - 1000) } })
    await services.BookingService.expireOne(booking._id)
    const ownedByB = await models.ShowSeat.findOne({ showId: show._id, seatCode: 'A2' })
    expect(ownedByB.heldByBookingId.toString()).toBe(bookingB._id.toString())
    expect(ownedByB.status).toBe('held')
  })

  it('prevents another user from reading, paying, or cancelling a booking', async () => {
    const booking = await services.BookingService.create({ userId: userA._id, showId: show._id, seatCodes: ['A1'], clientRequestId: 'privacy-request' })
    expect((await request(app).get(`/api/bookings/${booking._id}`).set('Cookie', userBCookie)).status).toBe(404)
    expect((await request(app).post(`/api/bookings/${booking._id}/mock-confirm`).set('Cookie', userBCookie)).status).toBe(404)
    expect((await request(app).post(`/api/bookings/${booking._id}/cancel`).set('Cookie', userBCookie)).status).toBe(404)
  })
})

describe('PromptPay payment QR', () => {
  const reserve = () => services.BookingService.create({ userId: userA._id, showId: show._id, seatCodes: ['A1', 'A3'], clientRequestId: 'promptpay-request' })
  const getQr = (id, cookie = userACookie) => request(app).get(`/api/bookings/${id}/payment-qr`).set('Cookie', cookie)

  it('returns a real QR for the authoritative amount; ignores body/query prices and never pays', async () => {
    const booking = await reserve()
    const result = await getQr(booking._id).query({ amount: 1, totalPrice: 1 }).send({ amount: 1 })
    expect(result.status).toBe(200)
    expect(result.headers['cache-control']).toContain('no-store')
    expect(result.body.data).toMatchObject({ bookingId: booking._id.toString(), amount: 570, currency: 'THB', status: 'pending', expiresAt: booking.expiresAt.toISOString() })
    expect(result.body.data).not.toHaveProperty('payload')
    expect(result.body.data).not.toHaveProperty('target')
    const svg = Buffer.from(result.body.data.dataUrl.split(',')[1], 'base64').toString()
    const expected = await QRCode.toString(generatePayload('000000000000001', { amount: 570 }), { type: 'svg', margin: 4, width: 300, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
    expect(svg).toBe(expected)
    const stored = await models.Booking.collection.findOne({ _id: booking._id })
    expect(stored.status).toBe('pending')
    expect(stored.payment).not.toHaveProperty('target')
    expect(stored.payment).not.toHaveProperty('qrPayload')
    expect(await models.Ticket.countDocuments({ bookingId: booking._id })).toBe(0)
    expect(await models.ShowSeat.countDocuments({ heldByBookingId: booking._id, status: 'held' })).toBe(2)
  })

  it('repeated/concurrent requests preserve one booking and the exact original expiry', async () => {
    const booking = await reserve()
    const results = await Promise.all([getQr(booking._id), getQr(booking._id)])
    expect(results.map((result) => result.status)).toEqual([200, 200])
    expect(results[0].body.data.dataUrl).toBe(results[1].body.data.dataUrl)
    expect(await models.Booking.countDocuments({})).toBe(1)
    expect((await models.Booking.findById(booking._id)).expiresAt).toEqual(booking.expiresAt)
    expect((await models.ShowSeat.findOne({ heldByBookingId: booking._id })).holdExpiresAt).toEqual(booking.expiresAt)
  })

  it('rejects malformed/missing bookings, unauthenticated users, and another owner', async () => {
    const booking = await reserve()
    expect((await getQr('not-an-id')).status).toBe(400)
    expect((await getQr(new mongoose.Types.ObjectId())).status).toBe(404)
    expect((await request(app).get(`/api/bookings/${booking._id}/payment-qr`)).status).toBe(401)
    expect((await getQr(booking._id, userBCookie)).status).toBe(404)
  })

  it('rejects expiry and uses existing seat release', async () => {
    const booking = await reserve()
    await models.Booking.updateOne({ _id: booking._id }, { $set: { expiresAt: new Date(Date.now() - 1) } })
    expect((await getQr(booking._id)).status).toBe(409)
    expect((await models.Booking.findById(booking._id)).status).toBe('expired')
    expect(await models.ShowSeat.countDocuments({ heldByBookingId: booking._id })).toBe(0)
  })

  it.each(['cancelled', 'paid'])('rejects %s bookings without changing status', async (status) => {
    const booking = await reserve()
    await models.Booking.updateOne({ _id: booking._id }, { $set: { status } })
    expect((await getQr(booking._id)).status).toBe(409)
    expect((await models.Booking.findById(booking._id)).status).toBe(status)
  })

  it.each(['available', 'wrong-owner', 'expired-hold'])('rejects invalid seats: %s', async (reason) => {
    const booking = await reserve()
    const update = reason === 'available' ? { status: 'available' } : reason === 'wrong-owner' ? { heldByUserId: userB._id } : { holdExpiresAt: new Date(Date.now() - 1) }
    await models.ShowSeat.updateOne({ showId: show._id, seatCode: 'A1' }, { $set: update })
    const response = await getQr(booking._id)
    expect(response.status).toBe(409)
    expect(response.body.code).toBe('SEAT_OWNERSHIP_LOST')
  })

  it.each([undefined, '', 'xxxxxxxxxxxxxx', 'YOUR_PROMPTPAY_TARGET', '1234'])('reports invalid/missing configuration without echoing it (%s)', async (target) => {
    const booking = await reserve()
    env.PAYMENT_QR_TARGET = target
    const result = await getQr(booking._id)
    expect(result.status).toBe(503)
    expect(result.body.code).toBe('PAYMENT_CONFIGURATION_ERROR')
    expect(result.body).not.toHaveProperty('details')
    if (target) expect(result.body.message).not.toContain(target)
    expect((await models.Booking.findById(booking._id)).status).toBe('holding')
  })

  it.each([0, -1])('rejects a non-positive stored amount (%s)', async (totalPrice) => {
    const booking = await reserve()
    await models.Booking.collection.updateOne({ _id: booking._id }, { $set: { totalPrice } })
    const result = await getQr(booking._id)
    expect(result.status).toBe(409)
    expect(result.body.code).toBe('INVALID_PAYMENT_AMOUNT')
  })

  it('does not expose legacy stored payment identifiers through booking APIs', async () => {
    const booking = await reserve()
    await models.Booking.collection.updateOne({ _id: booking._id }, { $set: { 'payment.target': 'private-legacy-value', 'payment.qrPayload': 'private-payload' } })
    const result = await request(app).get(`/api/bookings/${booking._id}`).set('Cookie', userACookie)
    expect(JSON.stringify(result.body)).not.toContain('private-')
  })

  it('has no customer or admin HTTP shortcut that marks a booking paid', async () => {
    const booking = await reserve()
    for (const cookie of [userACookie, adminCookie]) {
      expect((await request(app).post(`/api/bookings/${booking._id}/mock-confirm`).set('Cookie', cookie)).status).toBe(404)
    }
    expect((await models.Booking.findById(booking._id)).status).toBe('holding')
    expect(await models.Ticket.countDocuments({})).toBe(0)
  })
})

describe('development-only debug settlement', () => {
  beforeEach(() => { env.ENABLE_DEBUG_PAYMENT = true })
  const reservePending = async () => {
    const booking = await services.BookingService.create({ userId: userA._id, showId: show._id, seatCodes: ['A1', 'A3'], clientRequestId: 'debug-payment' })
    const qr = await request(app).get(`/api/bookings/${booking._id}/payment-qr`).set('Cookie', userACookie)
    expect(qr.status).toBe(200)
    expect((await models.Booking.findById(booking._id)).status).toBe('pending')
    return booking
  }
  const confirm = (booking, cookie = userACookie) => request(app).post(`/api/bookings/${booking._id}/debug-confirm-payment`).set('Cookie', cookie)

  it('confirms pending payment with stored amounts, finalizes seats and issues a usable ticket', async () => {
    const booking = await reservePending()
    const capability = await request(app).get(`/api/bookings/${booking._id}`).set('Cookie', userACookie)
    expect(capability.body.data.debugPaymentEnabled).toBe(true)
    const result = await confirm(booking).send({ amount: 1, totalPrice: 1, status: 'holding', userId: userB._id, seats: ['A2'] })
    expect(result.status).toBe(200)
    expect(result.body.data).toMatchObject({ status: 'paid', totalPrice: 570, userId: userA._id.toString() })
    expect(result.body.data.expiresAt).toBe(booking.expiresAt.toISOString())
    expect(result.body.data.payment.paidAt).toBeTruthy()
    expect(await models.Ticket.countDocuments({ bookingId: booking._id })).toBe(1)
    const seats = await models.ShowSeat.find({ bookedByBookingId: booking._id }).lean()
    expect(seats).toHaveLength(2)
    for (const seat of seats) {
      expect(seat.status).toBe('booked')
      expect(seat.bookedByUserId.toString()).toBe(userA._id.toString())
      expect(seat.heldByBookingId).toBeNull()
      expect(seat.holdExpiresAt).toBeNull()
    }
    expect((await models.ShowSeat.findOne({ showId: show._id, seatCode: 'A2' })).status).toBe('available')
    const qr = await request(app).get(`/api/bookings/${booking._id}/ticket-qr`).set('Cookie', userACookie)
    expect(qr.status).toBe(200)
    const verify = await request(app).post('/api/admin/tickets/verify').set('Cookie', adminCookie).send({ token: qr.body.data.token, consume: false })
    expect(verify.body.data.valid).toBe(true)
    await models.Booking.updateOne({ _id: booking._id }, { $set: { expiresAt: new Date(Date.now() - 1) } })
    await services.BookingService.expireOne(booking._id)
    expect(await models.ShowSeat.countDocuments({ bookedByBookingId: booking._id, status: 'booked' })).toBe(2)
  })

  it('rejects unauthenticated users and all non-owners, including administrators', async () => {
    const booking = await reservePending()
    expect((await request(app).post(`/api/bookings/${booking._id}/debug-confirm-payment`)).status).toBe(401)
    expect((await confirm(booking, userBCookie)).status).toBe(404)
    expect((await confirm(booking, adminCookie)).status).toBe(404)
    expect((await confirm({ _id: new mongoose.Types.ObjectId() })).status).toBe(404)
    expect((await confirm({ _id: 'invalid' })).status).toBe(400)
  })

  it('rejects expired bookings and releases their seats using the existing expiry service', async () => {
    const booking = await reservePending()
    await models.Booking.updateOne({ _id: booking._id }, { $set: { expiresAt: new Date(Date.now() - 1) } })
    const result = await confirm(booking)
    expect(result.status).toBe(409)
    expect(result.body.code).toBe('BOOKING_EXPIRED')
    expect((await models.Booking.findById(booking._id)).status).toBe('expired')
    expect(await models.ShowSeat.countDocuments({ heldByBookingId: booking._id })).toBe(0)
    expect(await models.Ticket.countDocuments({})).toBe(0)
  })

  it.each(['holding', 'cancelled', 'paid'])('rejects %s status', async (status) => {
    const booking = await reservePending()
    await models.Booking.updateOne({ _id: booking._id }, { $set: { status } })
    expect((await confirm(booking)).status).toBe(409)
    expect(await models.Ticket.countDocuments({})).toBe(0)
  })

  it('allows exactly one of two concurrent confirmations and rejects further attempts', async () => {
    const booking = await reservePending()
    const results = await Promise.all([confirm(booking), confirm(booking)])
    expect(results.map((result) => result.status).sort()).toEqual([200, 409])
    const paid = await models.Booking.findById(booking._id)
    expect((await confirm(booking)).status).toBe(409)
    expect((await models.Booking.findById(booking._id)).payment.paidAt).toEqual(paid.payment.paidAt)
    expect(await models.Ticket.countDocuments({ bookingId: booking._id })).toBe(1)
  })

  it.each(['available', 'wrong-owner', 'wrong-booking', 'expired-hold'])('rolls back all seat changes when a hold is %s', async (reason) => {
    const booking = await reservePending()
    const update = reason === 'available' ? { status: 'available' } : reason === 'wrong-owner' ? { heldByUserId: userB._id } : reason === 'wrong-booking' ? { heldByBookingId: new mongoose.Types.ObjectId() } : { holdExpiresAt: new Date(Date.now() - 1) }
    await models.ShowSeat.updateOne({ showId: show._id, seatCode: 'A3' }, { $set: update })
    const response = await confirm(booking)
    expect(response.status).toBe(409)
    expect(response.body.code).toBe('SEAT_OWNERSHIP_LOST')
    expect((await models.Booking.findById(booking._id)).status).toBe('pending')
    expect((await models.ShowSeat.findOne({ showId: show._id, seatCode: 'A1' })).status).toBe('held')
    expect(await models.Ticket.countDocuments({})).toBe(0)
  })

  it.each([0, -1])('rejects invalid stored total %s', async (totalPrice) => {
    const booking = await reservePending()
    await models.Booking.collection.updateOne({ _id: booking._id }, { $set: { totalPrice } })
    const result = await confirm(booking)
    expect(result.status).toBe(409)
    expect(result.body.code).toBe('INVALID_PAYMENT_AMOUNT')
  })

  it.each([['test', false], ['production', false], ['production', true]])('is unavailable for environment %s / flag %s', async (nodeEnv, enabled) => {
    const booking = await reservePending()
    env.NODE_ENV = nodeEnv
    env.ENABLE_DEBUG_PAYMENT = enabled
    expect((await confirm(booking)).status).toBe(404)
    const capability = await request(app).get(`/api/bookings/${booking._id}`).set('Cookie', userACookie)
    expect(capability.body.data.debugPaymentEnabled).toBe(false)
    expect((await models.Booking.findById(booking._id)).status).toBe('pending')
    expect(await models.Ticket.countDocuments({})).toBe(0)
  })
})

describe('admin Thai movie ratings', () => {
  const create = (ageRating) => request(app).post('/api/admin/movies').set('Cookie', adminCookie).send({ title: 'Rating test', durationMinutes: 120, ageRating })
  it.each(['ส', 'ท', 'น 13+', 'น 15+', 'น 18+', 'ฉ 20+'])('creates a movie rated %s', async (ageRating) => {
    const result = await create(ageRating)
    expect(result.status).toBe(201)
    expect((await models.Movie.findById(result.body.data._id)).ageRating).toBe(ageRating)
  })

  it('rejects arbitrary ratings on create and update', async () => {
    expect((await create('PG-13')).status).toBe(400)
    const movie = (await create('ท')).body.data
    expect((await request(app).patch(`/api/admin/movies/${movie._id}`).set('Cookie', adminCookie).send({ ageRating: 'PG-13' })).status).toBe(400)
    expect((await models.Movie.findById(movie._id)).ageRating).toBe('ท')
  })

  it('preserves a valid rating when editing other fields and accepts a canonical rating change', async () => {
    const movie = (await create('น 18+')).body.data
    const edit = await request(app).patch(`/api/admin/movies/${movie._id}`).set('Cookie', adminCookie).send({ title: 'Changed' })
    expect(edit.status).toBe(200)
    expect(edit.body.data.ageRating).toBe('น 18+')
    const changed = await request(app).patch(`/api/admin/movies/${movie._id}`).set('Cookie', adminCookie).send({ ageRating: 'ฉ 20+' })
    expect(changed.status).toBe(200)
    expect(changed.body.data.ageRating).toBe('ฉ 20+')
  })

  it.each(['13+', 'PG-13'])('keeps legacy %s readable, supports poster upload/archive, and allows explicit normalization', async (legacy) => {
    const movie = (await create('ท')).body.data
    await models.Movie.collection.updateOne({ _id: new mongoose.Types.ObjectId(movie._id) }, { $set: { ageRating: legacy } })
    const list = await request(app).get('/api/admin/movies').set('Cookie', adminCookie)
    expect(list.body.data.items.find((item) => item._id === movie._id).ageRating).toBe(legacy)
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZfoAAAAASUVORK5CYII=', 'base64')
    const upload = await request(app).post(`/api/admin/movies/${movie._id}/poster`).set('Cookie', adminCookie).attach('image', png, { filename: 'poster.png', contentType: 'image/png' })
    expect(upload.status).toBe(200)
    expect(upload.body.data.posterPath).toMatch(/^\/media\/movies\//)
    expect(upload.body.data.ageRating).toBe(legacy === '13+' ? 'น 13+' : legacy)
    expect((await request(app).delete(`/api/admin/movies/${movie._id}`).set('Cookie', adminCookie)).status).toBe(200)
    const edit = await request(app).patch(`/api/admin/movies/${movie._id}`).set('Cookie', adminCookie).send({ ageRating: 'น 13+' })
    expect(edit.status).toBe(200)
    expect(edit.body.data.ageRating).toBe('น 13+')
  })
})

describe('concurrency protection', () => {
  it('never creates two active owners during real concurrent checkout calls', async () => {
    const responses = await Promise.all([
      request(app).post('/api/bookings').set('Cookie', userACookie).send({ showId: show._id.toString(), seats: ['A1'], idempotencyKey: 'race-a-normal' }),
      request(app).post('/api/bookings').set('Cookie', userBCookie).send({ showId: show._id.toString(), seats: ['A1'], idempotencyKey: 'race-b-normal' }),
    ])
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1)
    expect(await models.Booking.countDocuments({ showId: show._id, status: { $in: ['holding', 'pending', 'paid'] } })).toBe(1)
    expect(await models.ShowSeat.countDocuments({ showId: show._id, seatCode: 'A1', status: { $in: ['held', 'booked'] } })).toBe(1)
  })

  it('cancels both near-simultaneous attempts in strict race mode without locking the seat', async () => {
    env.STRICT_RACE_CANCEL_BOTH = true
    env.RACE_WINDOW_MS = 30
    const responses = await Promise.all([
      request(app).post('/api/bookings').set('Cookie', userACookie).send({ showId: show._id.toString(), seats: ['A2'], idempotencyKey: 'race-a-strict' }),
      request(app).post('/api/bookings').set('Cookie', userBCookie).send({ showId: show._id.toString(), seats: ['A2'], idempotencyKey: 'race-b-strict' }),
    ])
    expect(responses.every((response) => response.status === 409 && response.body.code === 'RACE_CONFLICT')).toBe(true)
    expect(await models.Booking.countDocuments({ showId: show._id, status: { $in: ['holding', 'pending', 'paid'] } })).toBe(0)
    expect((await models.ShowSeat.findOne({ showId: show._id, seatCode: 'A2' })).status).toBe('available')
  })
})
