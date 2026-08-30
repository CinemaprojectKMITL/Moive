const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function createSeatLayout(rows = 15, seatsPerRow = 20) {
  return Array.from({ length: rows }, (_, rowIndex) => {
    const row = alphabet[rowIndex]
    return {
      row,
      offset: Math.abs(Math.floor(rows / 2) - rowIndex) % 3,
      seats: Array.from({ length: seatsPerRow }, (_, seatIndex) => ({
        code: `${row}${seatIndex + 1}`,
        type: rowIndex >= rows - 4 || (seatIndex >= 8 && seatIndex <= 11 && rowIndex >= 5) ? 'premium' : 'normal',
        enabled: true,
      })),
    }
  })
}

export function flattenSeatLayout(layout) {
  return layout.flatMap((row) => row.seats.filter((seat) => seat.enabled !== false))
}
