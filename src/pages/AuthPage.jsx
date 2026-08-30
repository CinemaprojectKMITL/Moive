import { useState } from 'react'
import { Film, LockKeyhole, UserRound } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'

export function AuthPage({ mode }) {
  const isRegister = mode === 'register'
  const [form, setForm] = useState({ username: '', password: '', displayName: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const { login, register } = useAuth()
  const { show } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const submit = async (event) => {
    event.preventDefault(); setSubmitting(true); setError('')
    try {
      if (isRegister) await register(form); else await login({ username: form.username, password: form.password })
      show(isRegister ? 'สร้างบัญชีเรียบร้อย' : 'เข้าสู่ระบบสำเร็จ')
      navigate(location.state?.from?.pathname || '/')
    } catch (err) { setError(err.message); show(err.message, 'error') } finally { setSubmitting(false) }
  }
  return <div className="auth-page"><div className="auth-visual"><div><Film size={42} /><p className="eyebrow">VISE MEMBERSHIP</p><h1>เรื่องราวดี ๆ<br />เริ่มจากที่นั่งของคุณ</h1><p>จองง่าย ปลอดภัย และเก็บทุกตั๋วไว้ในที่เดียว</p></div></div><div className="auth-form-wrap"><form className="auth-form" onSubmit={submit}><p className="eyebrow">{isRegister ? 'CREATE ACCOUNT' : 'WELCOME BACK'}</p><h2>{isRegister ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</h2><p className="muted">{isRegister ? 'เริ่มต้นประสบการณ์ชมภาพยนตร์ของคุณ' : 'จัดการการจองและตั๋วของคุณ'}</p>
    {error && <div className="form-error" role="alert">{error}</div>}
    {isRegister && <label>ชื่อที่แสดง (ไม่บังคับ)<span className="input-wrap"><UserRound size={18} /><input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="ชื่อของคุณ" autoComplete="name" /></span></label>}
    <label>ชื่อผู้ใช้<span className="input-wrap"><UserRound size={18} /><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required minLength={3} autoComplete="username" placeholder="username" /></span></label>
    <label>รหัสผ่าน<span className="input-wrap"><LockKeyhole size={18} /><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={isRegister ? 8 : 1} autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder={isRegister ? 'อย่างน้อย 8 ตัวอักษร' : '••••••••'} /></span></label>
    <button className="btn-primary full" disabled={submitting}>{submitting ? 'กำลังดำเนินการ...' : isRegister ? 'สร้างบัญชี' : 'เข้าสู่ระบบ'}</button><p className="auth-switch">{isRegister ? 'มีบัญชีแล้ว?' : 'ยังไม่มีบัญชี?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}</Link></p></form></div></div>
}
