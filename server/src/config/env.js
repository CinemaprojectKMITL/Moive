import 'dotenv/config'
import crypto from 'node:crypto'
import { z } from 'zod'

const booleanFromEnv = (fallback) => z.preprocess(
  (value) => value === undefined ? fallback : String(value).toLowerCase() === 'true',
  z.boolean(),
)

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  MONGO_URI: z.string().default('mongodb://127.0.0.1:27017/cinema?replicaSet=rs0'),
  JWT_SECRET: z.string().min(32).optional(),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  BOOKING_HOLD_MINUTES: z.coerce.number().positive().max(30).default(5),
  BOOKING_CLEANUP_INTERVAL_MS: z.coerce.number().int().min(1000).default(10000),
  STRICT_RACE_CANCEL_BOTH: booleanFromEnv(true),
  RACE_WINDOW_MS: z.coerce.number().int().min(0).max(2000).default(300),
  // Validate at QR generation time so missing payment configuration does not disable the catalog.
  PAYMENT_QR_TARGET: z.string().optional(),
  ENABLE_DEBUG_PAYMENT: booleanFromEnv(false),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(25).default(5),
  THEATER_CLEANUP_MINUTES: z.coerce.number().int().min(0).max(120).default(15),
  MIGDATA_ROOT: z.string().default('migdata'),
  QRDATA_ROOT: z.string().default('qrdata'),
  SEED_ADMIN_USERNAME: z.string().default('admin'),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('change-me'),
})

const parsed = schema.parse(process.env)
if (parsed.NODE_ENV === 'production' && !parsed.JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production')
}
export const env = { ...parsed, JWT_SECRET: parsed.JWT_SECRET || crypto.randomBytes(48).toString('hex') }
export const isProduction = env.NODE_ENV === 'production'
export const isDebugPaymentEnabled = () => env.NODE_ENV !== 'production' && env.ENABLE_DEBUG_PAYMENT === true
