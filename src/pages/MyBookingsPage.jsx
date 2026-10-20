import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock3, MapPin, QrCode, Ticket, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/common/LoadingState';
import { BackLink } from '../components/common/BackLink';
import { formatCurrency, formatDateTime, statusLabels } from '../utils/format';

export function MyBookingsPage() {
  const [data, setData] = useState(null), [error, setError] = useState(''), [qrs, setQrs] = useState({}), [selectedTicket, setSelectedTicket] = useState(null);
  const load = useCallback(async () => { try { setData(await apiGet('/bookings/me')); setError(''); } catch (err) { setError(err.message); } }, []);
  useEffect(() => { load(); }, [load]);

  const handleShowQr = async (b) => {
    setSelectedTicket(b);
    if (!qrs[b._id]) {
      try { const res = await apiGet(`/bookings/${b._id}/ticket-qr`); setQrs((c) => ({ ...c, [b._id]: res.dataUrl })); } 
      catch (err) { console.error("Failed to load QR code", err); }
    }
  };
  const closeModal = () => setSelectedTicket(null);

  if (!data && !error) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (<section className="section container page-top"><BackLink /><div className="page-title"><p className="eyebrow">MY BOOKINGS</p><h1>การจองของฉัน</h1><p>ประวัติการจองและตั๋วภาพยนตร์ทั้งหมดอยู่ที่นี่</p></div>{data.items.length ? (<div className="booking-list">{data.items.map((b) => (<article className="booking-card" key={b._id}><div className="booking-main"><div className="booking-title"><div><p className="eyebrow">BOOKING · {b._id.slice(-8).toUpperCase()}</p><h2>{b.movieSnapshot.title}</h2></div><span className={`status-pill ${b.status}`}>{statusLabels[b.status]}</span></div><div className="booking-meta"><span><MapPin size={16}/> {b.branchSnapshot.name} · {b.theaterSnapshot.name}</span><span><Clock3 size={16}/> {formatDateTime(b.showTimeSnapshot)}</span><span><Ticket size={16}/> ที่นั่ง {b.seats.map((s) => s.seatCode).join(', ')}</span></div><div className="booking-bottom"><strong>{formatCurrency(b.totalPrice)}</strong>{['holding', 'pending'].includes(b.status) && <Link className="btn-primary compact" to={`/checkout/${b._id}`}>ชำระเงินต่อ</Link>}{b.status === 'paid' && <button className="btn-secondary" onClick={() => handleShowQr(b)}><QrCode size={17} /> แสดงตั๋ว QR</button>}</div></div></article>))}</div>) : <EmptyState title="ยังไม่มีการจอง" description="เลือกภาพยนตร์เรื่องโปรด แล้วเริ่มจองที่นั่งแรกของคุณ" action={<Link className="btn-primary" to="/">ดูภาพยนตร์</Link>} />}{selectedTicket && createPortal(<div className="ticket-modal-overlay" onClick={closeModal}><div className="ticket-modal-content" onClick={(e) => e.stopPropagation()}><div className="ticket-modal-header"><h3>รายละเอียดตั๋ว</h3><button className="close-btn" onClick={closeModal}><X size={20} color="#ef4444" /></button></div><div className="ticket-modal-body">{qrs[selectedTicket._id] ? <div className="qr-container"><img src={qrs[selectedTicket._id]} alt="QR ตั๋ว" className="qr-image" /></div> : <div className="qr-loading">กำลังโหลด QR...</div>}<div className="ticket-info-wrapper"><div className="ticket-details-text"><h4>{selectedTicket.movieSnapshot.title.toUpperCase()}</h4><p>รหัสการจอง: {selectedTicket._id.slice(-8).toUpperCase()}</p><p>โรงภาพยนตร์: {selectedTicket.theaterSnapshot.name}</p><p>ที่นั่ง: {selectedTicket.seats.map(s => s.seatCode).join(', ')}</p><p>วันและเวลา: {formatDateTime(selectedTicket.showTimeSnapshot)}</p><p>ราคา: {formatCurrency(selectedTicket.totalPrice)}</p></div></div></div><div className="ticket-modal-footer"><p>สแกนรหัส QR นี้ที่ทางเข้าโรงภาพยนตร์เพื่อเข้าชม</p></div></div></div>, document.body)}</section>);
}