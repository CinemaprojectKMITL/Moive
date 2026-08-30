import QRCode from 'qrcode'
import { env } from '../config/env.js'

export class PaymentQrService {
  static buildPayload(booking) {
    // REPLACE_PAYMENT_QR_GENERATOR_HERE
    return `${env.PAYMENT_QR_TARGET} ราคา ${booking.totalPrice}`
  }

  static async generate(booking) {
    const payload = this.buildPayload(booking)
    return { payload, dataUrl: await QRCode.toDataURL(payload, { margin: 1, width: 360, errorCorrectionLevel: 'M' }) }
  }
}
