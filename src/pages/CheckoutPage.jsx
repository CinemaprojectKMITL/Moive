import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, Clock3, MapPin, ShieldCheck, Ticket, XCircle } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiGet, apiPost } from '../api/client'
import { ErrorState } from '../components/common/ErrorState'
import { LoadingState } from '../components/common/LoadingState'
import { useToast } from '../contexts/ToastContext'
import { formatDateTime, statusLabels } from '../utils/format'
import cedtLogo from '../assets/cedt-logo-full.svg'

const terminal = ['paid', 'cancelled', 'expired']
const debugPaymentAvailable = import.meta.env.DEBUG_PAYMENT_DEV_SERVER && import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_PAYMENT === 'true'
const formatCurrency = (value) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)

export function CheckoutPage() {
  const { bookingId } = useParams(); const navigate = useNavigate(); const { show } = useToast()
  const [booking, setBooking] = useState(null); const [qr, setQr] = useState(null); const [ticketQr, setTicketQr] = useState(null); const [error, setError] = useState(''); const [now, setNow] = useState(() => Date.now())
  const [qrError, setQrError] = useState('')
  const [qrAttempt, setQrAttempt] = useState(0)
  const [debugPaying, setDebugPaying] = useState(false)
  const debugRequestRef = useRef(null)
  useEffect(() => {
    setDebugPaying(false)
    return () => { debugRequestRef.current = null }
  }, [bookingId])
  const load = useCallback(async (quiet = false) => { try { const next = await apiGet(`/bookings/${bookingId}`); setBooking((previous) => previous?._id === next._id && previous.status === 'paid' ? previous : next); if (next.status === 'paid' && next.ticketId && !ticketQr) { const ticket = await apiGet(`/bookings/${bookingId}/ticket-qr`); setTicketQr(ticket.dataUrl) }; if (!quiet) setError('') } catch (err) { if (!quiet) setError(err.message) } }, [bookingId, ticketQr])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (!booking || terminal.includes(booking.status)) return; const poll = window.setInterval(() => load(true), 3000); return () => window.clearInterval(poll) }, [booking, load])
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const remaining = useMemo(() => Math.max(0, Math.floor((new Date(booking?.expiresAt || 0).getTime() - now) / 1000)), [booking, now])
  const active = booking?._id === bookingId && ['holding', 'pending'].includes(booking.status) && remaining > 0
  useEffect(() => {
    let cancelled = false
    setQr(null)
    setQrError('')
    if (active) apiGet(`/bookings/${bookingId}/payment-qr`).then((result) => {
      if (!cancelled) setQr(result)
    }).catch((err) => { if (!cancelled) setQrError(err.message) })
    return () => { cancelled = true }
  }, [bookingId, active, qrAttempt])
  const cancel = async () => { try { const next = await apiPost(`/bookings/${bookingId}/cancel`); setBooking(next); show('ยกเลิกการจองแล้ว') } catch (err) { show(err.message, 'error') } }
  const debugConfirm = async () => {
    if (debugRequestRef.current || !debugPaymentAvailable || !booking?.debugPaymentEnabled || booking.status !== 'pending' || !active) return
    const request = {}
    debugRequestRef.current = request // Synchronous guard against double clicks before React renders.
    setDebugPaying(true)
    try {
      const next = await apiPost(`/bookings/${bookingId}/debug-confirm-payment`)
      if (debugRequestRef.current !== request) return
      setBooking(next)
      show('Debug: simulated successful payment')
      const ticket = await apiGet(`/bookings/${bookingId}/ticket-qr`)
      if (debugRequestRef.current === request) setTicketQr(ticket.dataUrl)
    } catch (err) {
      if (debugRequestRef.current === request) { show(err.message, 'error'); await load(true) }
    } finally {
      if (debugRequestRef.current === request) { debugRequestRef.current = null; setDebugPaying(false) }
    }
  }
  if (!booking && !error) return <LoadingState label="กำลังเตรียมการชำระเงิน..." />
  if (error && !booking) return <ErrorState message={error} onRetry={load} />
  const expired = booking.status === 'expired' || (['holding', 'pending'].includes(booking.status) && remaining === 0)
  const conflict = booking.status === 'cancelled' && booking.cancellationReason === 'RACE_CONFLICT'
  return <section className="section container page-top"><Link className="back-link" to={`/shows/${booking.showId}/seats`}><ArrowLeft /> กลับไปเลือกที่นั่ง</Link><div className="checkout-grid"><div className="checkout-main"><div className="checkout-heading"><div><p className="eyebrow">SECURE CHECKOUT</p><h1>{booking.status === 'paid' ? 'ตั๋วของคุณพร้อมแล้ว' : 'ชำระเงินด้วย PromptPay'}</h1></div><span className={`status-pill ${expired ? 'expired' : booking.status}`}>{expired ? statusLabels.expired : statusLabels[booking.status]}</span></div>
    {conflict && <div className="conflict-panel"><XCircle /><div><h3>ที่นั่งชนกันในเวลาเดียวกัน</h3><p>มีผู้ใช้อื่นเลือกที่นั่งนี้ในเวลาเดียวกัน กรุณาเลือกที่นั่งใหม่</p></div></div>}
    {expired && <div className="conflict-panel"><Clock3 /><div><h3>หมดเวลาถือที่นั่ง</h3><p>กรุณาอย่าชำระ QR เดิม ระบบจะคืนที่นั่งตามเวลาหมดอายุ คุณสามารถกลับไปเลือกใหม่ได้</p></div></div>}
    {booking.status === 'paid' ? <div className="ticket-success"><CheckCircle2 /><h2>ชำระเงินสำเร็จ</h2><p>แสดง QR นี้แก่เจ้าหน้าที่ก่อนเข้าโรงภาพยนตร์</p>{ticketQr ? <img src={ticketQr} alt="QR ตั๋วภาพยนตร์" /> : <LoadingState label="กำลังสร้างตั๋ว..." />}<strong>{booking.seats.map((seat) => seat.seatCode).join(', ')}</strong></div> : <div className="payment-card"><img src={cedtLogo} alt="CEDT Cinema" className="payment-brand-logo" /><div className="timer-box"><span>เวลาที่เหลือ</span><strong>{String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</strong><small>เวลาจากเซิร์ฟเวอร์เป็นหลัก</small></div>{active && <>{qrError ? <div role="alert"><p className="form-error">{qrError}</p><button className="btn-secondary" onClick={() => setQrAttempt((attempt) => attempt + 1)}>ลองสร้าง QR อีกครั้ง</button></div> : qr?.bookingId === bookingId && new Date(qr.expiresAt).getTime() > now ? <><img src={qr.dataUrl} alt={`QR PromptPay ชำระเงิน ${formatCurrency(qr.amount)} THB`} className="payment-qr" /><p className="payment-target">{formatCurrency(qr.amount)} THB</p><p>สแกน QR ด้วยแอปธนาคารเพื่อชำระเงิน</p><p className="form-hint" role="status">รอตรวจสอบการชำระเงิน — การแสดงหรือสแกน QR ยังไม่ถือว่าชำระสำเร็จ</p><p className="form-hint">ระบบยังไม่รองรับการยืนยันยอดจากธนาคารอัตโนมัติ กรุณาติดต่อเจ้าหน้าที่ก่อนโอนเงิน</p></> : <LoadingState label="กำลังสร้าง QR PromptPay..." />}<button className="btn-text" onClick={cancel}>ยกเลิกและคืนที่นั่ง</button></>}<p className="payment-reference">Booking: {booking._id}</p>{debugPaymentAvailable && booking.debugPaymentEnabled && active && <div><button type="button" className="btn-secondary full" onClick={debugConfirm} disabled={debugPaying || booking.status !== 'pending'}>{debugPaying ? 'Debug: Confirming...' : 'Debug: Mark as Paid'}</button><p className="form-hint">Development only — simulates successful payment</p></div>}</div>}
  </div><aside className="order-card"><p className="eyebrow">ORDER SUMMARY</p><h2>{booking.movieSnapshot.title}</h2><div className="order-meta"><span><MapPin /> {booking.branchSnapshot.name}</span><span><Ticket /> {booking.theaterSnapshot.name} · {booking.seats.map((seat) => seat.seatCode).join(', ')}</span><span><Clock3 /> {formatDateTime(booking.showTimeSnapshot)}</span></div><div className="price-lines">{booking.seats.map((seat) => <div key={seat.seatCode}><span>{seat.seatCode} · {seat.seatType}</span><strong>{formatCurrency(seat.price)}</strong></div>)}</div><div className="summary-total"><span>ยอดสุทธิ</span><strong>{formatCurrency(booking.totalPrice)} THB</strong></div><p className="secure-note"><ShieldCheck /> ราคาคำนวณและล็อกโดยเซิร์ฟเวอร์</p>{(expired || booking.status === 'cancelled') && <button className="btn-primary full" onClick={() => navigate(`/shows/${booking.showId}/seats`)}>เลือกที่นั่งใหม่</button>}</aside></div></section>
}
