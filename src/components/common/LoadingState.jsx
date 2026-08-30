import { LoaderCircle } from 'lucide-react'

export function LoadingState({ label = 'กำลังโหลดข้อมูล...' }) {
  return <div className="state-panel" role="status"><LoaderCircle className="animate-spin text-red-600" size={30} /><p>{label}</p></div>
}
