export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

// Only the shared access layer sends raw API requests.
export async function sendApiRequest(path, options = {}, { notifyUnauthorized = true } = {}) {
  const headers = new Headers(options.headers)
  const isForm = options.body instanceof FormData
  if (options.body && !isForm) headers.set('Content-Type', 'application/json')
  const response = await fetch(path.startsWith('/api') ? path : `/api${path}`, {
    ...options,
    headers,
    credentials: 'include',
    body: options.body && !isForm && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  })
  const payload = await response.json().catch(() => ({ success: false, message: 'การตอบกลับจากเซิร์ฟเวอร์ไม่ถูกต้อง' }))
  if (!response.ok || payload.success === false) {
    if (response.status === 401 && notifyUnauthorized && !payload.code?.startsWith('API_REQUEST_ID_')) window.dispatchEvent(new CustomEvent('auth:unauthorized'))
    throw new ApiError(payload.message || payload.error || 'เกิดข้อผิดพลาด', response.status, payload.code, payload.details)
  }
  return payload
}
