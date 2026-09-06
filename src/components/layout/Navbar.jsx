import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Menu, MonitorCog, Moon, Sun, UserRound, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import cedtLogo from '../../assets/cedt-logo-full.svg'
import cedtResponsiveLogo from '../../assets/cedt-logo-responsive.svg'

const links = [
  { to: '/', label: 'ภาพยนตร์' },
  { to: '/branches', label: 'สาขา' },
  { to: '/my-bookings', label: 'การจองของฉัน' },
]

export function Navbar() {
  const [open, setOpen] = useState(false)
  const { user, logout, isAdmin } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()

  const cycleTheme = () =>
    setTheme(
      theme === 'system'
        ? 'dark'
        : theme === 'dark'
          ? 'light'
          : 'system'
    )

  const ThemeIcon =
    theme === 'system'
      ? MonitorCog
      : theme === 'dark'
        ? Moon
        : Sun

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <header className="navbar">
      <div className="container nav-inner">

        <Link to="/" className="brand" aria-label="CEDT Cinema หน้าหลัก">
          <picture>
            <source media="(max-width: 900px)" srcSet={cedtResponsiveLogo} />
            <img
              src={cedtLogo}
              alt="CEDT Cinema"
              className="brand-logo"
            />
          </picture>
        </Link>

        <nav
          className={`nav-links ${open ? 'open' : ''}`}
          aria-label="เมนูหลัก"
        >
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}

          {isAdmin && (
            <NavLink
              to="/admin"
              onClick={() => setOpen(false)}
            >
              ผู้ดูแล
            </NavLink>
          )}

          <div className="mobile-account">
            {user ? (
              <>
                <span>สวัสดี {user.displayName}</span>
                <button type="button" onClick={handleLogout}>
                  ออกจากระบบ
                </button>
              </>
            ) : (
              <Link to="/login">เข้าสู่ระบบ</Link>
            )}
          </div>
        </nav>

        <div className="nav-actions">
          <button
            className="icon-btn"
            type="button"
            onClick={cycleTheme}
            aria-label={`ธีมปัจจุบัน ${theme}`}
            title={`Theme: ${theme}`}
          >
            <ThemeIcon size={19} />
          </button>

          {user ? (
            <div className="account-menu">
              <UserRound size={18} />
              <span>{user.displayName}</span>
              <button type="button" onClick={handleLogout}>
                ออก
              </button>
            </div>
          ) : (
            <Link
              className="btn-primary compact"
              to="/login"
            >
              เข้าสู่ระบบ
            </Link>
          )}

          <button
            className="icon-btn menu-toggle"
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label="เปิดเมนู"
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
    </header>
  )
}
