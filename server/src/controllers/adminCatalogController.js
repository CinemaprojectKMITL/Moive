import { Banner } from '../models/Banner.js'
import { Booking } from '../models/Booking.js'
import { Branch } from '../models/Branch.js'
import { Media } from '../models/Media.js'
import { Movie } from '../models/Movie.js'
import { Show } from '../models/Show.js'
import { Theater } from '../models/Theater.js'
import { User } from '../models/User.js'
import { ShowService } from '../services/ShowService.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { badRequest, conflict, notFound } from '../utils/errors.js'
import { createSeatLayout, flattenSeatLayout } from '../utils/seatLayout.js'
import { publicMediaPath } from '../middleware/upload.js'

const modelMap = { movies: Movie, branches: Branch, theaters: Theater, banners: Banner }

export const listResource = (resource) => asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100)
  const filter = resource === 'theaters' && req.query.branchId ? { branchId: req.query.branchId } : {}
  const Model = modelMap[resource]
  const [items, total] = await Promise.all([
    Model.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Model.countDocuments(filter),
  ])
  sendSuccess(res, { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } })
})

export const createMovie = asyncHandler(async (req, res) => sendSuccess(res, await Movie.create(req.body), 201))
export const updateMovie = asyncHandler(async (req, res) => {
  const movie = await Movie.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after', runValidators: true })
  if (!movie) throw notFound('ไม่พบภาพยนตร์')
  sendSuccess(res, movie)
})
export const archiveMovie = asyncHandler(async (req, res) => {
  const movie = await Movie.findByIdAndUpdate(req.params.id, { archived: true, active: false }, { returnDocument: 'after' })
  if (!movie) throw notFound('ไม่พบภาพยนตร์')
  sendSuccess(res, movie)
})

export const createBranch = asyncHandler(async (req, res) => sendSuccess(res, await Branch.create(req.body), 201))
export const updateBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after', runValidators: true })
  if (!branch) throw notFound('ไม่พบสาขา')
  sendSuccess(res, branch)
})

export const createTheater = asyncHandler(async (req, res) => {
  if (!await Branch.exists({ _id: req.body.branchId })) throw notFound('ไม่พบสาขา')
  const seatLayout = req.body.seatLayout || createSeatLayout(req.body.rows || 15, req.body.seatsPerRow || 20)
  const theater = await Theater.create({ ...req.body, seatLayout, seatCount: flattenSeatLayout(seatLayout).length })
  sendSuccess(res, theater, 201)
})
export const updateTheater = asyncHandler(async (req, res) => {
  const theater = await Theater.findById(req.params.id)
  if (!theater) throw notFound('ไม่พบโรงภาพยนตร์')
  const hasShows = req.body.seatLayout && await Show.exists({ theaterId: theater._id })
  if (hasShows) throw conflict('ไม่สามารถเปลี่ยนผังที่นั่งหลังสร้างรอบฉายแล้ว', 'THEATER_HAS_SHOWS')
  Object.assign(theater, req.body)
  if (req.body.seatLayout) theater.seatCount = flattenSeatLayout(req.body.seatLayout).length
  await theater.save()
  sendSuccess(res, theater)
})

export const createShow = asyncHandler(async (req, res) => sendSuccess(res, await ShowService.create(req.body), 201))
export const updateShow = asyncHandler(async (req, res) => sendSuccess(res, await ShowService.update(req.params.id, req.body)))
export const listShows = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100)
  const filter = {}
  if (req.query.branchId) filter.branchId = req.query.branchId
  if (req.query.status) filter.status = req.query.status
  const [items, total] = await Promise.all([
    Show.find(filter).populate('movieId', 'title posterPath').populate('branchId', 'name code').populate('theaterId', 'name code').sort({ startsAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Show.countDocuments(filter),
  ])
  sendSuccess(res, { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } })
})

export const createBanner = asyncHandler(async (req, res) => sendSuccess(res, await Banner.create(req.body), 201))
export const updateBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after', runValidators: true })
  if (!banner) throw notFound('ไม่พบแบนเนอร์')
  sendSuccess(res, banner)
})
export const deleteBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findById(req.params.id)
  if (!banner) throw notFound('ไม่พบแบนเนอร์')
  banner.enabled = false
  await banner.save()
  sendSuccess(res, banner)
})

export const uploadOwnerImage = (ownerType, Model, field) => asyncHandler(async (req, res) => {
  if (!req.file) throw notFound('ไม่พบไฟล์รูปภาพ')
  const owner = await Model.findById(req.params.id)
  if (!owner) throw notFound('ไม่พบข้อมูลเจ้าของรูปภาพ')
  const mediaPath = publicMediaPath(req.file.path)
  await Media.create({ path: mediaPath, filename: req.file.filename, mimeType: req.file.mimetype, size: req.file.size, ownerType, ownerId: owner._id })
  owner[field] = mediaPath
  // Unknown legacy movie ratings remain readable and must not block an unrelated poster upload.
  await owner.save(ownerType === 'movie' ? { validateModifiedOnly: true } : {})
  sendSuccess(res, owner)
})

export const listBookings = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100)
  const filter = {}
  if (req.query.status) {
    if (!['holding', 'pending', 'paid', 'cancelled', 'expired'].includes(req.query.status)) throw badRequest('สถานะการจองไม่ถูกต้อง')
    filter.status = req.query.status
  }
  if (req.query.branchId) filter['branchSnapshot.id'] = req.query.branchId
  if (req.query.movieId) filter['movieSnapshot.id'] = req.query.movieId
  if (req.query.showId) filter.showId = req.query.showId
  if (req.query.username) {
    const escaped = req.query.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const users = await User.find({ usernameNormalized: { $regex: escaped, $options: 'i' } }, '_id').limit(100).lean()
    filter.userId = { $in: users.map((user) => user._id) }
  }
  if (req.query.from || req.query.to) {
    const from = req.query.from ? new Date(req.query.from) : null
    const to = req.query.to ? new Date(req.query.to) : null
    if (from && Number.isNaN(from.getTime()) || to && Number.isNaN(to.getTime()) || from && to && from > to) throw badRequest('ช่วงวันที่ไม่ถูกต้อง')
    filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) }
  }
  const [items, total] = await Promise.all([
    Booking.find(filter).populate('userId', 'username displayName').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Booking.countDocuments(filter),
  ])
  sendSuccess(res, { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } })
})
