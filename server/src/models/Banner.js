import mongoose from 'mongoose'

const bannerSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  subtitle: { type: String, trim: true, maxlength: 500 },
  imagePath: { type: String, default: null },
  ctaLabel: { type: String, trim: true, maxlength: 80, default: 'ดูรอบฉาย' },
  ctaUrl: { type: String, trim: true, maxlength: 500, default: '/branches' },
  enabled: { type: Boolean, default: true, index: true },
  sortOrder: { type: Number, default: 0 },
  startAt: { type: Date, default: null },
  endAt: { type: Date, default: null },
}, { timestamps: true })

bannerSchema.index({ enabled: 1, sortOrder: 1 })
export const Banner = mongoose.model('Banner', bannerSchema)
