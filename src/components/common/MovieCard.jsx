import { Clock3, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MoviePoster } from './MoviePoster'
import { displayMovieRating } from '../../../shared/movieRatings.js'

export function MovieCard({ movie }) {
  return <article className="movie-card">
    <Link to={`/movies/${movie._id}`} className="poster-link"><MoviePoster src={movie.posterPath} alt={movie.title} /><span className="card-rating"><Star size={13} fill="currentColor" /> {displayMovieRating(movie.ageRating)}</span></Link>
    <div className="movie-card-body"><p className="eyebrow">{movie.genres?.join(' · ') || 'ภาพยนตร์'}</p><h3><Link to={`/movies/${movie._id}`}>{movie.title}</Link></h3><p className="meta"><Clock3 size={15} /> {movie.durationMinutes} นาที</p><Link className="btn-secondary full" to={`/movies/${movie._id}`}>ดูรอบฉาย</Link></div>
  </article>
}
