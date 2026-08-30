import mongoose from 'mongoose'

const bookingSeatSchema = new mongoose.Schema({
  seatCode: { type: String, required: true },
  seatType: { type: String, enum: ['normal', 'premium'], required: true },
  price: { type: Number, required: true, min: 0 },
}, { _id: false })

const bookingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  showId: { type: mongoose.Schema.Types.ObjectId, ref: 'Show', required: true, index: true },
  clientRequestId: { type: String, required: true, maxlength: 100 },
  seats: { type: [bookingSeatSchema], required: true },
  totalPrice: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['holding', 'pending', 'paid', 'cancelled', 'expired'], default: 'holding', index: true },
  cancellationReason: { type: String, default: null },
  expiresAt: { type: Date, required: true, index: true },
  movieSnapshot: { type: Object, required: true },
  branchSnapshot: { type: Object, required: true },
  theaterSnapshot: { type: Object, required: true },
  showTimeSnapshot: { type: Date, required: true },
  payment: {
    target: String,
    qrPayload: String,
    generatedAt: Date,
    paidAt: Date,
  },
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null },
}, { timestamps: true })

bookingSchema.index({ userId: 1, clientRequestId: 1 }, { unique: true })
bookingSchema.index({ status: 1, expiresAt: 1 })
bookingSchema.index({ showTimeSnapshot: 1, status: 1 })
export const Booking = mongoose.model('Booking', bookingSchema)
