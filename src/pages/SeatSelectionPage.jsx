import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Clock3, MapPin, RefreshCcw, Ticket } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiGet, apiPost } from '../api/client'
import { ErrorState } from '../components/common/ErrorState'
import { LoadingState } from '../components/common/LoadingState'
import { SeatLegend } from '../components/seat/SeatLegend'
import { SeatMap } from '../components/seat/SeatMap'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { formatCurrency, formatDateTime } from '../utils/format'

export function SeatSelectionPage() {
  const { showId } = useParams(); const navigate = useNavigate(); const { user } = useAuth(); const { show: toast } = useToast()
  const [data, setData] = useState(null); const [selected, setSelected] = useState(new Set()); const [error, setError] = useState(''); const [submitting, setSubmitting] = useState(false)
  const load = useCallback(async (quiet = false) => { try { if (!quiet) setError(''); const next = await apiGet(`/shows/${showId}/seats`); setData(next); setSelected((current) => new Set([...current].filter((code) => next.seats.find((seat) => seat.seatCode === code)?.status === 'available'))) } catch (err) { if (!quiet) setError(err.message) } }, [showId])
  useEffect(() => { load(); const timer = window.setInterval(() => load(true), 15_000); return () => window.clearInterval(timer) }, [load])
  const toggle = (code) => setSelected((current) => { const next = new Set(current); if (next.has(code)) next.delete(code); else if (next.size < 10) next.add(code); else toast('เลือกได้สูงสุด 10 ที่นั่งต่อครั้ง', 'error'); return next })
  const breakdown = useMemo(() => {
    if (!data) return { total: 0, items: [] }
    const items = [...selected].map((code) => { const seat = data.seats.find((item) => item.seatCode === code); return { code, type: seat.seatType, price: data.show.pricing[seat.seatType] } })
    return { items, total: items.reduce((sum, item) => sum + item.price, 0) }
  }, [data, selected])
  const checkout = async () => {
    if (!user) { navigate('/login', { state: { from: { pathname: `/shows/${showId}/seats` } } }); return }
    if (!selected.size) return
    setSubmitting(true)
    try {
      const booking = await apiPost('/bookings', { showId, seats: [...selected], idempotencyKey: crypto.randomUUID() })
      navigate(`/checkout/${booking._id}`)
    } catch (err) {
      if (['SEAT_CONFLICT', 'RACE_CONFLICT'].includes(err.code)) {
        setSelected(new Set()); await load(true); toast('มีผู้ใช้อื่นเลือกที่นั่งนี้ในเวลาเดียวกัน กรุณาเลือกที่นั่งใหม่', 'error')
      } else toast(err.message, 'error')
    } finally { setSubmitting(false) }
  }
  if (!data && !error) return <LoadingState label="กำลังเตรียมผังที่นั่ง..." />
  if (error) return <ErrorState message={error} onRetry={load} />
  const { show } = data
  return <div className="seat-page"><div className="container seat-header"><Link to={`/movies/${show.movieId._id}`} className="back-link"><ArrowLeft /> กลับ</Link><div><p className="eyebrow">SELECT YOUR SEATS</p><h1>{show.movieId.title}</h1><div className="seat-show-meta"><span><MapPin /> {show.branchId.name} · {show.theaterId.name}</span><span><Clock3 /> {formatDateTime(show.startsAt)}</span></div></div><button className="icon-btn" onClick={() => load()} title="รีเฟรชที่นั่ง"><RefreshCcw size={19} /></button></div><div className="container seat-workspace"><div className="seat-panel"><SeatLegend /><SeatMap layout={show.theaterId.seatLayout} seats={data.seats} selected={selected} onToggle={toggle} /></div><aside className={`seat-summary ${selected.size > 0 ? 'has-selection' : ''}`}><p className="eyebrow">YOUR SELECTION</p><h2>สรุปที่นั่ง</h2>{breakdown.items.length ? <div className="selected-list">{breakdown.items.map((item) => <div key={item.code}><span><Ticket size={16} /> {item.code}<small>{item.type === 'premium' ? 'Premium' : 'Normal'}</small></span><strong>{formatCurrency(item.price)}</strong></div>)}</div> : <p className="empty-selection">แตะที่นั่งว่างบนผังเพื่อเลือก</p>}<div className="summary-total"><span>ยอดรวม <small>ราคาจริงยืนยันโดยระบบ</small></span><strong>{formatCurrency(breakdown.total)}</strong></div><button className="btn-primary full" onClick={checkout} disabled={!selected.size || !data.bookable || submitting}>{submitting ? 'กำลังล็อกที่นั่ง...' : user ? `ไปชำระเงิน · ${selected.size} ที่นั่ง` : 'เข้าสู่ระบบเพื่อจอง'}</button>{!data.bookable && <p className="form-error">รอบนี้ไม่เปิดรับจองแล้ว</p>}<p className="hold-note">การเลือกบนหน้านี้ยังไม่ล็อกที่นั่ง ระบบจะเริ่มถือ 5 นาทีเมื่อกดไปชำระเงิน</p></aside></div></div>
}