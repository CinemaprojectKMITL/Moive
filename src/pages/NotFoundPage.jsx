import { Link } from 'react-router-dom'
export function NotFoundPage() { return <div className="state-panel full-page"><span className="error-code">404</span><h1>ไม่พบหน้าที่คุณต้องการ</h1><p>ลิงก์นี้อาจถูกย้ายหรือไม่มีอยู่แล้ว</p><Link className="btn-primary" to="/">กลับหน้าหลัก</Link></div> }
