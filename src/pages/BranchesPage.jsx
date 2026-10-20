import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Building2, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { apiGet } from '../api/client'
import { EmptyState } from '../components/common/EmptyState'
import { ErrorState } from '../components/common/ErrorState'
import { LoadingState } from '../components/common/LoadingState'
import { BackLink } from '../components/common/BackLink'
import { PaginatedList } from '../components/common/PaginatedList'

export function BranchesPage() {
  const [branches, setBranches] = useState(null); const [error, setError] = useState('')
  const load = useCallback(async () => { try { setBranches(await apiGet('/branches')); setError('') } catch (err) { setError(err.message) } }, [])
  useEffect(() => { load() }, [load])
  if (!branches && !error) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  return <section className="section container page-top"><BackLink /><div className="page-title"><p className="eyebrow">OUR CINEMAS</p><h1>โรงภาพยนตร์ของเรา</h1><p>เลือกสาขาที่สะดวก แล้วค้นหารอบฉายที่เหมาะกับคุณ</p></div>{branches.length ? <PaginatedList items={branches} pageSize={9} label="สาขา">{(visibleBranches, offset) => <div className="branch-grid">{visibleBranches.map((branch, index) => <Link className="branch-card" key={branch._id} to={`/branches/${branch._id}`}><div className="branch-card-top"><span>{String(offset + index + 1).padStart(2, '0')}</span><Building2 /></div><h2>{branch.name}</h2><p><MapPin size={17} /> {branch.address}</p><div className="card-link">ดูรอบฉาย <ArrowRight /></div></Link>)}</div>}</PaginatedList> : <EmptyState title="ยังไม่มีสาขา" />}</section>
}
