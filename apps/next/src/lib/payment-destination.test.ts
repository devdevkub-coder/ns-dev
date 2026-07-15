import { describe, expect, it } from 'vitest'
import {
  assertCompatiblePaymentDestinations,
  assertCompatiblePaymentRecipients,
  assertPaymentRecipientMatchesSource,
  assertPaymentVoucherCreateOnly,
  assertPaymentVoucherServerGeneratedDocNo,
  canonicalizePaymentRecipientForSource,
  normalizePaymentMethod,
} from './payment-destination'

describe('payment voucher validation', () => {
  it('rejects attempts to edit an existing PMT snapshot', () => {
    expect(() => assertPaymentVoucherCreateOnly('PMT012607-0001'))
      .toThrow('ประวัติ PMT เป็นข้อมูลอ่านอย่างเดียว หากต้องการเปลี่ยนรายการให้ยกเลิกแล้วทำจ่ายใหม่')
  })

  it('rejects PMAs whose destination account snapshots differ', () => {
    expect(() => assertCompatiblePaymentDestinations([
      { accountNo: '123-456-7890', bankName: 'ธนาคารกรุงไทย', paymentMethod: 'เงินโอน' },
      { accountNo: '123-456-7891', bankName: 'ธนาคารกรุงไทย', paymentMethod: 'เงินโอน' },
    ], 'เงินโอน', 'bank')).toThrow('Payment Voucher เดียวกันต้องเลือก PMA ที่มีธนาคารและเลขบัญชีปลายทางเดียวกัน')
  })

  it('accepts the same destination after normalizing whitespace, case, and account separators', () => {
    expect(() => assertCompatiblePaymentDestinations([
      { accountNo: '123-456-7890', bankName: 'SCB Bank', paymentMethod: 'Bank Transfer' },
      { accountNo: '123 456 7890', bankName: '  scb   bank  ', paymentMethod: '  bank   transfer ' },
    ], 'BANK TRANSFER', 'bank')).not.toThrow()
  })

  it('accepts blank bank and account snapshots for cash PMAs', () => {
    expect(() => assertCompatiblePaymentDestinations([
      { accountNo: null, bankName: null, paymentMethod: 'เงินสด' },
      { accountNo: ' ', bankName: '', paymentMethod: ' เงินสด ' },
    ], 'เงินสด', 'cash')).not.toThrow()
  })

  it('normalizes the legacy transfer method alias', () => {
    expect(normalizePaymentMethod(' โอนเงิน ')).toBe('เงินโอน')
    expect(() => assertCompatiblePaymentDestinations([
      { accountNo: '123-456-7890', bankName: 'ธนาคารกรุงไทย', paymentMethod: 'โอนเงิน' },
      { accountNo: '123 456 7890', bankName: 'ธนาคารกรุงไทย', paymentMethod: 'เงินโอน' },
    ], 'เงินโอน', 'bank')).not.toThrow()
  })

  it('rejects a bank PMA without a bank and digit-only account snapshot', () => {
    expect(() => assertCompatiblePaymentDestinations([
      { accountNo: null, bankName: null, paymentMethod: 'เงินโอน' },
    ], 'เงินโอน', 'bank')).toThrow('PMA ช่องทางโอนเงินต้องมีธนาคารและเลขบัญชีตัวเลขที่อนุมัติไว้')
    expect(() => assertCompatiblePaymentDestinations([
      { accountNo: 'ABC-123', bankName: 'ธนาคารกรุงไทย', paymentMethod: 'เงินโอน' },
    ], 'เงินโอน', 'bank')).toThrow('PMA ช่องทางโอนเงินต้องมีธนาคารและเลขบัญชีตัวเลขที่อนุมัติไว้')
  })

  it('rejects PMAs whose recipient snapshot IDs differ', () => {
    expect(() => assertCompatiblePaymentRecipients([
      { partyId: 'SUP-001', partyName: 'บริษัท เอ จำกัด' },
      { partyId: 'SUP-002', partyName: 'บริษัท เอ จำกัด' },
    ])).toThrow('Payment Voucher เดียวกันต้องเลือก PMA ของผู้รับเงินเดียวกัน')
  })

  it('accepts a normalized recipient name when a legacy PMA has no party ID', () => {
    expect(() => assertCompatiblePaymentRecipients([
      { partyId: 'SUP-001', partyName: 'SCB Supplier' },
      { partyId: null, partyName: '  scb   supplier ' },
    ])).not.toThrow()
  })

  it('accepts canonical source recipients from different source types for the same supplier code', () => {
    expect(() => assertCompatiblePaymentRecipients([
      { partyId: 'SUP-001', partyName: 'Supplier from PB' },
      { partyId: 'SUP-001', partyName: 'Supplier from EXP' },
    ])).not.toThrow()
  })

  it('rejects a PMA recipient A paired with source recipient B even when names match', () => {
    expect(() => assertPaymentRecipientMatchesSource(
      { partyId: 'SUP-A', partyName: 'Supplier Same Name' },
      { partyId: 'SUP-B', partyName: 'Supplier Same Name' },
    )).toThrow('ผู้รับเงินใน PMA ไม่ตรงกับผู้รับเงินของเอกสารต้นทาง')
  })

  it('falls back to normalized names for a legacy PMA without a recipient code', () => {
    expect(() => assertPaymentRecipientMatchesSource(
      { partyId: null, partyName: '  Legacy   Supplier ' },
      { partyId: 'SUP-001', partyName: 'legacy supplier' },
    )).not.toThrow()
  })

  it('rejects a client-supplied PMT document number', () => {
    expect(() => assertPaymentVoucherServerGeneratedDocNo('PMT012607-9999'))
      .toThrow('เลขที่ PMT ต้องออกโดยระบบเท่านั้น')
    expect(() => assertPaymentVoucherServerGeneratedDocNo(null)).not.toThrow()
  })

  it('canonicalizes a matching legacy numeric supplier ID to its supplier code', () => {
    const canonicalRecipient = canonicalizePaymentRecipientForSource(
      { partyId: '42', partyName: 'Supplier A' },
      { legacyPartyId: '42', partyId: 'SUP-001', partyName: 'Supplier A' },
    )

    expect(canonicalRecipient.partyId).toBe('SUP-001')
    expect(() => assertPaymentRecipientMatchesSource(canonicalRecipient, {
      partyId: 'SUP-001',
      partyName: 'Supplier A',
    })).not.toThrow()
    expect(() => assertCompatiblePaymentRecipients([
      canonicalRecipient,
      { partyId: 'SUP-001', partyName: 'Supplier A' },
    ])).not.toThrow()
  })

  it('keeps a different legacy numeric supplier ID invalid', () => {
    const canonicalRecipient = canonicalizePaymentRecipientForSource(
      { partyId: '43', partyName: 'Supplier A' },
      { legacyPartyId: '42', partyId: 'SUP-001', partyName: 'Supplier A' },
    )

    expect(() => assertPaymentRecipientMatchesSource(canonicalRecipient, {
      partyId: 'SUP-001',
      partyName: 'Supplier A',
    })).toThrow('ผู้รับเงินใน PMA ไม่ตรงกับผู้รับเงินของเอกสารต้นทาง')
  })
})
