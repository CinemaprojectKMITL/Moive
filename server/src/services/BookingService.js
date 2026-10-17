import mongoose from 'mongoose'
import { env } from '../config/env.js'
import { Booking } from '../models/Booking.js'
import { Branch } from '../models/Branch.js'
import { Movie } from '../models/Movie.js'
import { Show } from '../models/Show.js'
import { ShowSeat } from '../models/ShowSeat.js'
import { Theater } from '../models/Theater.js'
import { badRequest, conflict, notFound } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { RaceGuardService } from './RaceGuardService.js'
import { SeatLockService } from './SeatLockService.js'

export class BookingService {
  static ensureBookable(show, now = new Date()) {
    if (!['open', 'scheduled'].includes(show.status)) throw conflict('รอบฉายนี้ไม่เปิดจอง', 'SHOW_NOT_BOOKABLE')
    if (show.startsAt <= now || show.bookingCloseAt <= now) throw conflict('ปิดรับจองรอบฉายนี้แล้ว', 'SHOW_NOT_BOOKABLE')
    if (show.bookingOpenAt > now) throw conflict('รอบฉายนี้ยังไม่เปิดจอง', 'SHOW_NOT_BOOKABLE')
  }

  static async create({ userId, showId, seatCodes, clientRequestId }) {
    const existing = await Booking.findOne({ userId, clientRequestId }).lean()
    if (existing) return existing
    const attempt = await RaceGuardService.register({ showId, userId, seatCodes, clientRequestId })
    const session = await mongoose.startSession()
    const bookingId = new mongoose.Types.ObjectId()
    let booking
    try {
      await session.withTransaction(async () => {
        const show = await Show.findById(showId).session(session).lean()
        if (!show) throw notFound('ไม่พบรอบฉาย')
        this.ensureBookable(show)
        const [movie, branch, theater, seatStates] = await Promise.all([
          Movie.findById(show.movieId).session(session).lean(),
          Branch.findById(show.branchId).session(session).lean(),
          Theater.findById(show.theaterId).session(session).lean(),
          ShowSeat.find({ showId, seatCode: { $in: seatCodes } }).session(session).lean(),
        ])
        if (!movie || !branch || !theater) throw conflict('ข้อมูลรอบฉายไม่สมบูรณ์', 'SHOW_DATA_INVALID')
        if (seatStates.length !== seatCodes.length) throw badRequest('พบรหัสที่นั่งไม่ถูกต้อง', 'INVALID_SEAT')
        const expiresAt = new Date(Date.now() + env.BOOKING_HOLD_MINUTES * 60_000)
        const pricedSeats = seatCodes.map((seatCode) => {
          const state = seatStates.find((seat) => seat.seatCode === seatCode)
          return { seatCode, seatType: state.seatType, price: show.pricing[state.seatType] }
        })
        const totalPrice = pricedSeats.reduce((sum, seat) => sum + seat.price, 0)
        await SeatLockService.acquire({ showId, seatCodes, bookingId, userId, expiresAt, session })
        const [created] = await Booking.create([{
          _id: bookingId,
          userId,
          showId,
          clientRequestId,
          seats: pricedSeats,
          totalPrice,
          status: 'holding',
          expiresAt,
          movieSnapshot: { id: movie._id.toString(), title: movie.title, posterPath: movie.posterPath },
          branchSnapshot: { id: branch._id.toString(), name: branch.name, code: branch.code, address: branch.address },
          theaterSnapshot: { id: theater._id.toString(), name: theater.name, code: theater.code },
          showTimeSnapshot: show.startsAt,
        }], { session })
        booking = created
      })
      await RaceGuardService.linkAndCheck(attempt, bookingId)
      logger.info('booking.created', { bookingId: bookingId.toString(), userId: userId.toString(), seats: seatCodes })
      return booking.toObject()
    } catch (error) {
      if (error?.code === 11000) {
        const duplicate = await Booking.findOne({ userId, clientRequestId }).lean()
        if (duplicate) return duplicate
      }
      throw error
    } finally {
      await session.endSession()
    }
  }

  static async expireOne(bookingId, { session: externalSession } = {}) {
    const ownSession = externalSession ? null : await mongoose.startSession()
    const session = externalSession || ownSession
    let changed = false
    const operation = async () => {
      const result = await Booking.updateOne({ _id: bookingId, status: { $in: ['holding', 'pending'] }, expiresAt: { $lte: new Date() } }, { $set: { status: 'expired' } }, { session })
      if (result.modifiedCount) {
        await SeatLockService.release({ bookingId, session })
        changed = true
      }
    }
    try {
      if (ownSession) await ownSession.withTransaction(operation)
      else await operation()
      return changed
    } finally {
      if (ownSession) await ownSession.endSession()
    }
  }

  static async cancel(bookingId, user) {
    const session = await mongoose.startSession()
    let booking
    try {
      await session.withTransaction(async () => {
        booking = await Booking.findOne({ _id: bookingId, ...(user.role === 'admin' ? {} : { userId: user._id }) }).session(session)
        if (!booking) throw notFound('ไม่พบการจอง')
        if (booking.status === 'paid') throw conflict('ไม่สามารถยกเลิกตั๋วที่ชำระแล้ว', 'PAID_BOOKING')
        if (['cancelled', 'expired'].includes(booking.status)) return
        booking.status = 'cancelled'
        booking.cancellationReason = 'USER_CANCELLED'
        await booking.save({ session })
        await SeatLockService.release({ bookingId: booking._id, session })
      })
      return booking
    } finally {
      await session.endSession()
    }
  }

  static async expireBatch(limit = 100) {
    const expired = await Booking.find({ status: { $in: ['holding', 'pending'] }, expiresAt: { $lte: new Date() } }, '_id').limit(limit).lean()
    let count = 0
    for (const item of expired) if (await this.expireOne(item._id)) count += 1
    return count
  }
}
