import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { env } from '../config/env.js'
import { badRequest } from '../utils/errors.js'

const mimeExtensions = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

const mediaRoot = path.resolve(process.cwd(), env.MIGDATA_ROOT)

export function imageUpload(folderResolver) {
  const storage = multer.diskStorage({
    destination(req, _file, callback) {
      const relativeFolder = folderResolver(req).replace(/[^a-zA-Z0-9/_-]/g, '')
      const destination = path.resolve(mediaRoot, relativeFolder)
      if (!destination.startsWith(`${mediaRoot}${path.sep}`)) return callback(badRequest('ตำแหน่งไฟล์ไม่ถูกต้อง'))
      fs.mkdirSync(destination, { recursive: true })
      return callback(null, destination)
    },
    filename(_req, file, callback) {
      const extension = mimeExtensions[file.mimetype]
      if (!extension) return callback(badRequest('รองรับเฉพาะไฟล์ JPG, PNG และ WEBP', 'INVALID_FILE_TYPE'))
      return callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`)
    },
  })
  return multer({
    storage,
    limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
    fileFilter(_req, file, callback) {
      if (!mimeExtensions[file.mimetype]) return callback(badRequest('รองรับเฉพาะไฟล์ JPG, PNG และ WEBP', 'INVALID_FILE_TYPE'))
      return callback(null, true)
    },
  }).single('image')
}

export function publicMediaPath(absolutePath) {
  const relative = path.relative(mediaRoot, absolutePath).split(path.sep).join('/')
  if (relative.startsWith('..')) throw badRequest('ตำแหน่งไฟล์ไม่ถูกต้อง')
  return `/media/${relative}`
}
