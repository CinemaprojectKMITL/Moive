import mongoose from 'mongoose'
import { env } from '../config/env.js'
import { Booking } from '../models/Booking.js'
import { Branch } from '../models/Branch.js'
import { Movie } from '../models/Movie.js'
import { Show } from '../models/Show.js'
import { ShowSeat } from '../models/ShowSeat.js'
import { Theater } from '../models/Theater.js'
import { badRequest, conflict, notFound } from '../utils/errors.js'
import { flattenSeatLayout } from '../utils/seatLayout.js'

export class ShowService {
  static async validateReferences(input) {
    const [movie, branch, theater] = await Promise.all([
      Movie.findById(input.movieId).lean(),
      Branch.findById(input.branchId).lean(),
      Theater.findById(input.theaterId).lean(),
    ])
    if (!movie || movie.archived) throw notFound('ไม่พบภาพยนตร์')
    if (!branch) throw notFound('ไม่พบสาขา')
    if (!theater) throw notFound('ไม่พบโรงภาพยนตร์')
    if (theater.branchId.toString() !== branch._id.toString()) throw badRequest('โรงภาพยนตร์ไม่ได้อยู่ในสาขาที่เลือก', 'THEATER_BRANCH_MISMATCH')
    return { movie, branch, theater }
  }

  static async create(input) {
    const { movie, theater } = await this.validateReferences(input)
    const startsAt = new Date(input.startsAt)
    const endsAt = new Date(startsAt.getTime() + movie.durationMinutes * 60_000)
    const bookingOpenAt = new Date(input.bookingOpenAt || Date.now())
    const bookingCloseAt = new Date(input.bookingCloseAt || startsAt)
    if (startsAt <= new Date()) throw badRequest('รอบฉายต้องเริ่มในอนาคต', 'INVALID_SHOW_TIME')
    if (bookingOpenAt >= bookingCloseAt || bookingCloseAt > startsAt) throw badRequest('ช่วงเวลาเปิดจองไม่ถูกต้อง', 'INVALID_BOOKING_WINDOW')
    const cleanupMs = env.THEATER_CLEANUP_MINUTES * 60_000
    const overlap = await Show.exists({
      theaterId: theater._id,
      status: { $in: ['scheduled', 'open'] },
      startsAt: { $lt: new Date(endsAt.getTime() + cleanupMs) },
      endsAt: { $gt: new Date(startsAt.getTime() - cleanupMs) },
    })
    if (overlap) throw conflict('ช่วงเวลานี้ทับซ้อนกับรอบฉายในโรงเดียวกัน', 'SHOW_OVERLAP')

    const session = await mongoose.startSession()
    let createdShow
    try {
      await session.withTransaction(async () => {
        const [show] = await Show.create([{
          movieId: movie._id,
          branchId: input.branchId,
          theaterId: theater._id,
          startsAt,
          endsAt,
          pricing: input.pricing,
          status: input.status || 'open',
          bookingOpenAt,
          bookingCloseAt,
        }], { session })
        const seats = flattenSeatLayout(theater.seatLayout).map((seat) => ({
          showId: show._id,
          seatCode: seat.code,
          seatType: seat.type,
          status: 'available',
          branchId: input.branchId,
          theaterId: theater._id,
          movieId: movie._id,
          showTime: startsAt,
        }))
        await ShowSeat.insertMany(seats, { session, ordered: true })
        createdShow = show
      })
    } finally {
      await session.endSession()
    }
    return createdShow
  }

  static async update(id, input) {
    const show = await Show.findById(id)
    if (!show) throw notFound('ไม่พบรอบฉาย')
    const hasBookings = await Booking.exists({ showId: id, status: { $in: ['holding', 'pending', 'paid'] } })
    const materialFields = ['movieId', 'branchId', 'theaterId', 'startsAt', 'pricing']
    if (hasBookings && materialFields.some((field) => input[field] !== undefined)) {
      throw conflict('ไม่สามารถเปลี่ยนรายละเอียดหลักของรอบที่มีการจองแล้ว', 'SHOW_HAS_BOOKINGS')
    }
    if (input.status === 'cancelled') return this.cancel(id)
    if (input.movieId || input.branchId || input.theaterId) {
      await this.validateReferences({
        movieId: input.movieId || show.movieId.toString(),
        branchId: input.branchId || show.branchId.toString(),
        theaterId: input.theaterId || show.theaterId.toString(),
      })
    }
    Object.assign(show, input)
    await show.save()
    return show
  }

  static async cancel(id) {
    const session = await mongoose.startSession()
    let cancelledShow
    try {
      await session.withTransaction(async () => {
        const show = await Show.findById(id).session(session)
        if (!show) throw notFound('ไม่พบรอบฉาย')
        show.status = 'cancelled'
        await show.save({ session })
        const unpaid = await Booking.find({ showId: id, status: { $in: ['holding', 'pending'] } }, '_id').session(session).lean()
        const bookingIds = unpaid.map((booking) => booking._id)
        if (bookingIds.length) {
          await Booking.updateMany({ _id: { $in: bookingIds }, status: { $in: ['holding', 'pending'] } }, { $set: { status: 'cancelled', cancellationReason: 'SHOW_CANCELLED' } }, { session })
          await ShowSeat.updateMany({ showId: id, status: 'held', heldByBookingId: { $in: bookingIds } }, { $set: { status: 'available', heldByBookingId: null, heldByUserId: null, holdExpiresAt: null } }, { session })
        }
        cancelledShow = show
      })
    } finally {
      await session.endSession()
    }
    return cancelledShow
  }
}
