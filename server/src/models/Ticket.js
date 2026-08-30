import mongoose from 'mongoose'

const ticketSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  showId: { type: mongoose.Schema.Types.ObjectId, ref: 'Show', required: true },
  tokenHash: { type: String, required: true, unique: true },
  issuedAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  status: { type: String, enum: ['valid', 'used', 'cancelled'], default: 'valid' },
}, { timestamps: true })

export const Ticket = mongoose.model('Ticket', ticketSchema)
