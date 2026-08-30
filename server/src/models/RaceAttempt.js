import mongoose from 'mongoose'

const raceAttemptSchema = new mongoose.Schema({
  showId: { type: mongoose.Schema.Types.ObjectId, ref: 'Show', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  seatCodes: [{ type: String, required: true }],
  clientRequestId: { type: String, required: true },
  conflict: { type: Boolean, default: false },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  createdAt: { type: Date, default: Date.now, expires: 60 },
})

raceAttemptSchema.index({ showId: 1, seatCodes: 1, createdAt: 1 })
export const RaceAttempt = mongoose.model('RaceAttempt', raceAttemptSchema)
