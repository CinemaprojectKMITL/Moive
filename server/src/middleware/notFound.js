import { notFound } from '../utils/errors.js'

export const notFoundHandler = (req, _res, next) => next(notFound(`ไม่พบเส้นทาง ${req.method} ${req.originalUrl}`))
