import cedtLogo from '../../assets/cedt-logo-responsive.svg'

export function MoviePoster({ src, alt, className = '' }) {
  if (src) return <img src={src} alt={alt} className={`movie-poster ${className}`} loading="lazy" />
  // REPLACE_MOVIE_FALLBACK_POSTER_HERE
  return <div className={`movie-poster poster-fallback ${className}`} role="img" aria-label={`โปสเตอร์สำรองสำหรับ ${alt}`}><img className="poster-brand-logo" src={cedtLogo} alt="" /><small>{alt}</small></div>
}
