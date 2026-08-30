import { createServer } from 'node:http'
import { connectDatabase, disconnectDatabase } from './config/database.js'
import { env } from './config/env.js'
import { startExpirationWorker, stopExpirationWorker } from './jobs/expirationWorker.js'
import { createApp } from './app.js'
import { logger } from './utils/logger.js'

await connectDatabase()
const server = createServer(createApp())
server.listen(env.API_PORT, '0.0.0.0', () => {
  logger.info('api.started', { port: env.API_PORT, environment: env.NODE_ENV })
  startExpirationWorker()
})

async function shutdown(signal) {
  logger.info('api.shutdown', { signal })
  stopExpirationWorker()
  server.close(async () => {
    await disconnectDatabase()
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
