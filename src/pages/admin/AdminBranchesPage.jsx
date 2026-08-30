import { useCallback, useEffect, useState } from 'react'
import { Building2, Edit3, Plus, Power } from 'lucide-react'
import { apiGet, apiPatch, apiPost } from '../../api/client'
import { AdminPageHeader } from '../../components/admin/AdminPageHeader'
import { ConfirmDialog } from '../../components/admin/ConfirmDialog'
import { Modal } from '../../components/admin/Modal'
import { EmptyState } from '../../components/common/EmptyState'
import { LoadingState } from '../../components/common/LoadingState'
import { useToast } from '../../contexts/ToastContext'

const blank = { name: '', code: '', address: '', description: '', active: true }

export function AdminBranchesPage() {
  const [data, setData] = useState(null); const [editing, setEditing] = useState(null); const [form, setForm] = useState(blank); const [toggle, setToggle] = useState(null); const [busy, setBusy] = useState(false); const { show } = useToast()
  const load = useCallback(() => apiGet('/admin/branches?limit=100').then(setData).catch((err) => show(err.message, 'error')), [show])
  useEffect(() => { load() }, [load])
  const open = (branch) => { setEditing(branch || {}); setForm(branch ? { name: branch.name, code: branch.code, address: branch.address, description: branch.description || '', active: branch.active } : blank) }
  const submit = async (event) => { event.preventDefault(); setBusy(true); try { const payload = { name: form.name, code: form.code, address: form.address, description: form.description, active: form.active }; if (editing?._id) await apiPatch(`/admin/branches/${editing._id}`, payload); else await apiPost('/admin/branches', payload); show('บันทึกสาขาแล้ว'); setEditing(null); load() } catch (err) { show(err.message, 'error') } finally { setBusy(false) } }
  const doToggle = async () => { setBusy(true); try { await apiPatch(`/admin/branches/${toggle._id}`, { active: !toggle.active }); show(toggle.active ? 'ปิดสาขาแล้ว' : 'เปิดสาขาแล้ว'); setToggle(null); load() } catch (err) { show(err.message, 'error') } finally { setBusy(false) } }
  return <><AdminPageHeader eyebrow="LOCATION MANAGEMENT" title="สาขา" description="จัดการข้อมูลและสถานะการให้บริการของแต่ละสาขา" action={<button className="btn-primary" onClick={() => open()}><Plus /> เพิ่มสาขา</button>} />{!data ? <LoadingState /> : data.items.length ? <div className="admin-card-grid branches">{data.items.map((branch) => <article className="admin-branch-card" key={branch._id}><div className="admin-item-icon"><Building2 /></div><span className={`status-dot ${branch.active ? 'active' : ''}`}>{branch.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span><p className="eyebrow">{branch.code}</p><h2>{branch.name}</h2><p>{branch.address}</p><div className="card-actions"><button className="btn-secondary" onClick={() => open(branch)}><Edit3 /> แก้ไข</button><button className="icon-btn" onClick={() => setToggle(branch)} title={branch.active ? 'ปิดสาขา' : 'เปิดสาขา'}><Power /></button></div></article>)}</div> : <EmptyState title="ยังไม่มีสาขา" />}
    <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?._id ? 'แก้ไขสาขา' : 'เพิ่มสาขา'}><form className="admin-form" onSubmit={submit}><div className="form-grid"><label>ชื่อสาขา<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>รหัสสาขา<input required value={form.code} disabled={Boolean(editing?._id)} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></label><label className="span-2">ที่อยู่<input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label><label className="span-2">รายละเอียด<textarea rows="4" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><label className="check-label"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> เปิดใช้งาน</label></div><div className="form-actions"><button type="button" className="btn-secondary" onClick={() => setEditing(null)}>ยกเลิก</button><button className="btn-primary" disabled={busy}>บันทึก</button></div></form></Modal><ConfirmDialog open={Boolean(toggle)} title={toggle?.active ? 'ปิดสาขานี้?' : 'เปิดสาขานี้?'} description="ข้อมูลการจองย้อนหลังจะไม่ถูกลบ การเปลี่ยนแปลงมีผลเฉพาะการแสดงผลและการสร้างรอบใหม่" onConfirm={doToggle} onClose={() => setToggle(null)} busy={busy} />
  </>
}
