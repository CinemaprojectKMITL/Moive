import mongoose from 'mongoose'
import { Booking } from '../models/Booking.js'
import { ShowSeat } from '../models/ShowSeat.js'
import { Ticket } from '../models/Ticket.js'
import { BookingService } from '../services/BookingService.js'
import { PaymentQrService } from '../services/PaymentQrService.js'
import { BookingFinalizationService } from '../services/BookingFinalizationService.js'
import { isDebugPaymentEnabled } from '../config/env.js'
import { TicketService } from '../services/TicketService.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { conflict, notFound } from '../utils/errors.js'

const ownershipFilter = (id, user) => ({ _id: id, ...(user.role === 'admin' ? {} : { userId: user._id }) })

async function loadOwnedBooking(id, user) {
  let booking = await Booking.findOne(ownershipFilter(id, user)).lean()
  if (!booking) throw notFound('ไม่พบการจอง')
  if (['holding', 'pending'].includes(booking.status) && booking.expiresAt <= new Date()) {
    await BookingService.expireOne(booking._id)
    booking = await Booking.findById(booking._id).lean()
  }
  return booking
}

export const createBooking = asyncHandler(async (req, res) => {
  const booking = await BookingService.create({
    userId: req.user._id,
    showId: req.body.showId,
    seatCodes: req.body.seats,
    clientRequestId: req.body.idempotencyKey,
  })
  sendSuccess(res, booking, 201)
})

export const myBookings = asyncHandler(async (req, res) => {
  await BookingService.expireBatch(100)
  const page = Math.max(Number(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50)
  const [items, total] = await Promise.all([
    Booking.find({ userId: req.user._id }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Booking.countDocuments({ userId: req.user._id }),
  ])
  sendSuccess(res, { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } })
})

export const getBooking = asyncHandler(async (req, res) => sendSuccess(res, { ...await loadOwnedBooking(req.params.id, req.user), debugPaymentEnabled: isDebugPaymentEnabled() }))

export const debugConfirmPayment = asyncHandler(async (req, res) => {
  if (!isDebugPaymentEnabled()) throw notFound()
  res.set('Cache-Control', 'private, no-store')
  // Ignore request body entirely. Even admins must own the booking for this development shortcut.
  const booking = await BookingFinalizationService.finalizePaidBooking({ bookingId: req.params.id, userId: req.user._id })
  sendSuccess(res, booking)
})

export const cancelBooking = asyncHandler(async (req, res) => sendSuccess(res, await BookingService.cancel(req.params.id, req.user)))

export const paymentQr = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'private, no-store')
  await loadOwnedBooking(req.params.id, req.user) // Reuse expiry and seat release before starting a QR request.
  const session = await mongoose.startSession()
  let response
  try {
    await session.withTransaction(async () => {
      const booking = await Booking.findOne(ownershipFilter(req.params.id, req.user)).session(session).lean()
      if (!booking) throw notFound('ไม่พบการจอง')
      if (!['holding', 'pending'].includes(booking.status)) throw conflict('การจองนี้ไม่รองรับ QR ชำระเงิน', 'INVALID_BOOKING_STATUS')
      if (booking.expiresAt <= new Date()) throw conflict('การจองหมดอายุแล้ว', 'BOOKING_EXPIRED')
      const seatCodes = booking.seats.map((seat) => seat.seatCode)
      const heldSeats = await ShowSeat.countDocuments({ showId: booking.showId, seatCode: { $in: seatCodes }, status: 'held', heldByBookingId: booking._id, heldByUserId: booking.userId, holdExpiresAt: { $gt: new Date() } }).session(session)
      if (!seatCodes.length || heldSeats !== seatCodes.length) throw conflict('สิทธิ์ถือที่นั่งไม่สมบูรณ์ กรุณาเลือกใหม่', 'SEAT_OWNERSHIP_LOST')
      const qr = await PaymentQrService.generate(booking)
      // This write conflicts with concurrent cancellation/expiry. QR requests never extend the hold.
      const updated = await Booking.updateOne({ _id: booking._id, status: { $in: ['holding', 'pending'] }, expiresAt: { $gt: new Date() } }, { $set: { status: 'pending', 'payment.generatedAt': new Date() } }, { session })
      if (!updated.matchedCount) throw conflict('การจองหมดอายุแล้ว', 'BOOKING_EXPIRED')
      response = { bookingId: booking._id.toString(), amount: Math.round(booking.totalPrice * 100) / 100, currency: 'THB', dataUrl: qr.dataUrl, expiresAt: booking.expiresAt, status: 'pending' }
    })
    // TODO: A verified gateway/bank/slip workflow can call BookingFinalizationService.
    // The development-only shortcut simulates settlement; QR generation never confirms payment.
    sendSuccess(res, response)
  } finally {
    await session.endSession()
  }
})

export const ticketQr = asyncHandler(async (req, res) => {
  const booking = await loadOwnedBooking(req.params.id, req.user)
  if (booking.status !== 'paid' || !booking.ticketId) throw conflict('ยังไม่มีตั๋วสำหรับการจองนี้', 'TICKET_UNAVAILABLE')
  const ticket = await Ticket.findOne({ _id: booking.ticketId, bookingId: booking._id })
  if (!ticket) throw notFound('ไม่พบตั๋ว')
  const qr = await TicketService.qrForTicket(ticket)
  sendSuccess(res, { dataUrl: qr.dataUrl, token: qr.token, status: ticket.status })
})

export const verifyTicket = asyncHandler(async (req, res) => sendSuccess(res, await TicketService.verify(req.body.token, req.body.consume)))
