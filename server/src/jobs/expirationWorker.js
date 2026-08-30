import { env } from '../config/env.js'
import { BookingService } from '../services/BookingService.js'
import { logger } from '../utils/logger.js'

let timer
let running = false

export function startExpirationWorker() {
  if (timer) return
  timer = setInterval(async () => {
    if (running) return
    running = true
    try {
      const count = await BookingService.expireBatch()
      if (count) logger.info('booking.expired', { count })
    } catch (error) {
      logger.error('booking.expiration_failed', { message: error.message })
    } finally {
      running = false
    }
  }, env.BOOKING_CLEANUP_INTERVAL_MS)
  timer.unref()
}

export function stopExpirationWorker() {
  if (timer) clearInterval(timer)
  timer = null
}
