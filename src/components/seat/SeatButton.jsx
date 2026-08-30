import { Armchair } from 'lucide-react'

const labels = { available: 'ว่าง', selected: 'เลือกแล้ว', held: 'มีผู้ถือชั่วคราว', booked: 'จองแล้ว' }

export function SeatButton({ seat, selected, onToggle }) {
  const state = selected ? 'selected' : seat.status
  const disabled = !['available'].includes(seat.status)
  return <button type="button" className={`seat-button ${state} ${seat.seatType}`} onClick={() => onToggle(seat.seatCode)} disabled={disabled} aria-pressed={selected} aria-label={`Seat ${seat.seatCode}, ${labels[state]}, ${seat.seatType}`} title={`${seat.seatCode} · ${labels[state]} · ${seat.seatType}`}><Armchair size={17} aria-hidden="true" /><span>{seat.seatCode.replace(/^[A-Z]/, '')}</span></button>
}
