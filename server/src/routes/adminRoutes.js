import { Router } from 'express'
import { dashboard } from '../controllers/analyticsController.js'
import { verifyTicket } from '../controllers/bookingController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ticketVerifySchema } from '../validators/schemas.js'
import adminCatalogRoutes from './adminCatalogRoutes.js'

const router = Router()
router.use(requireAuth, requireRole('admin'))
router.get('/analytics', dashboard)
router.post('/tickets/verify', validate(ticketVerifySchema), verifyTicket)
router.use(adminCatalogRoutes)
export default router
