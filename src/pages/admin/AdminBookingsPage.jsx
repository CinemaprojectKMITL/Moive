import { useCallback, useEffect, useRef, useState } from 'react'
import QrScanner from 'qr-scanner'
import { QrCode, Search, ShieldCheck } from 'lucide-react'
import { apiGet, apiPost } from '../../api/client'
import { AdminPageHeader } from '../../components/admin/AdminPageHeader'
import { Modal } from '../../components/admin/Modal'
import { EmptyState } from '../../components/common/EmptyState'
import { LoadingState } from '../../components/common/LoadingState'
import { useToast } from '../../contexts/ToastContext'
import { formatCurrency, formatDateTime, statusLabels } from '../../utils/format'

export function AdminBookingsPage() {
  const [data, setData] = useState(null); const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [verifyOpen, setVerifyOpen] = useState(false); const [token, setToken] = useState(''); const [verification, setVerification] = useState(null); const [busy, setBusy] = useState(false); const { show } = useToast()
  const load = useCallback(async () => { try { setData(await apiGet(`/admin/bookings?page=${page}&limit=25${status ? `&status=${status}` : ''}`)) } catch (err) { show(err.message, 'error') } }, [page, status, show])
  useEffect(() => { load() }, [load])
  const [scanning, setScanning] = useState(false)
  const [cameraPending, setCameraPending] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const videoRef = useRef(null)
  const scannerRef = useRef(null)
  const scanLockedRef = useRef(false)
  const cameraPendingRef = useRef(false)
  const verifyingRef = useRef(false)
  const mountedRef = useRef(false)
  const modalVersionRef = useRef(0)

  const stopScanner = useCallback(() => {
    const session = scannerRef.current
    scannerRef.current = null // Invalidate pending camera/decoder callbacks first.
    if (session) {
      clearTimeout(session.timer)
      session.stream?.getTracks().forEach((track) => { track.onended = null; track.stop() })
      session.video.pause()
      session.video.srcObject = null
      session.video.hidden = true
      session.engine?.terminate?.()
      session.canvas.width = session.canvas.height = 0
      session.stream = null
      session.engine = null
    }
    if (mountedRef.current) setScanning(false)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    // Release the camera when Safari backgrounds the page; restarting needs another click.
    const onHidden = () => { if (document.hidden) stopScanner() }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', stopScanner)
    return () => {
      mountedRef.current = false
      modalVersionRef.current += 1
      stopScanner()
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', stopScanner)
    }
  }, [stopScanner])

  const verifyToken = async (ticketToken) => {
    if (verifyingRef.current) return
    verifyingRef.current = true
    stopScanner()
    const version = modalVersionRef.current
    const isCurrent = () => mountedRef.current && version === modalVersionRef.current
    setBusy(true)
    try {
      const result = await apiPost('/admin/tickets/verify', { token: ticketToken, consume: false })
      if (isCurrent()) { setVerification(result); show('ตั๋วถูกต้อง') }
    } catch (err) {
      if (isCurrent()) { setVerification(null); show(err.message, 'error') }
    } finally {
      verifyingRef.current = false
      if (mountedRef.current) setBusy(false)
    }
  }
  const verify = async (event) => { event.preventDefault(); await verifyToken(token) }

  const startScanner = async () => {
    if (cameraPendingRef.current || verifyingRef.current) return
    stopScanner()
    scanLockedRef.current = false
    setScannerError('')
    if (!window.isSecureContext) {
      setScannerError('การเปิดกล้องต้องใช้ HTTPS หรือ localhost กรุณาวางโทเคนด้วยตนเอง')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerError('อุปกรณ์หรือเบราว์เซอร์นี้ไม่สามารถเปิดกล้องได้ กรุณาวางโทเคนด้วยตนเอง')
      return
    }
    const video = videoRef.current
    if (!video) return
    video.playsInline = true
    video.muted = true
    video.autoplay = true
    const session = { video, canvas: document.createElement('canvas'), stream: null, engine: null, timer: null }
    scannerRef.current = session
    const isCurrent = () => mountedRef.current && scannerRef.current === session
    const fail = (err) => {
      if (!isCurrent()) return
      stopScanner()
      const name = err?.name
      setScannerError(name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError'
        ? 'ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการเข้าถึงกล้องใน Safari หรือเบราว์เซอร์ที่ใช้งาน แล้วลองอีกครั้ง'
        : name === 'NotFoundError' || name === 'DevicesNotFoundError'
          ? 'ไม่พบกล้องบนอุปกรณ์นี้ กรุณาวางโทเคนด้วยตนเอง'
          : name === 'NotReadableError' || name === 'TrackStartError'
            ? 'กล้องอาจถูกใช้งานอยู่ กรุณาปิดแอปที่ใช้กล้องแล้วลองอีกครั้ง หรือวางโทเคนด้วยตนเอง'
            : 'ไม่สามารถเริ่มหรืออ่าน QR ด้วยกล้องได้ กรุณาลองอีกครั้ง หรือวางโทเคนด้วยตนเอง')
    }
    setScanning(true)
    cameraPendingRef.current = true
    setCameraPending(true)
    try {
      let stream
      try {
        // No await/import/device enumeration before this user-initiated permission request.
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } })
      } catch (err) {
        if (!isCurrent()) return
        if (!['OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(err?.name)) throw err
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
      } finally {
        cameraPendingRef.current = false
        if (mountedRef.current) setCameraPending(false)
      }
      // Permission may resolve after Stop, modal close, or navigation.
      if (!isCurrent()) { stream.getTracks().forEach((track) => track.stop()); return }
      session.stream = stream
      stream.getVideoTracks().forEach((track) => { track.onended = () => fail(new Error('Camera disconnected')) })
      // Safari can suspend playback of hidden video; do not depend on a React commit here.
      video.hidden = false
      video.srcObject = stream
      await video.play()
      if (!isCurrent()) return
      const engine = await QrScanner.createQrEngine()
      if (!isCurrent()) { engine.terminate?.(); return }
      session.engine = engine
      const decode = async () => {
        if (!isCurrent() || scanLockedRef.current) return
        try {
          if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
            const result = await QrScanner.scanImage(video, { qrEngine: engine, canvas: session.canvas, returnDetailedScanResult: true })
            if (!isCurrent() || scanLockedRef.current) return
            const scannedToken = typeof result.data === 'string' ? result.data.trim() : ''
            if (scannedToken) {
              scanLockedRef.current = true // Synchronous frame-level lock, reset only by an intentional new scan.
              setToken(scannedToken)
              stopScanner()
              await verifyToken(scannedToken)
              return
            }
          }
        } catch (err) {
          // An ordinary frame without a QR is expected; actual decoder failures stop the camera.
          if (err !== QrScanner.NO_QR_CODE_FOUND && err !== `Scanner error: ${QrScanner.NO_QR_CODE_FOUND}`) {
            fail(err)
            return
          }
        } finally {
          session.canvas.width = session.canvas.height = 0 // Keep no decoded frames.
        }
        if (isCurrent() && !scanLockedRef.current) session.timer = setTimeout(decode, 150)
      }
      void decode()
    } catch (err) { fail(err) }
  }

  const closeVerification = () => {
    stopScanner()
    scanLockedRef.current = false
    modalVersionRef.current += 1
    setScannerError('')
    setVerifyOpen(false)
    setVerification(null)
  }
  return <><AdminPageHeader eyebrow="BOOKING OPERATIONS" title="การจองและตรวจตั๋ว" description="ค้นหา ติดตามสถานะ และตรวจสอบตั๋วด้วยโทเคน QR" action={<button className="btn-primary" onClick={() => setVerifyOpen(true)}><QrCode /> ตรวจตั๋ว</button>} /><div className="admin-toolbar"><label><Search /> สถานะ<select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}><option value="">ทั้งหมด</option>{['holding', 'pending', 'paid', 'cancelled', 'expired'].map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label></div>{!data ? <LoadingState /> : data.items.length ? <section className="admin-card"><div className="responsive-table"><table><thead><tr><th>Booking ID</th><th>ลูกค้า</th><th>ภาพยนตร์ / รอบ</th><th>ที่นั่ง</th><th>ยอด</th><th>สถานะ</th><th>สร้างเมื่อ</th></tr></thead><tbody>{data.items.map((item) => <tr key={item._id}><td><code>{item._id.slice(-8).toUpperCase()}</code></td><td>{item.userId?.displayName || item.userId?.username || '—'}<small>{item.userId?.username}</small></td><td><strong>{item.movieSnapshot.title}</strong><small>{item.branchSnapshot.name} · {formatDateTime(item.showTimeSnapshot)}</small></td><td>{item.seats.map((seat) => seat.seatCode).join(', ')}</td><td>{formatCurrency(item.totalPrice)}</td><td><span className={`status-pill ${item.status}`}>{statusLabels[item.status]}</span></td><td>{formatDateTime(item.createdAt)}</td></tr>)}</tbody></table></div><div className="pagination"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>ก่อนหน้า</button><span>หน้า {page} / {data.pagination.pages || 1}</span><button disabled={page >= data.pagination.pages} onClick={() => setPage(page + 1)}>ถัดไป</button></div></section> : <EmptyState title="ไม่พบรายการจอง" />}
    <Modal open={verifyOpen} onClose={closeVerification} title="ตรวจสอบตั๋ว QR">
      <div className="ticket-scanner">
        <button type="button" className="btn-secondary" disabled={!scanning && (busy || cameraPending)} onClick={scanning ? stopScanner : startScanner}><QrCode /> {scanning ? 'หยุดสแกน' : 'สแกน QR ด้วยกล้อง'}</button>
        <video ref={videoRef} className="ticket-scanner-preview" hidden={!scanning} autoPlay muted playsInline disablePictureInPicture aria-label="ภาพจากกล้องสำหรับสแกนตั๋ว QR" />
        {(scanning || cameraPending) && <p className="form-hint" role="status">{cameraPending ? 'กำลังรอการอนุญาตกล้อง กรุณาตอบคำขอของเบราว์เซอร์' : 'วาง QR ตั๋วให้อยู่ในภาพ ระบบจะตรวจสอบตั๋วอัตโนมัติ'}</p>}
        {scannerError && <p className="ticket-scanner-error" role="alert">{scannerError}</p>}
      </div>
      <form className="admin-form" onSubmit={verify}><label>วางโทเคนจาก QR<textarea rows="5" value={token} onChange={(e) => setToken(e.target.value)} required placeholder="สแกนหรือวาง ticket token" /></label><button className="btn-primary full" disabled={busy}><ShieldCheck /> {busy ? 'กำลังตรวจ...' : 'ตรวจสอบตั๋ว'}</button></form>{verification && <div className="verification-result"><ShieldCheck /><div><h3>ตั๋วถูกต้อง</h3><p>{verification.ticket.bookingId.movieSnapshot?.title}</p><p>ที่นั่ง {verification.ticket.bookingId.seats?.map((seat) => seat.seatCode).join(', ')}</p></div></div>}</Modal>
  </>
}
