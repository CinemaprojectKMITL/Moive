import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { User } from '../models/User.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { forbidden, unauthorized } from '../utils/errors.js'

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const bearer = req.get('authorization')?.startsWith('Bearer ') ? req.get('authorization').slice(7) : null
  const token = req.cookies?.cinema_session || bearer
  if (!token) throw unauthorized()
  let payload
  try {
    payload = jwt.verify(token, env.JWT_SECRET)
  } catch {
    throw unauthorized('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง')
  }
  const user = await User.findById(payload.sub).select('username displayName role active').lean()
  if (!user?.active) throw unauthorized('บัญชีนี้ไม่พร้อมใช้งาน')
  req.user = user
  next()
})

export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.cinema_session
  if (!token) return next()
  try {
    const payload = jwt.verify(token, env.JWT_SECRET)
    req.user = await User.findById(payload.sub).select('username displayName role active').lean()
  } catch {
    req.user = null
  }
  return next()
})

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(forbidden())
  return next()
}
