import { Link } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import { formatCurrency, formatShowDate, formatShowTime } from '../../utils/format'
import { PaginatedList } from './PaginatedList'

export function ShowtimeList({ shows }) {
  return <PaginatedList items={shows} pageSize={12} label="รอบฉาย">{(visibleShows) => <div className="showtime-list">
    {visibleShows.map((show) => <Link className="showtime-button" key={show._id} to={`/shows/${show._id}/seats`}>
      <span className="showtime-date"><CalendarDays size={13} aria-hidden="true" /><time dateTime={show.startsAt}>{formatShowDate(show.startsAt)}</time></span>
      <strong>{formatShowTime(show.startsAt)} น.</strong>
      <span>{show.theaterId.name}</span>
      <small>เริ่ม {formatCurrency(show.pricing.normal)}</small>
    </Link>)}
  </div>}</PaginatedList>
}
