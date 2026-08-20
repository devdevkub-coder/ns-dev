import { prisma } from '@/lib/server/prisma'

/** รายการงานย่อยในแต่ละโกดัง (แสดงใน Carousel Slide รายโกดัง) */
export interface JobItemDetail {
  icon: string
  title: string
  kgText: string
  timeText: string
  completed: boolean
}

/** สรุปรายละเอียดแต่ละโกดัง (Carousel Slide 2..N) */
export interface WarehouseDetailSummary {
  id: string | bigint
  code: string
  name: string
  jobCount: number
  completedCount: number
  customerCount: number
  startTime: string
  endTime: string
  types: Array<{
    icon: string
    label: string
    count: number
    kg: number
  }>
  items: JobItemDetail[]
}

/** ข้อมูลสรุปรายงานการผลิตประจำวัน (Daily Report) สำหรับส่งเข้า LINE OA (Carousel) */
export interface DailyReportSummaryData {
  reportDate: string
  dateDisplay: string
  generatedTime: string
  earliestTime: string
  latestTime: string
  totalJobs: number
  completedJobs: number
  uniqueCustomers: number
  receiveTotalKg: number
  receiveVendorsCount: number
  loadTotalKg: number
  loadCustomersCount: number
  baleTotalCount: number
  baleTotalKg: number
  sortTotalKg: number
  warehouses: WarehouseDetailSummary[]
}

/** สถานะใบชั่งที่นับ (ไม่นับ draft / cancelled / void) */
const TICKET_STATUSES = ['received', 'billed', 'delivered', 'partially_billed']

function startOfDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function formatThaiDate(date: Date): string {
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Bangkok',
    weekday: 'long',
    year: 'numeric',
  }).format(date)
}

function formatTime(date: Date | string | null | undefined): string {
  if (!date) return '--:--'
  const parsed = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(parsed.getTime())) return '--:--'
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  }).format(parsed)
}

/**
 * รวมยอดสรุปรายวันตาม Schema จริง (mapping ตามโปรเจกต์นี้ ไม่ใช่ตาม spec ของระบบอ้างอิง):
 * - ใบชั่ง: weight_tickets (doc_type WTI/WTO) + น้ำหนักจาก weight_ticket_lines
 * - งานผลิต: production_orders + น้ำหนัก/ก้อนจาก production_outputs
 * - แยกรายละเอียดรายโกดังจาก weight_tickets.godown_name สำหรับ Carousel
 */
export async function getDailyProductionSummary(targetDate: Date): Promise<DailyReportSummaryData> {
  const start = startOfDay(targetDate)
  const end = endOfDay(targetDate)

  // 1. ใบชั่งรับ-ส่ง (เฉพาะสถานะที่นับ) + ชื่อลูกค้า/ซัพพลายเออร์
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

  // 2. งานผลิต (ไม่นับ cancelled) + ผลผลิต + ชื่อสินค้า
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

  // 3. โกดังที่เปิดใช้งานจาก master โกดังโดยตรง
  const activeGodowns = await prisma.godowns.findMany({
    orderBy: { code: 'asc' },
    where: { active: true },
  })

  const wtiTickets = tickets.filter((t) => t.doc_type === 'WTI')
  const wtoTickets = tickets.filter((t) => t.doc_type === 'WTO')

  // รวมเวลาเริ่ม - เสร็จ ของทั้งวัน
  const allDates = [
    ...tickets.map((t) => new Date(t.created_at)),
    ...productionOrders.map((p) => new Date(p.created_at ?? p.date)),
  ].filter((d) => !Number.isNaN(d.getTime())).sort((a, b) => a.getTime() - b.getTime())
  const earliestTime = allDates.length > 0 ? formatTime(allDates[0]) : '08:00'
  const latestTime = allDates.length > 0 ? formatTime(allDates[allDates.length - 1]) : '17:00'

  const ticketNetWeight = (ticket: (typeof tickets)[number]): number =>
    ticket.weight_ticket_lines.reduce((sum, line) => sum + toNumber(line.net_weight), 0)

  const receiveTotalKg = wtiTickets.reduce((sum, t) => sum + ticketNetWeight(t), 0)
  const loadTotalKg = wtoTickets.reduce((sum, t) => sum + ticketNetWeight(t), 0)

  // schema จริง production_type ส่วนใหญ่เป็น null → ถือว่าเป็นงานคัดแยก (SORT)
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

  // 4. สรุปรายละเอียดรายโกดังจาก snapshot header; production orders
  // ไม่มี godown field จึงไม่เดาคลัง stock ให้เป็นโกดัง
  const warehouses: WarehouseDetailSummary[] = activeGodowns.map((godown) => {
    const godownLabels = new Set([godown.code, godown.name])
    const whTickets = tickets.filter((ticket) => godownLabels.has(ticket.godown_name?.trim() ?? ''))
    const whOrders: typeof productionOrders = []

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

    const whCustomers = new Set([
      ...whWti.map((t) => t.suppliers?.name || t.party_name),
      ...whWto.map((t) => t.customers?.name || t.party_name),
    ].filter(Boolean))

    const whDates = [
      ...whTickets.map((t) => new Date(t.created_at)),
      ...whOrders.map((p) => new Date(p.created_at ?? p.date)),
    ].filter((d) => !Number.isNaN(d.getTime())).sort((a, b) => a.getTime() - b.getTime())

    const ticketKgText = (ticket: (typeof tickets)[number]): string =>
      `${new Intl.NumberFormat('th-TH').format(Math.round(ticketNetWeight(ticket)))} กก.`

    // รายการงานย่อย (สูงสุด 8 รายการ)
    const items: JobItemDetail[] = [
      ...whWti.map((t) => ({
        completed: true,
        icon: '📥',
        kgText: ticketKgText(t),
        timeText: formatTime(t.created_at),
        title: t.suppliers?.name || t.party_name || `ใบรับชั่ง #${t.doc_no}`,
      })),
      ...whBale.map((p) => ({
        completed: true,
        icon: '📦',
        kgText: `${p.production_outputs.length} ก้อน`,
        timeText: formatTime(p.created_at ?? p.date),
        title: p.production_outputs[0]?.products?.name || 'อัดก้อน',
      })),
      ...whWto.map((t) => ({
        completed: true,
        icon: '🚛',
        kgText: ticketKgText(t),
        timeText: formatTime(t.created_at),
        title: t.customers?.name || t.party_name || `ใบส่งชั่ง #${t.doc_no}`,
      })),
    ].slice(0, 8)

    const types: WarehouseDetailSummary['types'] = []
    if (whWti.length > 0) types.push({ count: whWti.length, icon: '📥', kg: whRkg, label: 'รับสินค้า' })
    if (whSort.length > 0) types.push({ count: whSort.length, icon: '🔀', kg: whSkg, label: 'คัดแยก' })
    if (whBale.length > 0) types.push({ count: whBale.length, icon: '📦', kg: whBkg, label: 'อัดก้อน' })
    if (whWto.length > 0) types.push({ count: whWto.length, icon: '🚛', kg: whLkg, label: 'ขึ้นสินค้า' })

    return {
      code: godown.code,
      completedCount: whTickets.length + whOrders.length,
      customerCount: whCustomers.size,
      endTime: whDates.length > 0 ? formatTime(whDates[whDates.length - 1]) : '--:--',
      id: godown.id,
      items,
      jobCount: whTickets.length + whOrders.length,
      name: godown.name,
      startTime: whDates.length > 0 ? formatTime(whDates[0]) : '--:--',
      types,
    }
  })

  return {
    baleTotalCount,
    baleTotalKg,
    completedJobs: tickets.length + productionOrders.length,
    dateDisplay: formatThaiDate(targetDate),
    earliestTime,
    generatedTime: formatTime(new Date()),
    latestTime,
    loadCustomersCount: loadCustomers.size,
    loadTotalKg,
    receiveTotalKg,
    receiveVendorsCount: receiveVendors.size,
    reportDate: targetDate.toISOString().slice(0, 10),
    sortTotalKg,
    totalJobs: tickets.length + productionOrders.length,
    uniqueCustomers: receiveVendors.size + loadCustomers.size,
    warehouses: warehouses.filter((w) => w.jobCount > 0),
  }
}
