import { describe, expect, it } from 'vitest'
import {
  formatPaymentApprovalDestinationLabel,
  paymentApprovalSourcePresentation,
} from './payment-approval-presentation'

describe('payment approval presentation', () => {
  it('shows only the bank and account for bank-transfer destinations', () => {
    expect(formatPaymentApprovalDestinationLabel(
      'เงินโอน (Bank Transfer) / ธนาคารกสิกรไทย / 123-456-7890',
    )).toBe('ธนาคารกสิกรไทย / 123-456-7890')
  })

  it.each([
    ['เงินสด (Cash)', 'เงินสด (Cash)'],
    ['เช็ค / ธนาคารกรุงไทย / 987-654-3210', 'เช็ค / ธนาคารกรุงไทย / 987-654-3210'],
    ['เงินโอน (Bank Transfer)', 'เงินโอน (Bank Transfer)'],
  ])('keeps a meaningful non-prefixed destination label: %s', (label, expected) => {
    expect(formatPaymentApprovalDestinationLabel(label)).toBe(expected)
  })

  it('keeps the ADV document number without duplicate type labels', () => {
    expect(paymentApprovalSourcePresentation({
      sourceDocNo: 'ADV012607-0001',
      sourceLabel: 'ADV',
      sourceType: 'advance_payment',
    })).toEqual({
      desktopSublabel: '',
      mobileReference: 'ADV012607-0001',
    })
  })

  it('keeps the source type context for purchase bills', () => {
    expect(paymentApprovalSourcePresentation({
      sourceDocNo: 'PB012607-0001',
      sourceLabel: 'บิลซื้อ',
      sourceType: 'purchase_bill',
    })).toEqual({
      desktopSublabel: 'บิลซื้อ',
      mobileReference: 'PB012607-0001 (บิลซื้อ)',
    })
  })
})
