import QRCode from 'qrcode'
import generatePayload from 'promptpay-qr'
import { env } from '../config/env.js'
import { AppError, conflict } from '../utils/errors.js'

export class PaymentQrService {
  static buildPayload(booking) {
    const configured = env.PAYMENT_QR_TARGET
    if (typeof configured !== 'string' || !configured.trim()) {
      throw new AppError(503, 'PAYMENT_CONFIGURATION_ERROR', 'ยังไม่ได้ตั้งค่า PAYMENT_QR_TARGET กรุณาติดต่อเจ้าหน้าที่')
    }
    // Only remove formatting; do not let the library silently strip arbitrary invalid characters.
    const target = configured.replace(/[\s-]/g, '').replace(/^(?:\+66|66)([689]\d{8})$/, '0$1')
    if (!/^(?:0[689]\d{8}|\d{13}|\d{15})$/.test(target) || /^0+$/.test(target)) {
      throw new AppError(503, 'PAYMENT_CONFIGURATION_ERROR', 'PAYMENT_QR_TARGET ไม่ถูกต้อง ต้องเป็นเบอร์มือถือไทย เลขประจำตัวผู้เสียภาษี/ประชาชน หรือรหัสวอลเล็ต PromptPay')
    }
    const amount = booking.totalPrice
    const satang = Math.round(amount * 100)
    // Existing prices are numeric THB. Accept floating-point noise, never silently round a real fraction of a satang.
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(satang) || satang <= 0
      || Math.abs(amount * 100 - satang) > 0.000001 || (satang / 100).toFixed(2).length > 13) {
      throw conflict('ยอดชำระเงินของการจองไม่ถูกต้อง กรุณาติดต่อเจ้าหน้าที่', 'INVALID_PAYMENT_AMOUNT')
    }
    return generatePayload(target, { amount: satang / 100 })
  }

  static async generate(booking) {
    const payload = this.buildPayload(booking)
    try {
      const svg = await QRCode.toString(payload, { type: 'svg', margin: 4, width: 300, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      // An image data URL keeps SVG out of HTML injection paths. Never persist payloads or recipient identifiers.
      return { dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` }
    } catch {
      throw new AppError(503, 'PAYMENT_QR_FAILED', 'ไม่สามารถสร้าง QR PromptPay ได้ กรุณาลองใหม่')
    }
  }
}
