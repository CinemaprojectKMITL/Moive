import { useCallback, useEffect, useState } from 'react'
import { Clock3, MapPin, QrCode, Ticket } from 'lucide-react'
import { Link } from 'react-router-dom'
import { apiGet } from '../api/client'
import { EmptyState } from '../components/common/EmptyState'
import { ErrorState } from '../components/common/ErrorState'
import { LoadingState } from '../components/common/LoadingState'
import { formatCurrency, formatDateTime, statusLabels } from '../utils/format'

export function MyBookingsPage() {
  const [data, setData] = useState(null); const [error, setError] = useState(''); const [qrs, setQrs] = useState({})
  const load = useCallback(async () => { try { setData(await apiGet('/bookings/me')); setError('') } catch (err) { setError(err.message) } }, [])
  useEffect(() => { load() }, [load])
  const loadQr = async (id) => { const result = await apiGet(`/bookings/${id}/ticket-qr`); setQrs((current) => ({ ...current, [id]: result.dataUrl })) }
  if (!data && !error) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  return <section className="section container page-top"><div className="page-title"><p className="eyebrow">MY BOOKINGS</p><h1>การจองของฉัน</h1><p>ประวัติการจองและตั๋วภาพยนตร์ทั้งหมดอยู่ที่นี่</p></div>{data.items.length ? <div className="booking-list">{data.items.map((booking) => <article className="booking-card" key={booking._id}><div className="booking-main"><div className="booking-title"><div><p className="eyebrow">BOOKING · {booking._id.slice(-8).toUpperCase()}</p><h2>{booking.movieSnapshot.title}</h2></div><span className={`status-pill ${booking.status}`}>{statusLabels[booking.status]}</span></div><div className="booking-meta"><span><MapPin /> {booking.branchSnapshot.name} · {booking.theaterSnapshot.name}</span><span><Clock3 /> {formatDateTime(booking.showTimeSnapshot)}</span><span><Ticket /> ที่นั่ง {booking.seats.map((seat) => seat.seatCode).join(', ')}</span></div><div className="booking-bottom"><strong>{formatCurrency(booking.totalPrice)}</strong>{['holding', 'pending'].includes(booking.status) && <Link className="btn-primary compact" to={`/checkout/${booking._id}`}>ชำระเงินต่อ</Link>}{booking.status === 'paid' && !qrs[booking._id] && <button className="btn-secondary" onClick={() => loadQr(booking._id)}><QrCode size={17} /> แสดงตั๋ว QR</button>}</div></div>{qrs[booking._id] && <div className="booking-qr"><img src={qrs[booking._id]} alt="QR ตั๋ว" /><span>พร้อมเข้าโรง</span></div>}</article>)}</div> : <EmptyState title="ยังไม่มีการจอง" description="เลือกภาพยนตร์เรื่องโปรด แล้วเริ่มจองที่นั่งแรกของคุณ" action={<Link className="btn-primary" to="/">ดูภาพยนตร์</Link>} />}</section>
}
