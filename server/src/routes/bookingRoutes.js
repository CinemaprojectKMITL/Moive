import { Router } from 'express'
import { cancelBooking, createBooking, debugConfirmPayment, getBooking, myBookings, paymentQr, ticketQr } from '../controllers/bookingController.js'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { bookingCreateSchema } from '../validators/schemas.js'

const router = Router()
router.use(requireAuth)
router.post('/', validate(bookingCreateSchema), createBooking)
router.get('/me', myBookings)
router.get('/:id', getBooking)
router.post('/:id/cancel', cancelBooking)
router.get('/:id/payment-qr', paymentQr)
router.get('/:id/ticket-qr', ticketQr)
router.post('/:id/debug-confirm-payment', debugConfirmPayment)
export default router
