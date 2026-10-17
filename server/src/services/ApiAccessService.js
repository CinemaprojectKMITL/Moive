import mongoose from 'mongoose'
import { Movie } from '../models/Movie.js'
import { Show } from '../models/Show.js'
import { Booking } from '../models/Booking.js'
import { Branch } from '../models/Branch.js'
import { Theater } from '../models/Theater.js'
import { Banner } from '../models/Banner.js'
import { isDebugPaymentEnabled } from '../config/env.js'
import { badRequest, forbidden, notFound } from '../utils/errors.js'

const adminModels = { 'admin-movies': Movie, 'admin-branches': Branch, 'admin-theaters': Theater, 'admin-shows': Show, 'admin-banners': Banner }

export async function authorizeApiAccess(access, user) {
  if (access.admin && user.role !== 'admin') throw forbidden()
  if (access.resourceId === 'self') access = { ...access, resourceId: String(user._id) }
  const { resourceType, resourceId, scope } = access
  let Model
  let filter
  if (resourceType === 'movie') { Model = Movie; filter = { active: true, archived: false } }
  if (resourceType === 'seat' || resourceType === 'booking' && scope === 'create') Model = Show
  if (['booking', 'payment', 'ticket'].includes(resourceType) && scope !== 'create' && scope !== 'list') {
    if (scope === 'debug-confirm' && !isDebugPaymentEnabled()) throw notFound()
    Model = Booking
    filter = user.role === 'admin' && scope !== 'debug-confirm' ? {} : { userId: user._id }
  }
  if (access.admin && resourceId !== 'collection') Model = adminModels[resourceType]
  if (Model) {
    if (!mongoose.isObjectIdOrHexString(resourceId)) throw badRequest('รหัสข้อมูลไม่ถูกต้อง', 'INVALID_ID')
    if (!await Model.exists({ _id: resourceId, ...filter })) throw notFound()
    // Normalize equivalent ObjectId spellings so the binding is canonical.
    access = { ...access, resourceId: resourceId.toLowerCase() }
  }
  return access
}
