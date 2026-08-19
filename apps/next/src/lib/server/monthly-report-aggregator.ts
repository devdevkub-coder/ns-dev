import { prisma } from '@/lib/server/prisma'
import type { WarehouseDetailSummary, JobItemDetail } from './daily-report-aggregator'

/** ข้อมูลสรุปรายงานการผลิตและการดำเนินงานประจำเดือน (Monthly Report) สำหรับส่งเข้า LINE OA */
export interface MonthlyReportSummaryData {
  reportMonth: string // YYYY-MM
  monthDisplay: string // e.g. "สิงหาคม 2569"
  dateRangeDisplay: string // e.g. "1 ส.ค. 2569 - 31 ส.ค. 2569"
  generatedTime: string
  activeDaysCount: number
  totalDaysInMonth: number
  totalJobs: number
  completedJobs: number
  uniquePartners: number
  receiveTotalKg: number
  receiveVendorsCount: number
  loadTotalKg: number
  loadCustomersCount: number
  baleTotalCount: number
  baleTotalKg: number
  sortTotalKg: number
  warehouses: WarehouseDetailSummary[]
  topInputProducts: Array<{ name: string; kg: number }>
  topOutputProducts: Array<{ name: string; kg: number }>
  financialSummary?: {
    purchaseTotalAmount: number
    salesTotalAmount: number
    purchaseBillCount: number
    salesBillCount: number
  }
}

/** สถานะใบชั่งที่นับ (ไม่นับ draft / cancelled / void) */
const TICKET_STATUSES = ['received', 'billed', 'delivered', 'partially_billed']

function startOfMonth(date: Date): Date {
  const next = new Date(date)
  next.setDate(1)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfMonth(date: Date): Date {
  const next = new Date(date)
  next.setMonth(next.getMonth() + 1, 0)
  next.setHours(23, 59, 59, 999)
  return next
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function formatThaiMonth(date: Date): string {
  return new Intl.DateTimeFormat('th-TH', {
    month: 'long',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).format(date)
}

function formatThaiDateShort(date: Date): string {
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).format(date)
}

/**
 * รวมยอดสรุปประจำเดือน (Monthly Production & Operations Summary):
 * - ใบชั่ง WTI/WTO ตลอดทั้งเดือน
 * - งานผลิต production_orders ตลอดทั้งเดือน
 * - แยกสรุปรายโกดัง WH-01..WH-05
 */
export async function getMonthlyProductionSummary(targetDate: Date): Promise<MonthlyReportSummaryData> {
  const start = startOfMonth(targetDate)
  const end = endOfMonth(targetDate)

  const monthStr = new Intl.DateTimeFormat('en-CA', {
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).format(targetDate) // YYYY-MM

  const nowBangkok = new Date()
  const generatedTime = new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  }).format(nowBangkok)

  // 1. ใบชั่งรับ-ส่ง
  const tickets = await prisma.weight_tickets.findMany({
    include: {
      customers: { select: { name: true } },
      suppliers: { select: { name: true } },
      weight_ticket_lines: true,
    },
    orderBy: { created_at: 'asc' },
    where: {
      created_at: { gte: start, lte: end },
      status: { in: TICKET_STATUSES },
    },
  })

  // 2. งานผลิต
  const productionOrders = await prisma.production_orders.findMany({
    include: {
      production_outputs: {
        include: { products: { select: { name: true } } },
      },
    },
    orderBy: { created_at: 'asc' },
    where: {
      created_at: { gte: start, lte: end },
      status: { not: 'Cancelled' },
    },
  })

  // 3. โกดังที่เปิดใช้งาน
  const activeWarehouses = await prisma.warehouses.findMany({
    orderBy: { code: 'asc' },
    where: { active: true },
  })

  // 4. บิลซื้อและบิลขาย
  const [purchaseBills, salesBills] = await Promise.all([
    prisma.purchase_bills.findMany({
      select: { total_amount: true },
      where: {
        date: { gte: start, lte: end },
        status: { notIn: ['cancelled', 'cancelled_supplier_swap'] },
      },
    }),
    prisma.sales_bills.findMany({
      select: { total_amount: true },
      where: {
        date: { gte: start, lte: end },
        status: { notIn: ['cancelled'] },
      },
    }),
  ])

  const wtiTickets = tickets.filter((t) => t.doc_type === 'WTI')
  const wtoTickets = tickets.filter((t) => t.doc_type === 'WTO')

  const ticketNetWeight = (ticket: (typeof tickets)[number]): number =>
    ticket.weight_ticket_lines.reduce((sum, line) => sum + toNumber(line.net_weight), 0)

  const receiveTotalKg = wtiTickets.reduce((sum, t) => sum + ticketNetWeight(t), 0)
  const loadTotalKg = wtoTickets.reduce((sum, t) => sum + ticketNetWeight(t), 0)

  const isSortOrder = (p: (typeof productionOrders)[number]) => {
    const type = (p.production_type ?? '').toUpperCase()
    return type === '' || type === 'SORT'
  }
  const sortOrders = productionOrders.filter(isSortOrder)
  const baleOrders = productionOrders.filter((p) => (p.production_type ?? '').toUpperCase() === 'BALE')

  const sortTotalKg = sortOrders.reduce(
    (sum, p) => sum + p.production_outputs.reduce((s, o) => s + toNumber(o.qty), 0),
    0,
  )
  const baleTotalCount = baleOrders.reduce((sum, p) => sum + p.production_outputs.length, 0)
  const baleTotalKg = baleOrders.reduce(
    (sum, p) => sum + p.production_outputs.reduce((s, o) => s + toNumber(o.qty), 0),
    0,
  )

  const receiveVendors = new Set(wtiTickets.map((t) => t.suppliers?.name || t.party_name).filter(Boolean))
  const loadCustomers = new Set(wtoTickets.map((t) => t.customers?.name || t.party_name).filter(Boolean))
  const allPartners = new Set([...receiveVendors, ...loadCustomers])

  // คำนวณวันที่มีการทำงาน (Active Days)
  const activeDaysSet = new Set<string>()
  for (const t of tickets) {
    if (t.created_at) activeDaysSet.add(new Date(t.created_at).toISOString().slice(0, 10))
  }
  for (const p of productionOrders) {
    if (p.created_at) activeDaysSet.add(new Date(p.created_at).toISOString().slice(0, 10))
  }

  // คำนวณรายโกดัง (Warehouse Breakdown)
  const warehouses: WarehouseDetailSummary[] = activeWarehouses.map((warehouse) => {
    const whTickets = tickets.filter((t) =>
      t.weight_ticket_lines.some((line) => String(line.warehouse_id) === String(warehouse.id)),
    )
    const whOrders = productionOrders.filter((p) =>
      p.production_outputs.some((o) => String(o.destination_warehouse_id) === String(warehouse.id))
      || String(p.warehouse_id) === String(warehouse.id),
    )

    const whWti = whTickets.filter((t) => t.doc_type === 'WTI')
    const whWto = whTickets.filter((t) => t.doc_type === 'WTO')
    const whSort = whOrders.filter(isSortOrder)
    const whBale = whOrders.filter((p) => (p.production_type ?? '').toUpperCase() === 'BALE')

    const whRkg = whWti.reduce((sum, t) => sum + ticketNetWeight(t), 0)
    const whLkg = whWto.reduce((sum, t) => sum + ticketNetWeight(t), 0)
    const whSkg = whSort.reduce(
      (sum, p) => sum + p.production_outputs.reduce((s, o) => s + toNumber(o.qty), 0),
      0,
    )
    const whBkg = whBale.reduce(
      (sum, p) => sum + p.production_outputs.reduce((s, o) => s + toNumber(o.qty), 0),
      0,
    )

    const types: WarehouseDetailSummary['types'] = []
    if (whRkg > 0 || whWti.length > 0) {
      types.push({ icon: '📥', kg: whRkg, label: 'รับเข้าทั้งเดือน', count: whWti.length })
    }
    if (whLkg > 0 || whWto.length > 0) {
      types.push({ icon: '🚛', kg: whLkg, label: 'ขึ้นออกทั้งเดือน', count: whWto.length })
    }
    if (whBkg > 0 || whBale.length > 0) {
      types.push({ icon: '📦', kg: whBkg, label: 'อัดก้อนทั้งเดือน', count: whBale.reduce((sum, p) => sum + p.production_outputs.length, 0) })
    }
    if (whSkg > 0 || whSort.length > 0) {
      types.push({ icon: '🔀', kg: whSkg, label: 'คัดแยกทั้งเดือน', count: whSort.length })
    }

    const items: JobItemDetail[] = []
    if (whWti.length > 0) {
      items.push({ icon: '📥', title: `รับสินค้า ${whWti.length} ใบชั่ง`, kgText: `${whRkg.toLocaleString('en-US', { maximumFractionDigits: 1 })} กก.`, timeText: 'ทั้งเดือน', completed: true })
    }
    if (whWto.length > 0) {
      items.push({ icon: '🚛', title: `ขึ้นสินค้า ${whWto.length} เที่ยว`, kgText: `${whLkg.toLocaleString('en-US', { maximumFractionDigits: 1 })} กก.`, timeText: 'ทั้งเดือน', completed: true })
    }
    if (whBale.length > 0) {
      const balesCount = whBale.reduce((sum, p) => sum + p.production_outputs.length, 0)
      items.push({ icon: '📦', title: `อัดก้อน ${balesCount} ก้อน`, kgText: `${whBkg.toLocaleString('en-US', { maximumFractionDigits: 1 })} กก.`, timeText: 'ทั้งเดือน', completed: true })
    }
    if (whSkg > 0) {
      items.push({ icon: '🔀', title: `คัดแยกกระจายสินค้า`, kgText: `${whSkg.toLocaleString('en-US', { maximumFractionDigits: 1 })} กก.`, timeText: 'ทั้งเดือน', completed: true })
    }

    return {
      code: warehouse.code,
      completedCount: whTickets.length + whOrders.length,
      customerCount: new Set(whTickets.map((t) => t.supplier_id || t.customer_id).filter(Boolean)).size,
      endTime: 'ทั้งเดือน',
      id: warehouse.id,
      items,
      jobCount: whTickets.length + whOrders.length,
      name: warehouse.name,
      startTime: '1 ส.ค.',
      types,
    }
  })

  // สรุปการเงิน
  const purchaseTotalAmount = purchaseBills.reduce((s, b) => s + toNumber(b.total_amount), 0)
  const salesTotalAmount = salesBills.reduce((s, b) => s + toNumber(b.total_amount), 0)

  return {
    activeDaysCount: activeDaysSet.size,
    baleTotalCount,
    baleTotalKg,
    completedJobs: tickets.length + productionOrders.length,
    dateRangeDisplay: `${formatThaiDateShort(start)} - ${formatThaiDateShort(end)}`,
    financialSummary: {
      purchaseBillCount: purchaseBills.length,
      purchaseTotalAmount,
      salesBillCount: salesBills.length,
      salesTotalAmount,
    },
    generatedTime,
    loadCustomersCount: loadCustomers.size,
    loadTotalKg,
    monthDisplay: formatThaiMonth(targetDate),
    receiveTotalKg,
    receiveVendorsCount: receiveVendors.size,
    reportMonth: monthStr,
    sortTotalKg,
    topInputProducts: [],
    topOutputProducts: [],
    totalDaysInMonth: end.getDate(),
    totalJobs: tickets.length + productionOrders.length,
    uniquePartners: allPartners.size,
    warehouses,
  }
}
