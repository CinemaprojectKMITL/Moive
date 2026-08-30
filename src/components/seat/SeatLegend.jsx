const items = [['available', 'ว่าง'], ['selected', 'เลือกแล้ว'], ['held', 'ถือชั่วคราว'], ['booked', 'จองแล้ว'], ['premium', 'Premium']]
export function SeatLegend() { return <div className="seat-legend" aria-label="คำอธิบายสถานะที่นั่ง">{items.map(([state, label]) => <span key={state}><i className={state} /> {label}</span>)}</div> }
