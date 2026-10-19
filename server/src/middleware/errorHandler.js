import mongoose from 'mongoose'
import { AppError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { isProduction } from '../config/env.js'

export function errorHandler(error, req, res, _next) {
  let normalized = error
  if (error?.code === 11000) normalized = new AppError(409, 'DUPLICATE', 'ข้อมูลนี้มีอยู่แล้ว')
  if (error instanceof mongoose.Error.CastError) normalized = new AppError(400, 'INVALID_ID', 'รหัสข้อมูลไม่ถูกต้อง')
  if (error instanceof mongoose.Error.ValidationError) normalized = new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง')
  if (!(normalized instanceof AppError)) {
    // Router params may already be cleared when errors reach this app-level handler.
    const movieTokenPath = /^\/api\/movies\/[^/?]+\/[^/?]+\/[^/?]+(?:\?|$)/.test(req.originalUrl)
    const hasRequestId = movieTokenPath || Boolean(req.get('X-API-Request-ID'))
    logger.error('request.failed', { method: req.method, path: movieTokenPath ? '/api/movies/:id/:userId/:apiRequestId' : req.path, message: hasRequestId ? 'Protected request failed' : error.message, stack: isProduction || hasRequestId ? undefined : error.stack })
    normalized = new AppError(500, 'INTERNAL_ERROR', 'ระบบขัดข้อง กรุณาลองใหม่')
  }
  res.status(normalized.status).json({
    success: false,
    code: normalized.code,
    message: normalized.message,
    ...(normalized.details ? { details: normalized.details } : {}),
  })
}
