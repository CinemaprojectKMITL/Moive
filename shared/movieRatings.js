export const THAI_MOVIE_RATINGS = [
  { value: 'ส', label: 'ส — ส่งเสริมการเรียนรู้' },
  { value: 'ท', label: 'ท — ผู้ชมทั่วไป' },
  { value: 'น 13+', label: 'น 13+ — อายุ 13 ปีขึ้นไป' },
  { value: 'น 15+', label: 'น 15+ — อายุ 15 ปีขึ้นไป' },
  { value: 'น 18+', label: 'น 18+ — อายุ 18 ปีขึ้นไป' },
  { value: 'ฉ 20+', label: 'ฉ 20+ — ห้ามผู้มีอายุต่ำกว่า 20 ปีดู' },
]
export const THAI_MOVIE_RATING_CODES = THAI_MOVIE_RATINGS.map(({ value }) => value)

const legacyRatings = new Map([
  ['ทั่วไป', 'ท'], ['ท', 'ท'], ['ส่งเสริม', 'ส'], ['ส', 'ส'],
  ['13+', 'น 13+'], ['น13+', 'น 13+'],
  ['15+', 'น 15+'], ['น15+', 'น 15+'],
  ['18+', 'น 18+'], ['น18+', 'น 18+'],
  ['20+', 'ฉ 20+'], ['ฉ20+', 'ฉ 20+'],
])

// Null means unknown/missing, never silently reclassify an existing film as general audience.
export const normalizeMovieRating = (value) => typeof value === 'string'
  ? legacyRatings.get(value.replace(/\s/g, '')) ?? null
  : null

export const displayMovieRating = (value) => normalizeMovieRating(value) || (typeof value === 'string' && value.trim()) || 'ไม่ระบุเรต'
