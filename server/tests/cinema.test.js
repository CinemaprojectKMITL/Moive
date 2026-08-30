import bcrypt from 'bcrypt'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

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

const register = (username) => request(app).post('/api/auth/register').send({ username, password: 'secure-pass-123', displayName: username })
const cookieFrom = (response) => response.headers['set-cookie']

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  process.env.NODE_ENV = 'test'
  process.env.MONGO_URI = replSet.getUri('cinema')
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-cinema-tests'
  process.env.STRICT_RACE_CANCEL_BOTH = 'false'
  process.env.RACE_WINDOW_MS = '25'
  process.env.ENABLE_MOCK_PAYMENT = 'true'
  ;({ default: mongoose } = await import('mongoose'))
  const [{ connectDatabase }, { createApp }, userModule, branchModule, movieModule, theaterModule, showModule, showSeatModule, bookingModule, ticketModule, bookingServiceModule, paymentServiceModule, envModule] = await Promise.all([
    import('../src/config/database.js'), import('../src/app.js'), import('../src/models/User.js'), import('../src/models/Branch.js'), import('../src/models/Movie.js'), import('../src/models/Theater.js'), import('../src/models/Show.js'), import('../src/models/ShowSeat.js'), import('../src/models/Booking.js'), import('../src/models/Ticket.js'), import('../src/services/BookingService.js'), import('../src/services/PaymentService.js'), import('../src/config/env.js'),
  ])
  await connectDatabase({ attempts: 1 })
  app = createApp()
  models = { User: userModule.User, Branch: branchModule.Branch, Movie: movieModule.Movie, Theater: theaterModule.Theater, Show: showModule.Show, ShowSeat: showSeatModule.ShowSeat, Booking: bookingModule.Booking, Ticket: ticketModule.Ticket }
  services = { BookingService: bookingServiceModule.BookingService, PaymentService: paymentServiceModule.PaymentService }
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
  env.STRICT_RACE_CANCEL_BOTH = false
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

  it('marks payment atomically, remains booked after expiry, and is idempotent', async () => {
    const booking = await services.BookingService.create({ userId: userA._id, showId: show._id, seatCodes: ['A1'], clientRequestId: 'payment-request' })
    const first = await services.PaymentService.confirm(booking._id, userA)
    const second = await services.PaymentService.confirm(booking._id, userA)
    expect(first.booking.status).toBe('paid')
    expect(second.booking.status).toBe('paid')
    expect(await models.Ticket.countDocuments({ bookingId: booking._id })).toBe(1)
    await models.Booking.updateOne({ _id: booking._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    await services.BookingService.expireOne(booking._id)
    expect((await models.ShowSeat.findOne({ showId: show._id, seatCode: 'A1' })).status).toBe('booked')
  })

  it('prevents another user from reading, paying, or cancelling a booking', async () => {
    const booking = await services.BookingService.create({ userId: userA._id, showId: show._id, seatCodes: ['A1'], clientRequestId: 'privacy-request' })
    expect((await request(app).get(`/api/bookings/${booking._id}`).set('Cookie', userBCookie)).status).toBe(404)
    expect((await request(app).post(`/api/bookings/${booking._id}/mock-confirm`).set('Cookie', userBCookie)).status).toBe(404)
    expect((await request(app).post(`/api/bookings/${booking._id}/cancel`).set('Cookie', userBCookie)).status).toBe(404)
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
