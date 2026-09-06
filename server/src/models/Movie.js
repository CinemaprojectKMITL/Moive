import mongoose from 'mongoose'
import { normalizeMovieRating, THAI_MOVIE_RATING_CODES } from '../../../shared/movieRatings.js'

const movieSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  originalTitle: { type: String, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 5000 },
  durationMinutes: { type: Number, required: true, min: 1, max: 600 },
  genres: [{ type: String, trim: true, maxlength: 50 }],
  ageRating: { type: String, enum: THAI_MOVIE_RATING_CODES, required: true, default: 'ท' },
  posterPath: { type: String, default: null },
  active: { type: Boolean, default: true, index: true },
  archived: { type: Boolean, default: false, index: true },
  releaseDate: { type: Date, default: null },
}, { timestamps: true })

movieSchema.index({ title: 'text', originalTitle: 'text' })
movieSchema.pre('validate', function () {
  // Existing known legacy values can be saved as canonical values; new arbitrary values still fail enum validation.
  if (!this.isNew) {
    const normalized = normalizeMovieRating(this.ageRating)
    if (normalized) this.ageRating = normalized
  }
})
export const Movie = mongoose.model('Movie', movieSchema)
