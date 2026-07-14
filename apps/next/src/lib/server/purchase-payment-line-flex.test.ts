import { describe, expect, it } from 'vitest'
import {
  buildPurchasePaymentLineFlexMessage,
  type PurchasePaymentLineFlexData,
} from './purchase-payment-line-flex'

function payment(overrides: Partial<PurchasePaymentLineFlexData> = {}): PurchasePaymentLineFlexData {
  return {
    approvals: [{
      amount: 1_000,
      approvalNo: 'PMA012607-0001',
      sourceDocumentNo: 'PB012607-0001',
      sourceType: 'purchase_bill',
    }],
    branchName: 'สำนักงานใหญ่',
    companyAccounts: [{ accountCode: 'BANK-SCB', accountName: 'บัญชีธนาคารหลัก', amount: 1_025 }],
    date: '2026-07-13',
    destinationAccountNo: '123-456-7890',
    destinationBankName: 'ธนาคารกสิกรไทย',
    discount: 50,
    documentNo: 'PMT012607-0001',
    fee: 25,
    netCashOut: 1_025,
    notes: 'ชำระตามรอบ',
    paidAmount: 1_000,
    payeeName: 'บริษัท ซัพพลายเออร์ จำกัด',
    paymentMethod: 'เงินโอน',
    status: 'active',
    withholdingTax: 0,
    ...overrides,
  }
}

describe('buildPurchasePaymentLineFlexMessage', () => {
  it('builds an aggregate PMT card with payment, destination, amount, and source details', () => {
    const message = buildPurchasePaymentLineFlexMessage(
      payment(),
      'https://erp.example.com/purchase/payments?tab=history&docNo=PMT012607-0001',
    )
    const serialized = JSON.stringify(message)

    expect(message.contents.size).toBe('mega')
    expect(message.contents.body.contents[0]).toMatchObject({
      contents: [
        { flex: 3, wrap: true },
        { flex: 4, wrap: true },
      ],
      layout: 'horizontal',
      type: 'box',
    })
    expect(message.contents.header.backgroundColor).toBe('#0f172a')
    expect(serialized).toContain('ใบจ่ายเงิน Supplier')
    expect(serialized).toContain('PMT012607-0001')
    expect(serialized).toContain('สำนักงานใหญ่')
    expect(serialized).toContain('บริษัท ซัพพลายเออร์ จำกัด')
    expect(serialized).toContain('เงินโอน')
    expect(serialized).toContain('ธนาคารกสิกรไทย')
    expect(serialized).toContain('PMA012607-0001')
    expect(serialized).toContain('PB012607-0001')
    expect(serialized).toContain('BANK-SCB - บัญชีธนาคารหลัก')
    expect(serialized).toContain('เงินออกสุทธิ')
    expect(serialized).toContain('฿1,025')
    expect(serialized).toContain('ชำระตามรอบ')
    expect(serialized).toContain('เสร็จสิ้น')
    expect(serialized).toContain('https://erp.example.com/purchase/payments?tab=history&docNo=PMT012607-0001')
  })

  it('caps PMA and company-account rows and reports each remaining count', () => {
    const input = payment({
      approvals: Array.from({ length: 6 }, (_, index) => ({
        amount: 100 + index,
        approvalNo: `PMA-${index + 1}`,
        sourceDocumentNo: `PB-${index + 1}`,
        sourceType: 'purchase_bill',
      })),
      companyAccounts: Array.from({ length: 6 }, (_, index) => ({
        accountCode: `BANK-${index + 1}`,
        accountName: `บัญชี ${index + 1}`,
        amount: 100 + index,
      })),
    })

    const serialized = JSON.stringify(buildPurchasePaymentLineFlexMessage(input, 'https://erp.example.com/purchase/payments'))

    expect(serialized).toContain('PMA-4')
    expect(serialized).not.toContain('PMA-5')
    expect(serialized).toContain('+ อีก 2 PMA')
    expect(serialized).toContain('BANK-4')
    expect(serialized).not.toContain('BANK-5')
    expect(serialized).toContain('+ อีก 2 บัญชี')
    expect(serialized).not.toContain('"text":""')
  })

  it('masks account numbers, normalizes unsafe text, and ignores unrelated sensitive fields', () => {
    const input = {
      ...payment({
        notes: '  รอบเช้า\u0000  ตรวจแล้ว  ',
        payeeName: '  บริษัท "เอ"   จำกัด  ',
        status: 'cancelled',
      }),
      accessToken: 'secret-token',
      internalId: '987654321',
      taxId: '0123456789012',
    }

    const serialized = JSON.stringify(buildPurchasePaymentLineFlexMessage(input, 'https://erp.example.com/purchase/payments'))

    expect(serialized).toContain('•••• 7890')
    expect(serialized).not.toContain('123-456-7890')
    expect(serialized).not.toContain('1234567890')
    expect(serialized).toContain('บริษัท \\"เอ\\" จำกัด')
    expect(serialized).toContain('รอบเช้า ตรวจแล้ว')
    expect(serialized).toContain('ยกเลิกแล้ว')
    expect(serialized).not.toContain('secret-token')
    expect(serialized).not.toContain('987654321')
    expect(serialized).not.toContain('0123456789012')
  })
})
