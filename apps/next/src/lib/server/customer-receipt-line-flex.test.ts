import { describe, expect, it } from 'vitest'
import {
  buildCustomerReceiptLineFlexMessage,
  type CustomerReceiptLineFlexData,
} from './customer-receipt-line-flex'

function receipt(overrides: Partial<CustomerReceiptLineFlexData> = {}): CustomerReceiptLineFlexData {
  return {
    allocations: [{
      allocatedArAmount: 1_100,
      discount: 50,
      receiptAmount: 1_000,
      salesBillDocumentNo: 'SB2607-0001',
      withholdingTax: 50,
    }],
    branchName: 'สำนักงานใหญ่',
    companyAccounts: [{ accountCode: 'BANK-SCB', accountName: 'บัญชีรับเงินหลัก', amount: 975 }],
    customerName: 'บริษัท ลูกค้าทดสอบ จำกัด',
    date: '2026-07-13',
    discount: 50,
    documentNo: 'RCP2607-0001',
    fee: 25,
    netCashIn: 925,
    notes: 'รับชำระตามรอบ',
    paymentMethod: 'เงินโอน',
    receivedAmount: 1_000,
    status: 'active',
    withholdingTax: 50,
    ...overrides,
  }
}

describe('buildCustomerReceiptLineFlexMessage', () => {
  it('builds an aggregate RCP card with customer, SB, account, and receipt totals', () => {
    const message = buildCustomerReceiptLineFlexMessage(
      receipt(),
      'https://erp.example.com/sales/receipts',
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
    expect(serialized).toContain('ใบรับเงิน Customer')
    expect(serialized).toContain('RCP2607-0001')
    expect(serialized).toContain('บริษัท ลูกค้าทดสอบ จำกัด')
    expect(serialized).toContain('SB2607-0001')
    expect(serialized).toContain('BANK-SCB - บัญชีรับเงินหลัก')
    expect(serialized).toContain('ยอดตัดลูกหนี้')
    expect(serialized).toContain('฿1,100')
    expect(serialized).toContain('เงินเข้าสุทธิ')
    expect(serialized).toContain('รับเงินแล้ว')
    expect(serialized).toContain('https://erp.example.com/sales/receipts')
    expect(serialized).not.toContain('"text":""')
  })

  it('uses a high-contrast light body with readable primary text', () => {
    const message = buildCustomerReceiptLineFlexMessage(
      receipt(),
      'https://erp.example.com/sales/receipts',
    )

    expect(message.contents.header).toMatchObject({
      backgroundColor: '#0f172a',
    })
    expect(message.contents.body).toMatchObject({
      backgroundColor: '#f8fafc',
      spacing: 'md',
    })
    expect(message.contents.body.contents[0]).toMatchObject({
      contents: [
        { color: '#475569', size: 'sm', weight: 'bold' },
        { color: '#0f172a', size: 'sm' },
      ],
    })
    expect(message.contents.body.contents[1]).toMatchObject({
      contents: [
        { color: '#475569', size: 'sm', weight: 'bold' },
        { color: '#0f172a', size: 'md', weight: 'bold' },
      ],
    })
    expect(message.contents.body.contents[3]).toMatchObject({
      backgroundColor: '#ecfdf5',
      contents: [
        { color: '#065f46', size: 'sm', weight: 'bold' },
      ],
    })
    expect(message.contents.footer).toMatchObject({
      backgroundColor: '#ffffff',
    })
    const serialized = JSON.stringify(message)
    expect(serialized).toContain('#047857')
    expect(serialized).not.toContain('#059669')
  })

  it('groups dense details with the preferred three rounded highlight tabs', () => {
    const message = buildCustomerReceiptLineFlexMessage(
      receipt(),
      'https://erp.example.com/sales/receipts',
    )
    const tabs = message.contents.body.contents.filter((item) => (
      'backgroundColor' in item && item.backgroundColor === '#ecfdf5'
    ))
    const serialized = JSON.stringify(tabs)

    expect(tabs).toHaveLength(3)
    expect(serialized).toContain('SB / ตัดลูกหนี้')
    expect(serialized).toContain('บัญชีบริษัทที่รับเงิน')
    expect(serialized).toContain('สรุปยอดรับเงิน')
    for (const tab of tabs) {
      expect(tab).toMatchObject({ cornerRadius: 'md', paddingAll: '10px' })
    }

    const keyTotalLabels = ['ยอดรับ', 'ยอดตัดลูกหนี้', 'เงินเข้าสุทธิ']
    const keyTotalRows = message.contents.body.contents.filter((item) => (
      'contents' in item && item.contents.some((content) => (
        'text' in content && keyTotalLabels.includes(content.text)
      ))
    ))

    expect(keyTotalRows).toHaveLength(3)
    for (const row of keyTotalRows) {
      expect(row).not.toHaveProperty('backgroundColor')
    }
    expect(message.contents.body.contents.some((item) => item.type === 'separator')).toBe(false)
  })

  it('caps SB and company-account rows and reports each remaining count', () => {
    const input = receipt({
      allocations: Array.from({ length: 6 }, (_, index) => ({
        allocatedArAmount: 100 + index,
        discount: 0,
        receiptAmount: 100 + index,
        salesBillDocumentNo: `SB-${index + 1}`,
        withholdingTax: 0,
      })),
      companyAccounts: Array.from({ length: 6 }, (_, index) => ({
        accountCode: `BANK-${index + 1}`,
        accountName: `บัญชี ${index + 1}`,
        amount: 100 + index,
      })),
    })

    const serialized = JSON.stringify(buildCustomerReceiptLineFlexMessage(input, 'https://erp.example.com/sales/receipts'))

    expect(serialized).toContain('SB-4')
    expect(serialized).not.toContain('SB-5')
    expect(serialized).toContain('+ อีก 2 บิลขาย')
    expect(serialized).toContain('BANK-4')
    expect(serialized).not.toContain('BANK-5')
    expect(serialized).toContain('+ อีก 2 บัญชี')
  })

  it('normalizes unsafe text and ignores unrelated sensitive fields', () => {
    const input = {
      ...receipt({ notes: '  รอบเช้า\u0000  ตรวจแล้ว  ', status: 'cancelled' }),
      accountNo: '1234567890',
      accessToken: 'secret-token',
      internalId: '987654321',
      taxId: '0123456789012',
    }

    const serialized = JSON.stringify(buildCustomerReceiptLineFlexMessage(input, 'https://erp.example.com/sales/receipts'))

    expect(serialized).toContain('รอบเช้า ตรวจแล้ว')
    expect(serialized).toContain('ยกเลิกแล้ว')
    expect(serialized).not.toContain('1234567890')
    expect(serialized).not.toContain('secret-token')
    expect(serialized).not.toContain('987654321')
    expect(serialized).not.toContain('0123456789012')
  })
})
