import mongoose from 'mongoose'
import { env } from '../config/env.js'
import { Booking } from '../models/Booking.js'
import { RaceAttempt } from '../models/RaceAttempt.js'
import { ShowSeat } from '../models/ShowSeat.js'
import { conflict } from '../utils/errors.js'
import { logger } from '../utils/logger.js'

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export class RaceGuardService {
  static async register({ showId, userId, seatCodes, clientRequestId }) {
    if (!env.STRICT_RACE_CANCEL_BOTH || env.RACE_WINDOW_MS === 0) return null
    const attempt = await RaceAttempt.create({ showId, userId, seatCodes, clientRequestId })
    await delay(env.RACE_WINDOW_MS)
    const from = new Date(attempt.createdAt.getTime() - env.RACE_WINDOW_MS)
    const to = new Date(attempt.createdAt.getTime() + env.RACE_WINDOW_MS)
    const competing = await RaceAttempt.find({
      _id: { $ne: attempt._id },
      showId,
      seatCodes: { $in: seatCodes },
      createdAt: { $gte: from, $lte: to },
      clientRequestId: { $ne: clientRequestId },
    }).lean()
    if (competing.length) {
      const ids = [attempt._id, ...competing.map((item) => item._id)]
      await RaceAttempt.updateMany({ _id: { $in: ids } }, { $set: { conflict: true } })
      await this.cancelAttemptBookings([attempt, ...competing])
      logger.warn('booking.race_conflict', { showId: String(showId), seatCodes })
      throw conflict('มีผู้ใช้อื่นเลือกที่นั่งนี้ในเวลาเดียวกัน กรุณาเลือกที่นั่งใหม่', 'RACE_CONFLICT')
    }
    return attempt
  }

  static async linkAndCheck(attempt, bookingId) {
    if (!attempt) return
    const current = await RaceAttempt.findOneAndUpdate({ _id: attempt._id }, { $set: { bookingId } }, { returnDocument: 'after' }).lean()
    if (current?.conflict) {
      await this.cancelAttemptBookings([current])
      throw conflict('มีผู้ใช้อื่นเลือกที่นั่งนี้ในเวลาเดียวกัน กรุณาเลือกที่นั่งใหม่', 'RACE_CONFLICT')
    }
  }

  static async cancelAttemptBookings(attempts) {
    const conditions = attempts.map((item) => ({ userId: item.userId, clientRequestId: item.clientRequestId }))
    if (!conditions.length) return
    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        const bookings = await Booking.find({ $or: conditions, status: { $in: ['holding', 'pending'] } }).session(session)
        for (const booking of bookings) {
          const updated = await Booking.updateOne({ _id: booking._id, status: { $in: ['holding', 'pending'] } }, { $set: { status: 'cancelled', cancellationReason: 'RACE_CONFLICT' } }, { session })
          if (updated.modifiedCount) {
            await ShowSeat.updateMany({ status: 'held', heldByBookingId: booking._id }, { $set: { status: 'available', heldByBookingId: null, heldByUserId: null, holdExpiresAt: null } }, { session })
          }
        }
      })
    } finally {
      await session.endSession()
    }
  }
}
