import mongoose from 'mongoose'

const branchSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  address: { type: String, required: true, trim: true, maxlength: 1000 },
  description: { type: String, trim: true, maxlength: 3000 },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true })

export const Branch = mongoose.model('Branch', branchSchema)
