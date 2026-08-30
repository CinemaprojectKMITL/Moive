import mongoose from 'mongoose'
import { env } from './env.js'
import { logger } from '../utils/logger.js'

export async function connectDatabase({ attempts = 12 } = {}) {
  mongoose.set('strictQuery', true)
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await mongoose.connect(env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 20,
      })
      logger.info('database.connected', { database: mongoose.connection.name })
      return mongoose.connection
    } catch (error) {
      logger.warn('database.retry', { attempt, message: error.message })
      if (attempt === attempts) throw error
      await new Promise((resolve) => setTimeout(resolve, Math.min(attempt * 1000, 5000)))
    }
  }
  throw new Error('Database connection failed')
}

export async function disconnectDatabase() {
  await mongoose.disconnect()
}
