import { CinemaScreen } from './CinemaScreen'
import { SeatButton } from './SeatButton'

export function SeatMap({ layout, seats, selected, onToggle }) {
  const seatMap = new Map(seats.map((seat) => [seat.seatCode, seat]))
  return <div className="seat-map-scroll"><div className="seat-map"><CinemaScreen />{layout.map((row) => <div className="seat-row" key={row.row} style={{ paddingInline: `${row.offset * 12}px` }}><span className="row-label">{row.row}</span><div className="seat-group">{row.seats.map((layoutSeat, index) => { const seat = seatMap.get(layoutSeat.code); if (!seat) return null; return <span key={seat.seatCode} className={index === 5 || index === 15 ? 'aisle-before' : ''}><SeatButton seat={seat} selected={selected.has(seat.seatCode)} onToggle={onToggle} /></span> })}</div><span className="row-label">{row.row}</span></div>)}</div></div>
}
