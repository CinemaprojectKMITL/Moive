import { useCallback, useEffect, useState } from 'react'
import { Clock3, MapPin } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { apiGet } from '../api/client'
import { EmptyState } from '../components/common/EmptyState'
import { ErrorState } from '../components/common/ErrorState'
import { LoadingState } from '../components/common/LoadingState'
import { MoviePoster } from '../components/common/MoviePoster'
import { formatCurrency } from '../utils/format'

export function BranchDetailsPage() {
  const { branchId } = useParams(); const [data, setData] = useState(null); const [error, setError] = useState('')
  const load = useCallback(async () => { try { setData(await apiGet(`/branches/${branchId}`)); setError('') } catch (err) { setError(err.message) } }, [branchId])
  useEffect(() => { load() }, [load])
  if (!data && !error) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  const groups = Object.values(data.shows.reduce((map, show) => { const key = show.movieId._id; if (!map[key]) map[key] = { movie: show.movieId, shows: [] }; map[key].shows.push(show); return map }, {}))
  return <><section className="branch-detail-head"><div className="container"><p className="eyebrow">{data.branch.code}</p><h1>{data.branch.name}</h1><p><MapPin size={18} /> {data.branch.address}</p><div className="branch-metrics"><span><strong>{data.theaters.length}</strong> โรงภาพยนตร์</span><span><strong>{data.shows.length}</strong> รอบวันนี้</span></div></div></section><section className="section container"><div className="section-heading"><div><p className="eyebrow">TODAY'S PROGRAM</p><h2>รอบฉายวันนี้</h2></div></div>{groups.length ? <div className="branch-movie-list">{groups.map(({ movie, shows }) => <article key={movie._id} className="branch-movie-row"><MoviePoster src={movie.posterPath} alt={movie.title} /><div className="branch-movie-info"><p className="eyebrow">{movie.genres?.join(' · ')}</p><h3>{movie.title}</h3><p className="meta"><Clock3 size={15} /> {movie.durationMinutes} นาที · {movie.ageRating}</p><div className="showtime-list">{shows.map((show) => <Link className="showtime-button" key={show._id} to={`/shows/${show._id}/seats`}><strong>{new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(new Date(show.startsAt))}</strong><span>{show.theaterId.name}</span><small>{formatCurrency(show.pricing.normal)}</small></Link>)}</div></div></article>)}</div> : <EmptyState title="ไม่มีรอบฉายวันนี้" description="ลองเลือกสาขาอื่นหรือกลับมาตรวจสอบอีกครั้ง" />}</section></>
}
