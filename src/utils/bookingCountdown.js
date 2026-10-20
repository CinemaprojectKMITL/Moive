export const terminalBookingStatuses = ['paid', 'cancelled', 'expired']

export function getBookingCountdown(booking, bookingId, now) {
  const expiresAt = Date.parse(booking?.expiresAt)
  const eligible = booking?._id === bookingId && ['holding', 'pending'].includes(booking?.status) && booking?.seats?.length > 0 && Number.isFinite(expiresAt)
  const remaining = eligible ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0
  return { remaining, active: remaining > 0, expired: Boolean(eligible && expiresAt <= now) }
}

// A poll that began before cancellation must not restore the payment countdown.
export function mergeBookingSnapshot(previous, next) {
  if (previous?._id === next._id && (previous.status === 'paid' || terminalBookingStatuses.includes(previous.status) && !terminalBookingStatuses.includes(next.status))) return previous
  return next
}

export function startBookingCountdown(booking, bookingId, onTick) {
  const now = Date.now()
  onTick(now)
  if (!getBookingCountdown(booking, bookingId, now).active) return () => {}
  const timer = setInterval(() => {
    const current = Date.now()
    onTick(current)
    if (!getBookingCountdown(booking, bookingId, current).active) clearInterval(timer)
  }, 1000)
  return () => clearInterval(timer)
}
