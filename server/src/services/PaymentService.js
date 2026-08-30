import mongoose from 'mongoose'
import { env } from '../config/env.js'
import { Booking } from '../models/Booking.js'
import { ShowSeat } from '../models/ShowSeat.js'
import { Ticket } from '../models/Ticket.js'
import { conflict, forbidden, notFound } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { TicketService } from './TicketService.js'

export class PaymentService {
  static async confirm(bookingId, user) {
    if (!env.ENABLE_MOCK_PAYMENT) throw forbidden('ปิดใช้งานการชำระเงินจำลอง')
    const session = await mongoose.startSession()
    let booking
    let ticket
    try {
      await session.withTransaction(async () => {
        booking = await Booking.findOne({ _id: bookingId, ...(user.role === 'admin' ? {} : { userId: user._id }) }).session(session)
        if (!booking) throw notFound('ไม่พบการจอง')
        if (booking.status === 'paid') {
          ticket = await Ticket.findOne({ bookingId: booking._id }).session(session)
          return
        }
        if (!['holding', 'pending'].includes(booking.status)) throw conflict('สถานะการจองไม่รองรับการชำระเงิน', 'INVALID_BOOKING_STATUS')
        if (booking.expiresAt <= new Date()) throw conflict('การจองหมดอายุแล้ว', 'BOOKING_EXPIRED')
        const seatCodes = booking.seats.map((seat) => seat.seatCode)
        const updatedSeats = await ShowSeat.updateMany(
          { showId: booking.showId, seatCode: { $in: seatCodes }, status: 'held', heldByBookingId: booking._id, heldByUserId: booking.userId, holdExpiresAt: { $gt: new Date() } },
          { $set: { status: 'booked', bookedByBookingId: booking._id, bookedByUserId: booking.userId, bookedAt: new Date(), heldByBookingId: null, heldByUserId: null, holdExpiresAt: null } },
          { session },
        )
        if (updatedSeats.modifiedCount !== seatCodes.length) throw conflict('สิทธิ์ถือที่นั่งไม่สมบูรณ์ กรุณาเลือกใหม่', 'SEAT_OWNERSHIP_LOST')
        const issuedAt = new Date()
        ticket = new Ticket({ bookingId: booking._id, userId: booking.userId, showId: booking.showId, tokenHash: 'pending', issuedAt })
        const token = TicketService.createToken(ticket)
        ticket.tokenHash = TicketService.hash(token)
        await ticket.save({ session })
        booking.status = 'paid'
        booking.payment.paidAt = new Date()
        booking.ticketId = ticket._id
        await booking.save({ session })
      })
      logger.info('payment.mock_confirmed', { bookingId: booking._id.toString() })
      return { booking, ticket }
    } finally {
      await session.endSession()
    }
  }
}
