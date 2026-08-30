import { Booking } from '../models/Booking.js'
import { Ticket } from '../models/Ticket.js'
import { BookingService } from '../services/BookingService.js'
import { PaymentQrService } from '../services/PaymentQrService.js'
import { PaymentService } from '../services/PaymentService.js'
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

export const getBooking = asyncHandler(async (req, res) => sendSuccess(res, await loadOwnedBooking(req.params.id, req.user)))

export const cancelBooking = asyncHandler(async (req, res) => sendSuccess(res, await BookingService.cancel(req.params.id, req.user)))

export const paymentQr = asyncHandler(async (req, res) => {
  const booking = await loadOwnedBooking(req.params.id, req.user)
  if (!['holding', 'pending'].includes(booking.status)) throw conflict('การจองนี้ไม่รองรับ QR ชำระเงิน', 'INVALID_BOOKING_STATUS')
  const qr = await PaymentQrService.generate(booking)
  await Booking.updateOne({ _id: booking._id, status: { $in: ['holding', 'pending'] } }, { $set: { 'payment.target': qr.payload.split(' ราคา ')[0], 'payment.qrPayload': qr.payload, 'payment.generatedAt': new Date(), status: 'pending' } })
  sendSuccess(res, { dataUrl: qr.dataUrl, payload: qr.payload, amount: booking.totalPrice })
})

export const mockConfirm = asyncHandler(async (req, res) => {
  const { booking, ticket } = await PaymentService.confirm(req.params.id, req.user)
  const qr = await TicketService.qrForTicket(ticket)
  sendSuccess(res, { booking, ticketQr: qr.dataUrl })
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
