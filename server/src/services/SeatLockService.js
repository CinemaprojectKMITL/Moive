import { ShowSeat } from '../models/ShowSeat.js'
import { conflict } from '../utils/errors.js'

export class SeatLockService {
  static async acquire({ showId, seatCodes, bookingId, userId, expiresAt, session }) {
    const acquired = []
    const now = new Date()
    for (const seatCode of [...seatCodes].sort()) {
      const seat = await ShowSeat.findOneAndUpdate(
        {
          showId,
          seatCode,
          $or: [
            { status: 'available' },
            { status: 'held', holdExpiresAt: { $lte: now } },
          ],
        },
        {
          $set: {
            status: 'held', heldByBookingId: bookingId, heldByUserId: userId, holdExpiresAt: expiresAt,
            bookedByBookingId: null, bookedByUserId: null, bookedAt: null,
          },
        },
        { returnDocument: 'after', session },
      )
      if (!seat) throw conflict(`ที่นั่ง ${seatCode} ไม่ว่าง`, 'SEAT_CONFLICT')
      acquired.push(seat)
    }
    return acquired
  }

  static async release({ bookingId, session }) {
    return ShowSeat.updateMany(
      { status: 'held', heldByBookingId: bookingId },
      { $set: { status: 'available', heldByBookingId: null, heldByUserId: null, holdExpiresAt: null } },
      { session },
    )
  }

  static async validateOwnership({ bookingId, seatCodes, session }) {
    const count = await ShowSeat.countDocuments({ seatCode: { $in: seatCodes }, status: 'held', heldByBookingId: bookingId }).session(session)
    return count === seatCodes.length
  }

  static async expireStale(showId) {
    const now = new Date()
    return ShowSeat.updateMany(
      { ...(showId ? { showId } : {}), status: 'held', holdExpiresAt: { $lte: now } },
      { $set: { status: 'available', heldByBookingId: null, heldByUserId: null, holdExpiresAt: null } },
    )
  }
}
