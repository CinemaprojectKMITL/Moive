import mongoose from 'mongoose'
import { Booking } from '../models/Booking.js'
import { ShowSeat } from '../models/ShowSeat.js'
import { Ticket } from '../models/Ticket.js'
import { conflict, notFound } from '../utils/errors.js'
import { BookingService } from './BookingService.js'
import { TicketService } from './TicketService.js'

export class BookingFinalizationService {
  // Internal settlement primitive. Call only after trusted payment verification or the gated debug action.
  // A future verifier must validate payment evidence/amount before calling; never expose this directly over HTTP.
  static async finalizePaidBooking({ bookingId, userId }) {
    const owned = await Booking.findOne({ _id: bookingId, userId }, '_id status expiresAt').lean()
    if (!owned) throw notFound('ไม่พบการจอง')
    if (owned.status === 'pending' && owned.expiresAt <= new Date()) {
      await BookingService.expireOne(owned._id)
      throw conflict('การจองหมดอายุแล้ว', 'BOOKING_EXPIRED')
    }
    const session = await mongoose.startSession()
    let result
    try {
      await session.withTransaction(async () => {
        const booking = await Booking.findOne({ _id: bookingId, userId }).session(session)
        if (!booking) throw notFound('ไม่พบการจอง')
        if (booking.status !== 'pending') throw conflict('ยืนยันได้เฉพาะการจองที่รอชำระเงิน', 'INVALID_BOOKING_STATUS')
        if (booking.expiresAt <= new Date()) throw conflict('การจองหมดอายุแล้ว', 'BOOKING_EXPIRED')
        const amount = booking.totalPrice
        const satang = Math.round(amount * 100)
        if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(satang) || satang <= 0
          || Math.abs(amount * 100 - satang) > 0.000001) {
          throw conflict('ยอดชำระเงินของการจองไม่ถูกต้อง', 'INVALID_PAYMENT_AMOUNT')
        }
        const seatCodes = booking.seats.map((seat) => seat.seatCode)
        if (!seatCodes.length || new Set(seatCodes).size !== seatCodes.length) throw conflict('สิทธิ์ถือที่นั่งไม่สมบูรณ์', 'SEAT_OWNERSHIP_LOST')
        const now = new Date()
        const seats = await ShowSeat.updateMany(
          { showId: booking.showId, seatCode: { $in: seatCodes }, status: 'held', heldByBookingId: booking._id, heldByUserId: booking.userId, holdExpiresAt: { $gt: now } },
          { $set: { status: 'booked', bookedByBookingId: booking._id, bookedByUserId: booking.userId, bookedAt: now, heldByBookingId: null, heldByUserId: null, holdExpiresAt: null } },
          { session },
        )
        if (seats.modifiedCount !== seatCodes.length) throw conflict('สิทธิ์ถือที่นั่งไม่สมบูรณ์ กรุณาเลือกใหม่', 'SEAT_OWNERSHIP_LOST')
        const ticket = new Ticket({ bookingId: booking._id, userId: booking.userId, showId: booking.showId, issuedAt: now })
        ticket.tokenHash = TicketService.hash(TicketService.createToken(ticket))
        await ticket.save({ session })
        const updated = await Booking.updateOne(
          { _id: booking._id, userId, status: 'pending', expiresAt: { $gt: new Date() } },
          { $set: { status: 'paid', 'payment.paidAt': now, ticketId: ticket._id } },
          { session },
        )
        if (!updated.matchedCount) throw conflict('การจองหมดอายุหรือเปลี่ยนสถานะแล้ว', 'BOOKING_EXPIRED')
        result = await Booking.findById(booking._id).session(session).lean()
      })
      return result
    } finally { await session.endSession() }
  }
}
