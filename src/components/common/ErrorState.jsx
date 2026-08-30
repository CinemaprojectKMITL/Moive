import { TriangleAlert } from 'lucide-react'

export function ErrorState({ message = 'โหลดข้อมูลไม่สำเร็จ', onRetry }) {
  return <div className="state-panel"><TriangleAlert size={34} className="text-red-500" /><h3>เกิดข้อผิดพลาด</h3><p>{message}</p>{onRetry && <button className="btn-secondary" onClick={onRetry}>ลองอีกครั้ง</button>}</div>
}
