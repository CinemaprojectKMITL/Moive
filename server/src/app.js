import path from 'node:path'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import mongoose from 'mongoose'
import { env } from './config/env.js'
import { errorHandler } from './middleware/errorHandler.js'
import { notFoundHandler } from './middleware/notFound.js'
import { requireAuth } from './middleware/auth.js'
import { apiRequestAccess, bootstrapApiAccess } from './middleware/apiRequestAccess.js'
import { sendSuccess } from './utils/apiResponse.js'
import adminRoutes from './routes/adminRoutes.js'
import authRoutes from './routes/authRoutes.js'
import bookingRoutes from './routes/bookingRoutes.js'
import publicRoutes from './routes/publicRoutes.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((item) => item.trim()), credentials: true }))
  app.use(express.json({ limit: '256kb' }))
  app.use(cookieParser())
  app.use('/media', express.static(path.resolve(process.cwd(), env.MIGDATA_ROOT), { index: false, maxAge: env.NODE_ENV === 'production' ? '7d' : 0 }))

  app.get('/api/health', (_req, res) => sendSuccess(res, { status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', uptime: Math.round(process.uptime()) }))
  app.post('/api/request-access', requireAuth, bootstrapApiAccess)
  app.use('/api', apiRequestAccess)
  app.use('/api/auth', authRoutes)
  app.use('/api/bookings', bookingRoutes)
  app.use('/api/admin', adminRoutes)
  app.use('/api', publicRoutes)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
