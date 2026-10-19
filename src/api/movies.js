import { ApiError } from './transport.js'
import { scopedApiResponse } from './requestAccess.js'

export function getMovie(movieId, userId) {
  if (!userId) return Promise.reject(new ApiError('กรุณาเข้าสู่ระบบ', 401, 'UNAUTHORIZED'))
  return scopedApiResponse(`/movies/${encodeURIComponent(movieId)}`, {}, {}, { movieId, userId }).then((response) => response.data)
}
