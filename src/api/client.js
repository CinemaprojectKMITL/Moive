export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export async function apiResponse(path, options = {}, { notifyUnauthorized = true } = {}) {
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
    if (response.status === 401 && notifyUnauthorized) window.dispatchEvent(new CustomEvent('auth:unauthorized'))
    throw new ApiError(payload.message || payload.error || 'เกิดข้อผิดพลาด', response.status, payload.code, payload.details)
  }
  return payload
}

export const api = async (path, options = {}) => (await apiResponse(path, options)).data

export const apiGet = (path) => api(path)
export const apiPost = (path, body) => api(path, { method: 'POST', body })
export const apiPatch = (path, body) => api(path, { method: 'PATCH', body })
export const apiDelete = (path) => api(path, { method: 'DELETE' })
