import { describe, expect, it } from 'vitest'
import { buildBillLineFlexMessage, type BillLineFlexData } from './bill-line-flex'

describe('buildBillLineFlexMessage', () => {
  it('builds a wide bill card with a white body and unchanged dark header/footer', () => {
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

    expect(message.contents.size).toBe('mega')
    expect(message.contents.header.backgroundColor).toBe('#0f172a')
    expect(message.contents.header.contents[0]).toMatchObject({ text: '🛒 บิลซื้อ' })
    expect(message.contents.body.backgroundColor).toBe('#ffffff')
    expect(message.contents.footer.backgroundColor).toBe('#020617')
    expect(message.contents.body.contents[0]).toMatchObject({
      contents: [
        { color: '#475569' },
        { color: '#0f172a' },
      ],
    })
    expect(serialized).toContain('สินค้า 1')
    expect(serialized).toContain('สินค้า 2')
    expect(serialized).toContain('สินค้า 3')
    expect(serialized).not.toContain('สินค้า 4')
    expect(serialized).not.toContain('สินค้า 5')
    expect(serialized).not.toContain('สินค้า 6')
    expect(serialized).toContain('และสินค้าอื่นๆ อีก 3 รายการ')
    expect(serialized).not.toContain('+ อีก')
    expect(serialized).not.toContain('"text":""')

    const exactlyThreeItems = buildBillLineFlexMessage({ ...input, items: input.items.slice(0, 3) }, 'https://erp.example.com/purchase/bills/PB-260713-001')
    expect(JSON.stringify(exactlyThreeItems)).not.toContain('และสินค้าอื่นๆ')

    const fourItems = buildBillLineFlexMessage({ ...input, items: input.items.slice(0, 4) }, 'https://erp.example.com/purchase/bills/PB-260713-001')
    expect(JSON.stringify(fourItems)).toContain('และสินค้าอื่นๆ อีก 1 รายการ')
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
    expect(salesMessage.contents.header.contents[0]).toMatchObject({ text: '🧾 บิลขาย' })
    expect(JSON.stringify(salesMessage)).toContain('รับบางส่วน')
    expect(JSON.stringify(salesMessage)).toContain('เซลส์ A')
    expect(JSON.stringify(salesMessage)).toContain('ขายตรง')
  })
})
