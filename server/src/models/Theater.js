import mongoose from 'mongoose'

const seatSchema = new mongoose.Schema({
  code: { type: String, required: true },
  type: { type: String, enum: ['normal', 'premium'], required: true },
  enabled: { type: Boolean, default: true },
}, { _id: false })

const rowSchema = new mongoose.Schema({
  row: { type: String, required: true },
  offset: { type: Number, default: 0 },
  seats: [seatSchema],
}, { _id: false })

const theaterSchema = new mongoose.Schema({
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, trim: true, uppercase: true },
  active: { type: Boolean, default: true, index: true },
  seatCount: { type: Number, required: true, min: 1, max: 1000 },
  seatLayout: { type: [rowSchema], required: true },
}, { timestamps: true })

theaterSchema.index({ branchId: 1, code: 1 }, { unique: true })
export const Theater = mongoose.model('Theater', theaterSchema)
