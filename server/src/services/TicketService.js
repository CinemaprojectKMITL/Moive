import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import QRCode from 'qrcode'
import { env } from '../config/env.js'
import { Ticket } from '../models/Ticket.js'
import { badRequest, conflict, notFound } from '../utils/errors.js'

const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex')

export class TicketService {
  static createToken(ticket) {
    return jwt.sign({ ticketId: ticket._id.toString(), bookingId: ticket.bookingId.toString(), showId: ticket.showId.toString(), issuedAt: ticket.issuedAt.toISOString() }, env.JWT_SECRET, { noTimestamp: true })
  }

  static async qrForTicket(ticket) {
    // REPLACE_TICKET_QR_GENERATOR_HERE
    const token = this.createToken(ticket)
    return { token, dataUrl: await QRCode.toDataURL(token, { margin: 1, width: 360, errorCorrectionLevel: 'Q' }) }
  }

  static async verify(rawToken, consume = false) {
    let payload
    try {
      payload = jwt.verify(rawToken, env.JWT_SECRET)
    } catch {
      throw badRequest('ตั๋ว QR ไม่ถูกต้อง', 'INVALID_TICKET')
    }
    const ticket = await Ticket.findOne({ _id: payload.ticketId, tokenHash: tokenHash(rawToken) }).populate('bookingId').lean()
    if (!ticket) throw notFound('ไม่พบตั๋ว')
    if (ticket.status === 'cancelled') throw conflict('ตั๋วถูกยกเลิกแล้ว', 'TICKET_CANCELLED')
    if (ticket.status === 'used') throw conflict('ตั๋วถูกใช้งานแล้ว', 'TICKET_USED')
    if (consume) await Ticket.updateOne({ _id: ticket._id, status: 'valid' }, { $set: { status: 'used', usedAt: new Date() } })
    return { valid: true, ticket: { ...ticket, status: consume ? 'used' : ticket.status } }
  }

  static hash(token) {
    return tokenHash(token)
  }
}
