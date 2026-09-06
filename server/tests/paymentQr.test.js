import { afterEach, describe, expect, it } from 'vitest'
import { PaymentQrService } from '../src/services/PaymentQrService.js'
import { env } from '../src/config/env.js'

const originalTarget = env.PAYMENT_QR_TARGET
afterEach(() => { env.PAYMENT_QR_TARGET = originalTarget })

function fields(payload) {
  const result = {}
  for (let offset = 0; offset < payload.length;) {
    const tag = payload.slice(offset, offset + 2)
    const length = Number(payload.slice(offset + 2, offset + 4))
    expect(Number.isInteger(length) && length > 0).toBe(true)
    const value = payload.slice(offset + 4, offset + 4 + length)
    expect(value.length).toBe(length)
    result[tag] = value
    offset += 4 + length
  }
  return result
}

function crc16(payload) {
  let crc = 0xffff
  for (const char of payload) {
    crc ^= char.charCodeAt(0) << 8
    for (let bit = 0; bit < 8; bit++) crc = ((crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

describe('PromptPay EMV payload validation', () => {
  // Synthetic routing fixtures; no payment is sent or real recipient configured by these tests.
  it.each([
    ['080-000-0000', '01', '0066800000000'],
    ['+66 80 000 0000', '01', '0066800000000'],
    ['0-0000-00000-00-1', '02', '0000000000001'],
    ['000000000000001', '03', '000000000000001'],
  ])('normalizes supported target formats and generates valid EMV/CRC (%s)', (target, type, normalized) => {
    env.PAYMENT_QR_TARGET = target
    const payload = PaymentQrService.buildPayload({ totalPrice: 420.25 })
    const emv = fields(payload)
    expect(emv).toMatchObject({ '00': '01', '01': '12', '53': '764', '54': '420.25', '58': 'TH' })
    expect(fields(emv['29'])).toEqual({ '00': 'A000000677010111', [type]: normalized })
    expect(emv['63']).toBe(crc16(payload.slice(0, -4)))
  })

  it.each([0, -1, NaN, Infinity, '420', null, 0.001, 1.234, Number.MAX_SAFE_INTEGER])('rejects an invalid amount (%s)', (totalPrice) => {
    env.PAYMENT_QR_TARGET = '000000000000001'
    expect(() => PaymentQrService.buildPayload({ totalPrice })).toThrow(expect.objectContaining({ code: 'INVALID_PAYMENT_AMOUNT' }))
  })

  it('handles binary floating-point noise without changing the payable satang', () => {
    env.PAYMENT_QR_TARGET = '000000000000001'
    expect(fields(PaymentQrService.buildPayload({ totalPrice: 0.1 + 0.2 }))['54']).toBe('0.30')
  })

  it.each(['abc0800000000', '12345678901234', '0000000000'])('rejects invalid routing configuration (%s)', (target) => {
    env.PAYMENT_QR_TARGET = target
    expect(() => PaymentQrService.buildPayload({ totalPrice: 420 })).toThrow(expect.objectContaining({ code: 'PAYMENT_CONFIGURATION_ERROR' }))
  })
})
