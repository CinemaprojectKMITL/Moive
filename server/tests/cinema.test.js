import bcrypt from 'bcrypt'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import request from 'supertest'
import generatePayload from 'promptpay-qr'
import QRCode from 'qrcode'
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
