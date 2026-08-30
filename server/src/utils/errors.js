export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (message, code = 'VALIDATION_ERROR', details) => new AppError(400, code, message, details)
export const unauthorized = (message = 'กรุณาเข้าสู่ระบบ') => new AppError(401, 'UNAUTHORIZED', message)
export const forbidden = (message = 'คุณไม่มีสิทธิ์ดำเนินการนี้') => new AppError(403, 'FORBIDDEN', message)
export const notFound = (message = 'ไม่พบข้อมูล') => new AppError(404, 'NOT_FOUND', message)
export const conflict = (message, code = 'CONFLICT') => new AppError(409, code, message)
