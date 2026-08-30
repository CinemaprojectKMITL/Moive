import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Clock3, MapPin, ShieldCheck, Ticket, XCircle } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiGet, apiPost } from '../api/client'
import { ErrorState } from '../components/common/ErrorState'
import { LoadingState } from '../components/common/LoadingState'
import { useToast } from '../contexts/ToastContext'
import { formatCurrency, formatDateTime, statusLabels } from '../utils/format'

const terminal = ['paid', 'cancelled', 'expired']

export function CheckoutPage() {
  const { bookingId } = useParams(); const navigate = useNavigate(); const { show } = useToast()
  const [booking, setBooking] = useState(null); const [qr, setQr] = useState(null); const [ticketQr, setTicketQr] = useState(null); const [error, setError] = useState(''); const [now, setNow] = useState(() => Date.now()); const [paying, setPaying] = useState(false)
  const load = useCallback(async (quiet = false) => { try { const next = await apiGet(`/bookings/${bookingId}`); setBooking(next); if (next.status === 'paid' && next.ticketId && !ticketQr) { const ticket = await apiGet(`/bookings/${bookingId}/ticket-qr`); setTicketQr(ticket.dataUrl) }; if (!quiet) setError('') } catch (err) { if (!quiet) setError(err.message) } }, [bookingId, ticketQr])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (!booking || terminal.includes(booking.status)) return; const poll = window.setInterval(() => load(true), 3000); return () => window.clearInterval(poll) }, [booking, load])
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  useEffect(() => { if (booking && ['holding', 'pending'].includes(booking.status) && !qr) apiGet(`/bookings/${bookingId}/payment-qr`).then(setQr).catch((err) => setError(err.message)) }, [booking, bookingId, qr])
  const remaining = useMemo(() => Math.max(0, Math.floor((new Date(booking?.expiresAt || 0).getTime() - now) / 1000)), [booking, now])
  const confirm = async () => { setPaying(true); try { const result = await apiPost(`/bookings/${bookingId}/mock-confirm`); setBooking(result.booking); setTicketQr(result.ticketQr); show('ชำระเงินสำเร็จ ตั๋วพร้อมใช้งาน') } catch (err) { show(err.message, 'error'); await load(true) } finally { setPaying(false) } }
  const cancel = async () => { try { const next = await apiPost(`/bookings/${bookingId}/cancel`); setBooking(next); show('ยกเลิกการจองแล้ว') } catch (err) { show(err.message, 'error') } }
  if (!booking && !error) return <LoadingState label="กำลังเตรียมการชำระเงิน..." />
  if (error && !booking) return <ErrorState message={error} onRetry={load} />
  const active = ['holding', 'pending'].includes(booking.status) && remaining > 0
  const conflict = booking.status === 'cancelled' && booking.cancellationReason === 'RACE_CONFLICT'
  return <section className="section container page-top"><Link className="back-link" to={`/shows/${booking.showId}/seats`}><ArrowLeft /> กลับไปเลือกที่นั่ง</Link><div className="checkout-grid"><div className="checkout-main"><div className="checkout-heading"><div><p className="eyebrow">SECURE CHECKOUT</p><h1>{booking.status === 'paid' ? 'ตั๋วของคุณพร้อมแล้ว' : 'ชำระเงิน'}</h1></div><span className={`status-pill ${booking.status}`}>{statusLabels[booking.status]}</span></div>
    {conflict && <div className="conflict-panel"><XCircle /><div><h3>ที่นั่งชนกันในเวลาเดียวกัน</h3><p>มีผู้ใช้อื่นเลือกที่นั่งนี้ในเวลาเดียวกัน กรุณาเลือกที่นั่งใหม่</p></div></div>}
    {booking.status === 'expired' && <div className="conflict-panel"><Clock3 /><div><h3>หมดเวลาถือที่นั่ง</h3><p>ระบบคืนที่นั่งเรียบร้อยแล้ว คุณสามารถกลับไปเลือกใหม่ได้</p></div></div>}
    {booking.status === 'paid' ? <div className="ticket-success"><CheckCircle2 /><h2>ชำระเงินสำเร็จ</h2><p>แสดง QR นี้แก่เจ้าหน้าที่ก่อนเข้าโรงภาพยนตร์</p>{ticketQr ? <img src={ticketQr} alt="QR ตั๋วภาพยนตร์" /> : <LoadingState label="กำลังสร้างตั๋ว..." />}<strong>{booking.seats.map((seat) => seat.seatCode).join(', ')}</strong></div> : <div className="payment-card"><div className="timer-box"><span>เวลาที่เหลือ</span><strong>{String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</strong><small>เวลาจากเซิร์ฟเวอร์เป็นหลัก</small></div>{active && qr ? <><img src={qr.dataUrl} alt={`QR ชำระเงิน ${formatCurrency(booking.totalPrice)}`} className="payment-qr" /><p className="payment-target">สแกนเพื่อชำระ {formatCurrency(booking.totalPrice)}</p><button className="btn-primary full" onClick={confirm} disabled={paying}>{paying ? 'กำลังยืนยัน...' : 'ยืนยันการชำระเงินจำลอง'}</button><button className="btn-text" onClick={cancel}>ยกเลิกและคืนที่นั่ง</button></> : !terminal.includes(booking.status) && <LoadingState label="กำลังสร้าง QR..." />}</div>}
  </div><aside className="order-card"><p className="eyebrow">ORDER SUMMARY</p><h2>{booking.movieSnapshot.title}</h2><div className="order-meta"><span><MapPin /> {booking.branchSnapshot.name}</span><span><Ticket /> {booking.theaterSnapshot.name} · {booking.seats.map((seat) => seat.seatCode).join(', ')}</span><span><Clock3 /> {formatDateTime(booking.showTimeSnapshot)}</span></div><div className="price-lines">{booking.seats.map((seat) => <div key={seat.seatCode}><span>{seat.seatCode} · {seat.seatType}</span><strong>{formatCurrency(seat.price)}</strong></div>)}</div><div className="summary-total"><span>ยอดสุทธิ</span><strong>{formatCurrency(booking.totalPrice)}</strong></div><p className="secure-note"><ShieldCheck /> ราคาคำนวณและล็อกโดยเซิร์ฟเวอร์</p>{terminal.includes(booking.status) && booking.status !== 'paid' && <button className="btn-primary full" onClick={() => navigate(`/shows/${booking.showId}/seats`)}>เลือกที่นั่งใหม่</button>}</aside></div></section>
}
