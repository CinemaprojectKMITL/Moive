import { scopedApiResponse } from './requestAccess.js'

export { ApiError } from './transport.js'
export { setApiUser } from './requestAccess.js'
export const apiResponse = (path, options = {}, settings = {}) => scopedApiResponse(path, options, settings)
export const api = async (path, options = {}) => (await apiResponse(path, options)).data
export const apiGet = (path) => api(path)
export const apiPost = (path, body) => api(path, { method: 'POST', body })
export const apiPatch = (path, body) => api(path, { method: 'PATCH', body })
export const apiDelete = (path) => api(path, { method: 'DELETE' })
