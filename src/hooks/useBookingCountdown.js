import { useEffect, useState } from 'react'
import { getBookingCountdown, startBookingCountdown } from '../utils/bookingCountdown'

export function useBookingCountdown(booking, bookingId) {
  const [now, setNow] = useState(() => Date.now())
  const id = booking?._id
  const status = booking?.status
  const expiresAt = booking?.expiresAt
  const seatCount = booking?.seats?.length || 0
  useEffect(() => startBookingCountdown({ _id: id, status, expiresAt, seats: { length: seatCount } }, bookingId, setNow), [id, status, expiresAt, seatCount, bookingId])
  return { ...getBookingCountdown(booking, bookingId, Math.max(now, Date.now())), now }
}
