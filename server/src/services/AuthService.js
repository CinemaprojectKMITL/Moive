import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { User } from '../models/User.js'
import { conflict, unauthorized } from '../utils/errors.js'
import { normalizeUsername } from '../utils/normalize.js'

const publicUser = (user) => ({ id: user._id.toString(), username: user.username, displayName: user.displayName || user.username, role: user.role })

export class AuthService {
  static async register(input) {
    const usernameNormalized = normalizeUsername(input.username)
    const exists = await User.exists({ usernameNormalized })
    if (exists) throw conflict('ชื่อผู้ใช้นี้ถูกใช้แล้ว', 'USERNAME_TAKEN')
    const passwordHash = await bcrypt.hash(input.password, 12)
    const user = await User.create({
      username: input.username.trim(),
      usernameNormalized,
      passwordHash,
      displayName: input.displayName || input.username.trim(),
    })
    return { user: publicUser(user), token: this.createToken(user) }
  }

  static async login(input) {
    const usernameNormalized = normalizeUsername(input.username)
    const user = await User.findOne({ usernameNormalized }).select('+passwordHash')
    if (!user || !user.active || !await bcrypt.compare(input.password, user.passwordHash)) {
      throw unauthorized('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    }
    return { user: publicUser(user), token: this.createToken(user) }
  }

  static createToken(user) {
    return jwt.sign({ role: user.role }, env.JWT_SECRET, { subject: user._id.toString(), expiresIn: env.JWT_EXPIRES_IN })
  }

  static publicUser(user) {
    return publicUser(user)
  }
}
