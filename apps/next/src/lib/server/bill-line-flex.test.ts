import { describe, expect, it } from 'vitest'
import { buildBillLineFlexMessage, type BillLineFlexData } from './bill-line-flex'

describe('buildBillLineFlexMessage', () => {
  it('builds a dark bill card with five product rows and no sensitive financial fields', () => {
    const input: BillLineFlexData = {
      balance: 250,
      branchName: 'สำนักงานใหญ่',
      channelName: '',
      date: '2026-07-13',
      documentNo: 'PB-260713-001',
      items: Array.from({ length: 6 }, (_, index) => ({
        productName: `สินค้า ${index + 1}`,
        qty: index + 1,
        unit: 'กก.',
      })),
      partyName: 'Supplier A',
      salesName: 'เซลส์ A',
      settledAmount: 750,
      sourceType: 'purchase_bill',
      totalAmount: 1_000,
      warehouseName: 'คลังหลัก',
    }

    const message = buildBillLineFlexMessage(input, 'https://erp.example.com/purchase/bills/PB-260713-001')
    const serialized = JSON.stringify(message)

    expect(message.contents.header.backgroundColor).toBe('#0f172a')
    expect(serialized).toContain('สินค้า 5')
    expect(serialized).not.toContain('สินค้า 6')
    expect(serialized).toContain('+ อีก 1 รายการ')
    expect(serialized).toContain('ค้างจ่าย')
    expect(serialized).toContain('จ่ายบางส่วน')
    expect(serialized).toContain('https://erp.example.com/purchase/bills/PB-260713-001')
    expect(serialized.toLowerCase()).not.toMatch(/tax id|bank account|cogs|gross profit|\bgp\b/)

    const salesMessage = buildBillLineFlexMessage({
      ...input,
      balance: 400,
      documentNo: 'SB-260713-001',
      channelName: 'ขายตรง',
      settledAmount: 600,
      sourceType: 'sales_bill',
    }, 'https://erp.example.com/sales/bills/SB-260713-001')
    expect(JSON.stringify(salesMessage)).toContain('รับบางส่วน')
    expect(JSON.stringify(salesMessage)).toContain('เซลส์ A')
    expect(JSON.stringify(salesMessage)).toContain('ขายตรง')
  })
})
