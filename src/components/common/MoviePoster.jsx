import { Film } from 'lucide-react'

export function MoviePoster({ src, alt, className = '' }) {
  if (src) return <img src={src} alt={alt} className={`movie-poster ${className}`} loading="lazy" />
  // REPLACE_MOVIE_FALLBACK_POSTER_HERE
  return <div className={`movie-poster poster-fallback ${className}`} role="img" aria-label={`โปสเตอร์สำรองสำหรับ ${alt}`}><Film size={48} /><span>VISE</span><small>{alt}</small></div>
}
