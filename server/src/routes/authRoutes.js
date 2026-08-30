import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { login, logout, me, register } from '../controllers/authController.js'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { loginSchema, registerSchema } from '../validators/schemas.js'

const router = Router()
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false })

router.post('/register', authLimiter, validate(registerSchema), register)
router.post('/login', authLimiter, validate(loginSchema), login)
router.post('/logout', logout)
router.get('/me', requireAuth, me)

export default router
