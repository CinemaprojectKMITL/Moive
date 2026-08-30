import { Film } from 'lucide-react'

export function EmptyState({ title = 'ยังไม่มีข้อมูล', description = 'กลับมาตรวจสอบอีกครั้งในภายหลัง', action }) {
  return <div className="state-panel"><Film size={34} className="text-amber-500" /><h3>{title}</h3><p>{description}</p>{action}</div>
}
