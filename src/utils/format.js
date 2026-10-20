export const formatCurrency = (value) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(value || 0)
export const formatDateTime = (value) => value ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
export const formatDate = (value) => value ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(value)) : '—'
export const formatShowDate = (value) => new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(value))
export const formatShowTime = (value) => new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date(value))
export const toLocalInput = (date = new Date()) => {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

export const statusLabels = {
  holding: 'กำลังถือที่นั่ง', pending: 'รอชำระเงิน', paid: 'ชำระแล้ว', cancelled: 'ยกเลิก', expired: 'หมดอายุ',
  scheduled: 'กำหนดแล้ว', open: 'เปิดจอง', closed: 'ปิดจอง', completed: 'จบแล้ว',
}
