import mongoose from 'mongoose'

const movieSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  originalTitle: { type: String, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 5000 },
  durationMinutes: { type: Number, required: true, min: 1, max: 600 },
  genres: [{ type: String, trim: true, maxlength: 50 }],
  ageRating: { type: String, trim: true, maxlength: 20, default: 'ทั่วไป' },
  posterPath: { type: String, default: null },
  active: { type: Boolean, default: true, index: true },
  archived: { type: Boolean, default: false, index: true },
  releaseDate: { type: Date, default: null },
}, { timestamps: true })

movieSchema.index({ title: 'text', originalTitle: 'text' })
export const Movie = mongoose.model('Movie', movieSchema)
