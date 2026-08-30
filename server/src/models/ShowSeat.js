import mongoose from 'mongoose'

const showSeatSchema = new mongoose.Schema({
  showId: { type: mongoose.Schema.Types.ObjectId, ref: 'Show', required: true },
  seatCode: { type: String, required: true, uppercase: true },
  seatType: { type: String, enum: ['normal', 'premium'], required: true },
  status: { type: String, enum: ['available', 'held', 'booked'], default: 'available' },
  heldByBookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  heldByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  holdExpiresAt: { type: Date, default: null },
  bookedByBookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  bookedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  bookedAt: { type: Date, default: null },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  theaterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Theater', required: true },
  movieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true },
  showTime: { type: Date, required: true },
}, { timestamps: true })

showSeatSchema.index({ showId: 1, seatCode: 1 }, { unique: true })
showSeatSchema.index({ showId: 1, status: 1 })
showSeatSchema.index({ heldByBookingId: 1 })
showSeatSchema.index({ holdExpiresAt: 1 })
showSeatSchema.index({ bookedByUserId: 1 })
showSeatSchema.index({ showTime: 1 })
export const ShowSeat = mongoose.model('ShowSeat', showSeatSchema)
