import mongoose from 'mongoose'

const mediaSchema = new mongoose.Schema({
  path: { type: String, required: true, unique: true },
  filename: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  ownerType: { type: String, enum: ['movie', 'banner', 'show', 'logo'], required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
}, { timestamps: true })

export const Media = mongoose.model('Media', mediaSchema)
