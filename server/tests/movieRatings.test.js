import { describe, expect, it } from 'vitest'
import { displayMovieRating, normalizeMovieRating, THAI_MOVIE_RATING_CODES } from '../../shared/movieRatings.js'
import { movieSchema, movieUpdateSchema } from '../src/validators/schemas.js'
import { Movie } from '../src/models/Movie.js'

describe('Thai movie rating contract', () => {
  it.each([
    ['ทั่วไป', 'ท'], ['ท', 'ท'], ['ส่งเสริม', 'ส'], ['ส', 'ส'],
    ['13+', 'น 13+'], ['น13+', 'น 13+'], ['น 13+', 'น 13+'],
    ['15+', 'น 15+'], ['น15+', 'น 15+'], ['น 15+', 'น 15+'],
    ['18+', 'น 18+'], ['น18+', 'น 18+'], ['น 18+', 'น 18+'],
    ['20+', 'ฉ 20+'], ['ฉ20+', 'ฉ 20+'], ['ฉ 20+', 'ฉ 20+'],
  ])('normalizes legacy %s to %s for editing and compact display', (legacy, canonical) => {
    expect(normalizeMovieRating(legacy)).toBe(canonical)
    expect(displayMovieRating(legacy)).toBe(canonical)
  })

  it('does not classify unknown or missing legacy values as general audience', () => {
    for (const value of ['PG-13', 'ห้ามฉาย', '', null, undefined]) expect(normalizeMovieRating(value)).toBeNull()
    expect(displayMovieRating('PG-13')).toBe('PG-13')
    expect(displayMovieRating(null)).toBe('ไม่ระบุเรต')
  })

  it('defaults new movies to ท but leaves omitted PATCH ratings untouched', () => {
    expect(movieSchema.parse({ title: 'Film', durationMinutes: 120 }).ageRating).toBe('ท')
    expect(new Movie({ title: 'Film', durationMinutes: 120 }).ageRating).toBe('ท')
    expect(movieUpdateSchema.parse({ title: 'Updated' })).not.toHaveProperty('ageRating')
  })

  it.each(THAI_MOVIE_RATING_CODES)('accepts canonical %s in request and model validation', async (ageRating) => {
    expect(movieSchema.parse({ title: 'Film', durationMinutes: 120, ageRating }).ageRating).toBe(ageRating)
    await expect(new Movie({ title: 'Film', durationMinutes: 120, ageRating }).validate()).resolves.toBeUndefined()
  })

  it.each(['PG-13', '13+', 'ทั่วไป', 'ห้ามฉาย', 'ท — ผู้ชมทั่วไป'])('rejects noncanonical new writes: %s', async (ageRating) => {
    expect(movieSchema.safeParse({ title: 'Film', durationMinutes: 120, ageRating }).success).toBe(false)
    expect(movieUpdateSchema.safeParse({ ageRating }).success).toBe(false)
    await expect(new Movie({ title: 'Film', durationMinutes: 120, ageRating }).validate()).rejects.toThrow()
  })
})
