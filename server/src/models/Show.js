import mongoose from 'mongoose'

const showSchema = new mongoose.Schema({
  movieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
  theaterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Theater', required: true, index: true },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  pricing: {
    normal: { type: Number, required: true, min: 0, max: 100000 },
    premium: { type: Number, required: true, min: 0, max: 100000 },
  },
  status: { type: String, enum: ['scheduled', 'open', 'closed', 'completed', 'cancelled'], default: 'scheduled', index: true },
  bookingOpenAt: { type: Date, required: true },
  bookingCloseAt: { type: Date, required: true },
}, { timestamps: true })

showSchema.index({ branchId: 1, startsAt: 1 })
showSchema.index({ movieId: 1, startsAt: 1 })
showSchema.index({ theaterId: 1, startsAt: 1, endsAt: 1 })
export const Show = mongoose.model('Show', showSchema)
