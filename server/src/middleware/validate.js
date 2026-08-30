import { badRequest } from '../utils/errors.js'

export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source])
  if (!result.success) {
    return next(badRequest('ข้อมูลไม่ถูกต้อง', 'VALIDATION_ERROR', result.error.flatten()))
  }
  req[source] = result.data
  return next()
}
