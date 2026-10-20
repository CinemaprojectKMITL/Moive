import { useCallback, useEffect, useState } from 'react'
import { displayMovieRating } from '../../shared/movieRatings.js'
import { CalendarDays, Clock3, MapPin, Ticket } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { getMovie } from '../api/movies'
import { EmptyState } from '../components/common/EmptyState'
import { ErrorState } from '../components/common/ErrorState'
import { LoadingState } from '../components/common/LoadingState'
import { MoviePoster } from '../components/common/MoviePoster'
import { useAuth } from '../contexts/AuthContext'
import { BackLink } from '../components/common/BackLink'
import { PaginatedList } from '../components/common/PaginatedList'
import { ShowtimeList } from '../components/common/ShowtimeList'

export function MovieDetailsPage() {
  const { movieId } = useParams(); const [data, setData] = useState(null); const [error, setError] = useState('')
  const { user, loading } = useAuth()
  const userId = user?.id
  const [attempt, setAttempt] = useState(0)
  const load = useCallback(() => getMovie(movieId, userId), [movieId, userId])
  useEffect(() => {
    if (loading || !userId) return
    let active = true
    setData(null)
    setError('')
    load().then((next) => { if (active) setData(next) }).catch((err) => { if (active) setError(err.message) })
    return () => { active = false }
  }, [load, loading, userId, attempt])
  if (!data && !error) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={() => setAttempt((value) => value + 1)} />
  const { movie, shows } = data
  const grouped = Object.values(shows.reduce((map, show) => { const key = show.branchId._id; if (!map[key]) map[key] = { branch: show.branchId, shows: [] }; map[key].shows.push(show); return map }, {}))
  return <><section className="movie-detail-hero"><div className="container"><BackLink /></div><div className="container movie-detail-grid"><MoviePoster src={movie.posterPath} alt={movie.title} /><div className="movie-copy"><p className="eyebrow">{movie.genres?.join(' · ')}</p><h1>{movie.title}</h1><p className="original-title">{movie.originalTitle}</p><div className="movie-facts"><span><Clock3 /> {movie.durationMinutes} นาที</span><span><Ticket /> {displayMovieRating(movie.ageRating)}</span>{movie.releaseDate && <span><CalendarDays /> {new Date(movie.releaseDate).getFullYear()}</span>}</div><p className="description">{movie.description || 'เตรียมพบกับประสบการณ์ภาพยนตร์เรื่องนี้ในโรงภาพยนตร์ CEDT'}</p><a className="btn-primary" href="#showtimes">เลือกรอบฉาย</a></div></div></section><section className="section container" id="showtimes"><div className="section-heading"><div><p className="eyebrow">SHOWTIMES</p><h2>รอบฉายที่เปิดจอง</h2></div></div>{grouped.length ? <PaginatedList key={movieId} items={grouped} pageSize={6} label="สาขาที่มีรอบฉาย">{(visibleGroups) => <div className="showtime-groups">{visibleGroups.map(({ branch, shows: branchShows }) => <article className="showtime-group" key={branch._id}><div className="showtime-branch"><MapPin /><div><h3>{branch.name}</h3><p>{branch.address}</p></div></div><ShowtimeList shows={branchShows} /></article>)}</div>}</PaginatedList> : <EmptyState title="ยังไม่มีรอบฉาย" description="โปรดตรวจสอบรอบฉายอีกครั้งในภายหลัง" />}</section></>
}
