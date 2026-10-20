import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export function BackLink({ to = '/', children = 'กลับหน้าภาพยนตร์' }) {
  return <Link to={to} className="back-link"><ArrowLeft aria-hidden="true" />{children}</Link>
}
