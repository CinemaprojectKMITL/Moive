import { Link } from 'react-router-dom'
import cedtLogo from '../../assets/cedt-logo-full.svg'

export function Footer() {
  return <footer className="footer"><div className="container footer-inner"><div><Link to="/" aria-label="CEDT Cinema หน้าหลัก"><img className="footer-brand-logo" src={cedtLogo} alt="CEDT Cinema" /></Link><p>ช่วงเวลาที่ใช่ ที่นั่งที่ชอบ</p></div><p>ระบบจองภาพยนตร์ · PromptPay QR</p></div></footer>
}
