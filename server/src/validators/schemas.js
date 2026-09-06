import { z } from 'zod'
import { THAI_MOVIE_RATING_CODES } from '../../../shared/movieRatings.js'

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'รหัสข้อมูลไม่ถูกต้อง')
const optionalDate = z.union([z.iso.datetime(), z.literal(''), z.null()]).optional()

export const registerSchema = z.object({
  username: z.string().trim().min(3).max(60).regex(/^[\p{L}\p{N}_.-]+$/u, 'ชื่อผู้ใช้มีอักขระที่ไม่รองรับ'),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().max(100).optional(),
}).strict()

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(128),
}).strict()

export const movieSchema = z.object({
  title: z.string().trim().min(1).max(200),
  originalTitle: z.string().trim().max(200).optional().default(''),
  description: z.string().trim().max(5000).optional().default(''),
  durationMinutes: z.coerce.number().int().min(1).max(600),
  genres: z.array(z.string().trim().min(1).max(50)).max(15).default([]),
  ageRating: z.enum(THAI_MOVIE_RATING_CODES).default('ท'),
  active: z.boolean().optional().default(true),
  releaseDate: optionalDate,
}).strict()

// PATCH must not apply the create default when a rating is omitted.
export const movieUpdateSchema = movieSchema.partial().extend({ ageRating: z.enum(THAI_MOVIE_RATING_CODES).optional() }).strict()

export const branchSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9-]+$/).transform((value) => value.toUpperCase()),
  address: z.string().trim().min(1).max(1000),
  description: z.string().trim().max(3000).optional().default(''),
  active: z.boolean().optional().default(true),
}).strict()

const seatInputSchema = z.object({
  code: z.string().regex(/^[A-Z][1-9]\d?$/),
  type: z.enum(['normal', 'premium']),
  enabled: z.boolean().default(true),
}).strict()

export const theaterSchema = z.object({
  branchId: objectIdSchema,
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9-]+$/).transform((value) => value.toUpperCase()),
  active: z.boolean().optional().default(true),
  seatLayout: z.array(z.object({
    row: z.string().regex(/^[A-Z]$/),
    offset: z.coerce.number().int().min(0).max(10).default(0),
    seats: z.array(seatInputSchema).min(1).max(50),
  }).strict()).min(1).max(26).optional(),
  rows: z.coerce.number().int().min(1).max(26).optional(),
  seatsPerRow: z.coerce.number().int().min(1).max(50).optional(),
}).strict()

export const showSchema = z.object({
  movieId: objectIdSchema,
  branchId: objectIdSchema,
  theaterId: objectIdSchema,
  startsAt: z.iso.datetime(),
  bookingOpenAt: z.iso.datetime().optional(),
  bookingCloseAt: z.iso.datetime().optional(),
  pricing: z.object({
    normal: z.coerce.number().int().min(0).max(100000),
    premium: z.coerce.number().int().min(0).max(100000),
  }).strict(),
  status: z.enum(['scheduled', 'open', 'closed', 'completed', 'cancelled']).optional(),
}).strict()

export const showUpdateSchema = showSchema.partial().strict()

export const bannerSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(500).optional().default(''),
  ctaLabel: z.string().trim().max(80).optional().default('ดูรอบฉาย'),
  ctaUrl: z.string().trim().max(500).refine((value) => value.startsWith('/'), 'CTA ต้องเป็นเส้นทางภายในเว็บไซต์').optional().default('/branches'),
  enabled: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().min(-1000).max(1000).optional().default(0),
  startAt: optionalDate,
  endAt: optionalDate,
}).strict()

export const bookingCreateSchema = z.object({
  showId: objectIdSchema,
  seats: z.array(z.string().regex(/^[A-Z][1-9]\d?$/)).min(1).max(20).refine((values) => new Set(values).size === values.length, 'ที่นั่งซ้ำกัน'),
  idempotencyKey: z.string().min(8).max(100),
  totalPrice: z.unknown().optional(),
}).strict()

export const analyticsQuerySchema = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
}).strict()

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).passthrough()

export const ticketVerifySchema = z.object({ token: z.string().min(20).max(2000), consume: z.boolean().optional().default(false) }).strict()
