import { useId, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { paginateItems } from '../../utils/pagination'

export function PaginatedList({ items, pageSize = 10, label, children }) {
  const [requestedPage, setPage] = useState(1)
  const contentId = useId()
  const content = useRef(null)
  const { items: visibleItems, total, pages, page, offset } = paginateItems(items, requestedPage, pageSize)
  const changePage = (next) => {
    setPage(next)
    content.current?.focus({ preventScroll: true })
    content.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return <div className="paginated-list">
    <div id={contentId} ref={content} tabIndex={-1} className="paginated-content" aria-label={label}>{children(visibleItems, offset)}</div>
    {pages > 1 && <nav className="catalog-pagination" aria-label={`เปลี่ยนหน้า${label}`}>
      <p aria-live="polite">แสดง {offset + 1}–{offset + visibleItems.length} จาก {total} รายการ</p>
      <div><button type="button" disabled={page === 1} onClick={() => changePage(page - 1)} aria-controls={contentId}><ChevronLeft size={16} aria-hidden="true" />ก่อนหน้า</button><span>หน้า {page} / {pages}</span><button type="button" disabled={page === pages} onClick={() => changePage(page + 1)} aria-controls={contentId}>ถัดไป<ChevronRight size={16} aria-hidden="true" /></button></div>
    </nav>}
  </div>
}
