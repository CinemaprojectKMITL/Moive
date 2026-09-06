import { useState } from 'react'
import { BarChart3, Building2, CalendarClock, ChevronLeft, Film, Images, LayoutDashboard, Menu, PanelLeftClose, Popcorn, ReceiptText, X } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import cedtResponsiveLogo from '../assets/cedt-logo-responsive.svg'
import cedtIcon from '../assets/cedt-logo-icon.svg'

const nav = [
  ['/admin/dashboard', 'ภาพรวม & POS', LayoutDashboard], ['/admin/movies', 'ภาพยนตร์', Film], ['/admin/branches', 'สาขา', Building2],
  ['/admin/theaters', 'โรงภาพยนตร์', Popcorn], ['/admin/shows', 'รอบฉาย & ราคา', CalendarClock], ['/admin/bookings', 'การจอง & ตั๋ว', ReceiptText],
  ['/admin/banners', 'แบนเนอร์', Images],
]

export function AdminLayout() {
  const [open, setOpen] = useState(false); const [collapsed, setCollapsed] = useState(false)
  return <div className={`admin-shell ${collapsed ? 'collapsed' : ''}`}><aside className={`admin-sidebar ${open ? 'open' : ''}`}><div className="admin-brand"><Link to="/admin" aria-label="CEDT Cinema ผู้ดูแลระบบ"><img className="admin-brand-icon" src={cedtIcon} alt="" /><div><img className="admin-brand-logo" src={cedtResponsiveLogo} alt="CEDT Cinema" /><small>ADMIN CONSOLE</small></div></Link><button className="icon-btn mobile-only" onClick={() => setOpen(false)}><X /></button></div><nav>{nav.map(([to, label, Icon]) => <NavLink key={to} to={to} onClick={() => setOpen(false)} title={label}><Icon /><span>{label}</span></NavLink>)}</nav><div className="admin-side-footer"><Link to="/"><ChevronLeft /> <span>กลับเว็บไซต์</span></Link><button onClick={() => setCollapsed(!collapsed)}><PanelLeftClose /><span>ย่อเมนู</span></button></div></aside>{open && <button className="sidebar-backdrop" aria-label="ปิดเมนู" onClick={() => setOpen(false)} />}<div className="admin-main"><header className="admin-topbar"><button className="icon-btn mobile-only" onClick={() => setOpen(true)}><Menu /></button><div><BarChart3 /><span>ศูนย์ปฏิบัติการโรงภาพยนตร์</span></div><Link to="/">ดูเว็บไซต์</Link></header><main className="admin-content"><Outlet /></main></div></div>
}
