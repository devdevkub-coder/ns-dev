import { describe, expect, it, vi } from 'vitest'
import { buildDailyReportFlexMessage } from '@/lib/server/daily-report-line-flex'

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    weight_tickets: { findMany: vi.fn() },
    production_orders: { findMany: vi.fn() },
    warehouses: { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/server/prisma'
import { getDailyProductionSummary } from '@/lib/server/daily-report-aggregator'

const weightTicketsMock = vi.mocked(prisma.weight_tickets.findMany)
const productionOrdersMock = vi.mocked(prisma.production_orders.findMany)
const warehousesMock = vi.mocked(prisma.warehouses.findMany)

describe('getDailyProductionSummary', () => {
  it('รวมยอดรับเข้า/ส่งออก/คัดแยกจาก schema จริง + แยกรายโกดัง', async () => {
    weightTicketsMock.mockResolvedValue([
      {
        created_at: new Date('2026-08-18T09:27:00'),
        customer_id: null,
        doc_no: 'WTI-001',
        doc_type: 'WTI',
        id: 1n,
        party_name: 'ซัพพลายเออร์ A',
        status: 'received',
        supplier_id: 10n,
        suppliers: { name: 'ซัพพลายเออร์ A' },
        customers: null,
        weight_ticket_lines: [{ id: 1n, net_weight: 1000n, warehouse_id: 262n }],
      },
      {
        created_at: new Date('2026-08-18T14:00:00'),
        customer_id: 20n,
        customers: { name: 'ลูกค้า B' },
        doc_no: 'WTO-001',
        doc_type: 'WTO',
        id: 2n,
        party_name: 'ลูกค้า B',
        status: 'delivered',
        supplier_id: null,
        suppliers: null,
        weight_ticket_lines: [{ id: 2n, net_weight: 400n, warehouse_id: 262n }],
      },
    ] as never)

    productionOrdersMock.mockResolvedValue([
      {
        created_at: new Date('2026-08-18T11:00:00'),
        date: new Date('2026-08-18'),
        doc_no: 'PO-001',
        id: 5n,
        production_type: null,
        production_outputs: [{ id: 9n, products: null, qty: 300n, status: 'active' }],
        status: 'Completed',
        warehouse_id: 262n,
      },
    ] as never)

    warehousesMock.mockResolvedValue([
      { active: true, code: 'WH-01', id: 262n, in_charge: 'สมชาย', name: 'โกดัง 1', target_bale_count: 20, target_sort_kg: 5000n },
    ] as never)

    const summary = await getDailyProductionSummary(new Date('2026-08-18T12:00:00'))

    expect(summary.receiveTotalKg).toBe(1000)
    expect(summary.receiveVendorsCount).toBe(1)
    expect(summary.loadTotalKg).toBe(400)
    expect(summary.loadCustomersCount).toBe(1)
    expect(summary.sortTotalKg).toBe(300)
    expect(summary.baleTotalCount).toBe(0)
    expect(summary.totalJobs).toBe(3)
    expect(summary.uniqueCustomers).toBe(2)
    expect(summary.earliestTime).not.toBe('--:--')
    expect(summary.warehouses).toHaveLength(1)
    expect(summary.warehouses[0]).toMatchObject({
      code: 'WH-01',
      jobCount: 3, // 2 ใบชั่ง + 1 งานผลิต (warehouse_id = 262)
      completedCount: 3,
      customerCount: 2,
    })
    expect(summary.warehouses[0].types[0]).toMatchObject({ icon: '📥', label: 'รับสินค้า', count: 1, kg: 1000 })
    expect(summary.warehouses[0].items[0]).toMatchObject({ icon: '📥', title: 'ซัพพลายเออร์ A', kgText: '1,000 กก.', completed: true })
  })

  it('คืนยอด 0 เมื่อไม่มีข้อมูลในวันนั้น (ไม่ error)', async () => {
    weightTicketsMock.mockResolvedValue([] as never)
    productionOrdersMock.mockResolvedValue([] as never)
    warehousesMock.mockResolvedValue([] as never)

    const summary = await getDailyProductionSummary(new Date('2026-08-18T12:00:00'))

    expect(summary.receiveTotalKg).toBe(0)
    expect(summary.loadTotalKg).toBe(0)
    expect(summary.sortTotalKg).toBe(0)
    expect(summary.baleTotalCount).toBe(0)
    expect(summary.warehouses).toEqual([])
    expect(summary.totalJobs).toBe(0)
  })
})

describe('buildDailyReportFlexMessage', () => {
  it('สร้าง Carousel: การ์ดภาพรวม + การ์ดรายโกดัง', () => {
    const message = buildDailyReportFlexMessage({
      baleTotalCount: 5,
      baleTotalKg: 800,
      completedJobs: 3,
      dateDisplay: 'อังคาร 18 ส.ค. 2569',
      earliestTime: '08:00',
      generatedTime: '18:30',
      latestTime: '17:00',
      loadCustomersCount: 1,
      loadTotalKg: 400,
      receiveTotalKg: 1000,
      receiveVendorsCount: 2,
      reportDate: '2026-08-18',
      sortTotalKg: 300,
      totalJobs: 3,
      uniqueCustomers: 3,
      warehouses: [{
        code: 'WH-01',
        completedCount: 2,
        customerCount: 2,
        endTime: '17:00',
        id: 262n,
        items: [
          { completed: true, icon: '📥', kgText: '1,000 กก.', timeText: '09:27', title: 'ซัพพลายเออร์ A' },
        ],
        jobCount: 2,
        name: 'โกดัง 1',
        startTime: '09:27',
        types: [{ count: 1, icon: '📥', kg: 1000, label: 'รับสินค้า' }],
      }],
    })

    expect(message.type).toBe('flex')
    expect(message.contents.type).toBe('carousel')
    expect(message.contents.contents).toHaveLength(2)
    expect(message.altText).toContain('อังคาร 18 ส.ค. 2569')

    const [overview, whBubble] = message.contents.contents
    expect(overview.header.contents[1].text).toBe('รายงานสรุป')
    // header ใหม่: [icon 🏗️ + ชื่อ + ● WAREHOUSE] อยู่ baseline box แรก
    const headerRow = whBubble.header.contents[0] as { contents: Array<{ text?: string }> }
    const whName = headerRow.contents[1].text
    expect(whName).toBe('โกดัง 1')
    expect(whBubble.header.contents[1].text).toContain('WH-01')
    expect(whBubble.header.contents[1].text).toContain('2 งาน')

    const serialized = JSON.stringify(message)
    expect(serialized).not.toContain('{{')
    expect(serialized).toContain('1,000')
    expect(serialized).toContain('ซัพพลายเออร์ A')
    expect(serialized).toContain('carousel')
  })

  it('สร้าง Carousel เฉพาะการ์ดภาพรวมเมื่อไม่มีงานรายโกดัง', () => {
    const message = buildDailyReportFlexMessage({
      baleTotalCount: 0,
      baleTotalKg: 0,
      completedJobs: 0,
      dateDisplay: 'อังคาร 18 ส.ค. 2569',
      earliestTime: '08:00',
      generatedTime: '18:30',
      latestTime: '17:00',
      loadCustomersCount: 0,
      loadTotalKg: 0,
      receiveTotalKg: 0,
      receiveVendorsCount: 0,
      reportDate: '2026-08-18',
      sortTotalKg: 0,
      totalJobs: 0,
      uniqueCustomers: 0,
      warehouses: [],
    })

    expect(message.contents.type).toBe('carousel')
    expect(message.contents.contents).toHaveLength(1)
  })
})
