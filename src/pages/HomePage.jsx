import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Building2, Play, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { apiGet } from '../api/client'
import { EmptyState } from '../components/common/EmptyState'
import { ErrorState } from '../components/common/ErrorState'
import { LoadingState } from '../components/common/LoadingState'
import { MovieCard } from '../components/common/MovieCard'
import { PaginatedList } from '../components/common/PaginatedList'

export function HomePage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => { try { setError(''); setData(await apiGet('/home')) } catch (err) { setError(err.message) } }, [])
  useEffect(() => { load() }, [load])
  if (!data && !error) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  const banner = data.banners[0]
  return <>
    <section className="hero-section">
      {banner?.imagePath && <img src={banner.imagePath} alt="" className="hero-image" />}
      {/* REPLACE_BANNER_PLACEHOLDER_HERE */}
      <div className="hero-grain" /><div className="container hero-content"><p className="hero-kicker"><Sparkles size={16} /> CEDT ORIGINAL EXPERIENCE</p><h1>{banner?.title || 'ช่วงเวลาที่ใช่ ที่นั่งที่ชอบ'}</h1><p>{banner?.subtitle || 'สัมผัสโลกภาพยนตร์ในบรรยากาศที่ออกแบบมาเพื่อทุกความรู้สึก'}</p><div className="hero-actions"><Link className="btn-primary" to={banner?.ctaUrl || '/branches'}><Play size={18} fill="currentColor" /> {banner?.ctaLabel || 'เลือกสาขา'}</Link><a className="btn-ghost" href="#now-showing">กำลังฉาย <ArrowRight size={18} /></a></div></div>
      <div className="hero-stats"><div><strong>{data.movies.length}</strong><span>เรื่องที่กำลังฉาย</span></div><div><strong>{data.branches.length}</strong><span>สาขาทั่วกรุงเทพฯ</span></div><div><strong>{data.theaterCount}</strong><span>โรงภาพยนตร์</span></div></div>
    </section>
    <section className="section container" id="now-showing"><div className="section-heading"><div><p className="eyebrow">NOW SHOWING</p><h2>กำลังฉาย</h2></div><Link to="/branches">ดูรอบทั้งหมด <ArrowRight size={17} /></Link></div>
      {data.movies.length ? <PaginatedList items={data.movies} pageSize={10} label="ภาพยนตร์">{(movies) => <div className="movie-grid">{movies.map((movie) => <MovieCard key={movie._id} movie={movie} />)}</div>}</PaginatedList> : <EmptyState title="ยังไม่มีภาพยนตร์ที่กำลังฉาย" description="ผู้ดูแลระบบสามารถเพิ่มภาพยนตร์และรอบฉายได้" />}
    </section>
    <section className="section branch-band"><div className="container"><div className="section-heading"><div><p className="eyebrow">CINEMA LOCATIONS</p><h2>เลือกสาขาใกล้คุณ</h2></div><Link to="/branches">ทุกสาขา <ArrowRight size={17} /></Link></div><PaginatedList items={data.branches} pageSize={5} label="สาขา">{(branches, offset) => <div className="branch-strip">{branches.map((branch, index) => <Link to={`/branches/${branch._id}`} className="branch-tile" key={branch._id}><span className="branch-number">{String(offset + index + 1).padStart(2, '0')}</span><Building2 /><div><h3>{branch.name}</h3><p>{branch.address}</p></div><ArrowRight className="branch-arrow" /></Link>)}</div>}</PaginatedList></div></section>
  </>
}
