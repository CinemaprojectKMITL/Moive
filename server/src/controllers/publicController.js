import { Banner } from '../models/Banner.js'
import { Branch } from '../models/Branch.js'
import { Movie } from '../models/Movie.js'
import { Show } from '../models/Show.js'
import { ShowSeat } from '../models/ShowSeat.js'
import { Theater } from '../models/Theater.js'
import { getOrCreateApiRequestId, validateApiRequestId } from '../services/ApiRequestStore.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { notFound } from '../utils/errors.js'

const publicShowFilter = (now = new Date()) => ({ status: { $in: ['open', 'scheduled'] }, startsAt: { $gt: now }, bookingOpenAt: { $lte: now }, bookingCloseAt: { $gt: now } })
const publicMovieFields = 'title posterPath durationMinutes ageRating genres'

async function findAccessibleMovie(movieId) {
  const movie = await Movie.findOne({ _id: movieId, active: true, archived: false }).lean()
  if (!movie) throw notFound('ไม่พบภาพยนตร์')
  return movie
}

export const requestMovieAccess = asyncHandler(async (req, res) => {
  const movie = await findAccessibleMovie(req.params.id)
  const { apiRequestId, expiresAt } = getOrCreateApiRequestId(req.user._id, movie._id)
  res.set('Cache-Control', 'no-store')
  res.json({ success: true, apiRequestId, expiresIn: Math.ceil((expiresAt - Date.now()) / 1000), expiresAt: new Date(expiresAt).toISOString() })
})

export function validateMovieApiRequest(req, res, next) {
  res.set('Cache-Control', 'no-store')
  const { id, userId, apiRequestId } = req.params
  if (String(req.user._id) !== userId) return res.status(403).json({ success: false, error: 'User ID does not match authenticated user' })
  const result = validateApiRequestId(apiRequestId, userId, id)
  if (!result.valid) {
    const errors = { invalid: 'Invalid API request ID', expired: 'API request ID expired', mismatch: 'API request ID does not match this user or resource' }
    return res.status(result.reason === 'mismatch' ? 403 : 401).json({ success: false, error: errors[result.reason] })
  }
  return next()
}

export const home = asyncHandler(async (_req, res) => {
  const now = new Date()
  const [banners, shows, branches, theaterCount] = await Promise.all([
    Banner.find({ enabled: true, $and: [{ $or: [{ startAt: null }, { startAt: { $lte: now } }] }, { $or: [{ endAt: null }, { endAt: { $gte: now } }] }] }).sort({ sortOrder: 1 }).lean(),
    Show.find(publicShowFilter(now)).populate({ path: 'movieId', select: publicMovieFields, match: { active: true, archived: false } }).sort({ startsAt: 1 }).lean(),
    Branch.find({ active: true }).sort({ name: 1 }).lean(),
    Theater.countDocuments({ active: true }),
  ])
  const movieMap = new Map()
  for (const show of shows) if (show.movieId && !movieMap.has(show.movieId._id.toString())) movieMap.set(show.movieId._id.toString(), show.movieId)
  sendSuccess(res, { banners, movies: [...movieMap.values()], branches, theaterCount })
})

export const listMovies = asyncHandler(async (_req, res) => {
  const now = new Date()
  const movieIds = await Show.distinct('movieId', publicShowFilter(now))
  sendSuccess(res, await Movie.find({ _id: { $in: movieIds }, active: true, archived: false }).select(publicMovieFields).sort({ releaseDate: -1 }).lean())
})

export const getMovie = asyncHandler(async (req, res) => {
  const movie = await findAccessibleMovie(req.params.id)
  const shows = await Show.find({ movieId: movie._id, ...publicShowFilter() }).populate('branchId', 'name code address').populate('theaterId', 'name code').sort({ startsAt: 1 }).lean()
  sendSuccess(res, { movie, shows })
})

export const listBranches = asyncHandler(async (_req, res) => sendSuccess(res, await Branch.find({ active: true }).sort({ name: 1 }).lean()))

export const getBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findOne({ _id: req.params.id, active: true }).lean()
  if (!branch) throw notFound('ไม่พบสาขา')
  const date = req.query.date ? new Date(req.query.date) : new Date()
  const start = new Date(date); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(end.getDate() + 1)
  const [theaters, shows] = await Promise.all([
    Theater.find({ branchId: branch._id, active: true }).sort({ code: 1 }).lean(),
    Show.find({ branchId: branch._id, ...publicShowFilter(), startsAt: { $gte: start > new Date() ? start : new Date(), $lt: end } }).populate('movieId', 'title posterPath durationMinutes ageRating genres').populate('theaterId', 'name code').sort({ startsAt: 1 }).lean(),
  ])
  sendSuccess(res, { branch, theaters, shows })
})

export const getShowSeats = asyncHandler(async (req, res) => {
  const show = await Show.findById(req.params.id).populate('movieId', 'title posterPath durationMinutes').populate('branchId', 'name code').populate('theaterId', 'name code seatLayout').lean()
  if (!show) throw notFound('ไม่พบรอบฉาย')
  const now = new Date()
  await ShowSeat.updateMany({ showId: show._id, status: 'held', holdExpiresAt: { $lte: now } }, { $set: { status: 'available', heldByBookingId: null, heldByUserId: null, holdExpiresAt: null } })
  const seats = await ShowSeat.find({ showId: show._id }, { seatCode: 1, seatType: 1, status: 1, holdExpiresAt: 1 }).sort({ seatCode: 1 }).lean()
  sendSuccess(res, { show, seats, serverTime: now.toISOString(), bookable: ['open', 'scheduled'].includes(show.status) && show.startsAt > now && show.bookingOpenAt <= now && show.bookingCloseAt > now })
})
