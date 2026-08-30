import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
  usernameNormalized: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  displayName: { type: String, trim: true, maxlength: 100 },
  role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },
  active: { type: Boolean, default: true },
}, { timestamps: true })

export const User = mongoose.model('User', userSchema)
