import { isProduction } from '../config/env.js'
import { AuthService } from '../services/AuthService.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
}

export const register = asyncHandler(async (req, res) => {
  const result = await AuthService.register(req.body)
  res.cookie('cinema_session', result.token, cookieOptions)
  sendSuccess(res, { user: result.user }, 201)
})

export const login = asyncHandler(async (req, res) => {
  const result = await AuthService.login(req.body)
  res.cookie('cinema_session', result.token, cookieOptions)
  sendSuccess(res, { user: result.user })
})

export const logout = (_req, res) => {
  res.clearCookie('cinema_session', { ...cookieOptions, maxAge: undefined })
  sendSuccess(res, { message: 'ออกจากระบบแล้ว' })
}

export const me = (req, res) => sendSuccess(res, { user: AuthService.publicUser(req.user) })
