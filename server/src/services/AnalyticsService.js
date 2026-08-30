import { Booking } from '../models/Booking.js'
import { ShowSeat } from '../models/ShowSeat.js'
import { badRequest } from '../utils/errors.js'

const DAY_MS = 86_400_000

export class AnalyticsService {
  static parseRange(query) {
    const to = query.to ? new Date(query.to) : new Date()
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 6 * DAY_MS)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) throw badRequest('ช่วงวันที่ไม่ถูกต้อง')
    if (to - from > 366 * DAY_MS) throw badRequest('ช่วงรายงานต้องไม่เกิน 366 วัน')
    return { from, to }
  }

  static async dashboard(query) {
    const { from, to } = this.parseRange(query)
    const range = { createdAt: { $gte: from, $lte: to } }
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const [summaryRows, revenueTodayRows, revenueSeries, statusDistribution, topMovies, topBranches, topTheaters, topShowtimes, occupancyShows, currentShows, seatTotals] = await Promise.all([
      Booking.aggregate([
        { $match: range },
        { $group: { _id: null, revenue: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$totalPrice', 0] } }, tickets: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, { $size: '$seats' }, 0] } }, paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } }, active: { $sum: { $cond: [{ $in: ['$status', ['holding', 'pending']] }, 1, 0] } }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }, expired: { $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] } } } },
      ]),
      Booking.aggregate([{ $match: { status: 'paid', 'payment.paidAt': { $gte: today } } }, { $group: { _id: null, revenue: { $sum: '$totalPrice' } } }]),
      Booking.aggregate([{ $match: { status: 'paid', 'payment.paidAt': { $gte: from, $lte: to } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$payment.paidAt' } }, revenue: { $sum: '$totalPrice' }, tickets: { $sum: { $size: '$seats' } } } }, { $sort: { _id: 1 } }]),
      Booking.aggregate([{ $match: range }, { $group: { _id: '$status', value: { $sum: 1 } } }, { $sort: { value: -1 } }]),
      Booking.aggregate([{ $match: { status: 'paid', 'payment.paidAt': { $gte: from, $lte: to } } }, { $group: { _id: '$movieSnapshot.title', revenue: { $sum: '$totalPrice' }, tickets: { $sum: { $size: '$seats' } } } }, { $sort: { tickets: -1 } }, { $limit: 8 }]),
      Booking.aggregate([{ $match: { status: 'paid', 'payment.paidAt': { $gte: from, $lte: to } } }, { $group: { _id: '$branchSnapshot.name', revenue: { $sum: '$totalPrice' }, tickets: { $sum: { $size: '$seats' } } } }, { $sort: { revenue: -1 } }, { $limit: 8 }]),
      Booking.aggregate([{ $match: { status: 'paid', 'payment.paidAt': { $gte: from, $lte: to } } }, { $group: { _id: '$theaterSnapshot.name', revenue: { $sum: '$totalPrice' }, tickets: { $sum: { $size: '$seats' } } } }, { $sort: { tickets: -1 } }, { $limit: 8 }]),
      Booking.aggregate([{ $match: { status: 'paid', showTimeSnapshot: { $gte: from, $lte: to } } }, { $group: { _id: '$showId', movie: { $first: '$movieSnapshot.title' }, branch: { $first: '$branchSnapshot.name' }, showTime: { $first: '$showTimeSnapshot' }, tickets: { $sum: { $size: '$seats' } }, revenue: { $sum: '$totalPrice' } } }, { $sort: { tickets: -1 } }, { $limit: 8 }]),
      ShowSeat.aggregate([
        { $match: { showTime: { $gte: from, $lte: to } } },
        { $group: { _id: '$showId', totalSeats: { $sum: 1 }, bookedSeats: { $sum: { $cond: [{ $eq: ['$status', 'booked'] }, 1, 0] } } } },
        { $set: { occupancy: { $round: [{ $multiply: [{ $divide: ['$bookedSeats', '$totalSeats'] }, 100] }, 1] } } },
        { $sort: { occupancy: -1, bookedSeats: -1 } }, { $limit: 8 },
        { $lookup: { from: 'shows', localField: '_id', foreignField: '_id', as: 'show' } }, { $unwind: '$show' },
        { $lookup: { from: 'movies', localField: 'show.movieId', foreignField: '_id', as: 'movie' } },
        { $lookup: { from: 'branches', localField: 'show.branchId', foreignField: '_id', as: 'branch' } },
        { $project: { totalSeats: 1, bookedSeats: 1, occupancy: 1, showTime: '$show.startsAt', movie: { $arrayElemAt: ['$movie.title', 0] }, branch: { $arrayElemAt: ['$branch.name', 0] } } },
      ]),
      ShowSeat.aggregate([
        { $match: { showTime: { $gte: new Date(Date.now() - 2 * 60 * 60_000), $lte: new Date(Date.now() + 12 * 60 * 60_000) } } },
        { $group: { _id: '$showId', totalSeats: { $sum: 1 }, bookedSeats: { $sum: { $cond: [{ $eq: ['$status', 'booked'] }, 1, 0] } }, heldSeats: { $sum: { $cond: [{ $eq: ['$status', 'held'] }, 1, 0] } } } },
        { $lookup: { from: 'shows', localField: '_id', foreignField: '_id', as: 'show' } }, { $unwind: '$show' },
        { $match: { 'show.status': { $in: ['open', 'scheduled'] } } },
        { $lookup: { from: 'movies', localField: 'show.movieId', foreignField: '_id', as: 'movie' } },
        { $lookup: { from: 'branches', localField: 'show.branchId', foreignField: '_id', as: 'branch' } },
        { $project: { totalSeats: 1, bookedSeats: 1, heldSeats: 1, showTime: '$show.startsAt', movie: { $arrayElemAt: ['$movie.title', 0] }, branch: { $arrayElemAt: ['$branch.name', 0] } } },
        { $sort: { showTime: 1 } }, { $limit: 20 },
      ]),
      ShowSeat.aggregate([{ $match: { showTime: { $gte: from, $lte: to } } }, { $group: { _id: null, total: { $sum: 1 }, booked: { $sum: { $cond: [{ $eq: ['$status', 'booked'] }, 1, 0] } } } }]),
    ])
    const summary = summaryRows[0] || { revenue: 0, tickets: 0, paid: 0, active: 0, cancelled: 0, expired: 0 }
    const seats = seatTotals[0] || { total: 0, booked: 0 }
    return {
      range: { from, to },
      kpis: { ...summary, revenueToday: revenueTodayRows[0]?.revenue || 0, occupancy: seats.total ? Math.round((seats.booked / seats.total) * 1000) / 10 : 0 },
      revenueSeries: revenueSeries.map((row) => ({ date: row._id, revenue: row.revenue, tickets: row.tickets })),
      statusDistribution: statusDistribution.map((row) => ({ status: row._id, value: row.value })),
      topMovies: topMovies.map((row) => ({ name: row._id, revenue: row.revenue, tickets: row.tickets })),
      topBranches: topBranches.map((row) => ({ name: row._id, revenue: row.revenue, tickets: row.tickets })),
      topTheaters: topTheaters.map((row) => ({ name: row._id, revenue: row.revenue, tickets: row.tickets })),
      topShowtimes,
      occupancyShows,
      currentShows,
    }
  }
}
