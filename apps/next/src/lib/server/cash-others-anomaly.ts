import type { Prisma } from '../../../generated/prisma/client'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { purchaseBillItemRows } from '@/lib/server/purchase-bill-items'

type JsonItem = Prisma.JsonObject
type Severity = 'critical' | 'info' | 'warn'

function endOfDay(date: Date) {
  return new Date(`${toDateOnly(date)}T23:59:59.999Z`)
}

function activeStatus(status?: string | null) {
  return !['cancelled', 'void', 'reversed'].includes((status ?? '').toLowerCase())
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') return value.toNumber()
  return 0
}

function isJsonItem(value: unknown): value is JsonItem {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function itemQty(item: JsonItem) {
  return jsonNumber(item.qty ?? item.quantity ?? item.netWeight ?? item.weight)
}

function itemAmount(item: JsonItem) {
  const amount = jsonNumber(item.amount ?? item.totalAmount ?? item.total ?? item.lineTotal)
  if (amount) return amount
  return itemQty(item) * jsonNumber(item.price ?? item.unitPrice)
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / 86400000)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function marketScope(value?: string | null) {
  return (value ?? '').includes('ต่าง') || (value ?? '').toLowerCase().includes('over') ? 'overseas' : 'domestic'
}

async function accountBalances(asOf: Date) {
  const [accounts, bankRows] = await Promise.all([
    prisma.accounts.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }, { account_no: 'asc' }], where: { active: { not: false } } }),
    prisma.bank_statement.findMany({
      orderBy: [{ account_id: 'asc' }, { date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      take: 60000,
      where: { date: { lte: endOfDay(asOf) } },
    }),
  ])
  const balances = new Map<bigint, number>()
  accounts.forEach((account) => balances.set(account.id, toNumber(account.opening_balance)))
  bankRows.forEach((row) => {
    if (!row.account_id) return
    const previous = balances.get(row.account_id) ?? 0
    balances.set(row.account_id, row.balance === null || row.balance === undefined ? previous + toNumber(row.amount_in) - toNumber(row.amount_out) : toNumber(row.balance))
  })
  return accounts.map((account) => {
    const balance = balances.get(account.id) ?? 0
    const currency = account.currency ?? 'THB'
    return {
      balance,
      code: account.code,
      currency,
      fxRate: currency === 'THB' ? 1 : 1,
      id: account.code,
      name: account.name,
      thbEquivalent: balance,
      type: account.type,
    }
  })
}

export async function buildCashOthersSummary(asOfValue?: string | null) {
  const asOf = asOfValue && /^\d{4}-\d{2}-\d{2}$/.test(asOfValue) ? new Date(`${asOfValue}T00:00:00.000Z`) : new Date()
  const today = toDateOnly(asOf)
  const [cashAccounts, salesBills, purchaseBills, stockRows, stockIssues, expenses, tradingDeals] = await Promise.all([
    accountBalances(asOf),
    prisma.sales_bills.findMany({ include: { customers: true, sales_channels: true }, orderBy: [{ date: 'desc' }], take: 15000, where: { date: { lte: endOfDay(asOf) } } }),
    prisma.purchase_bills.findMany({ include: { purchase_bill_items: { orderBy: { line_no: 'asc' }, where: { item_status: 'active' } }, suppliers: true }, orderBy: [{ date: 'desc' }], take: 15000, where: { date: { lte: endOfDay(asOf) } } }),
    prisma.stock_ledger.findMany({ include: { products: true }, orderBy: [{ date: 'desc' }], take: 80000, where: { date: { lte: endOfDay(asOf) } } }),
    prisma.stock_issues.findMany({ orderBy: [{ date: 'desc' }], take: 5000 }),
    prisma.expenses.findMany({ orderBy: [{ date: 'desc' }], take: 5000, where: { date: new Date(`${today}T00:00:00.000Z`) } }),
    prisma.trading_deals.findMany({ orderBy: [{ date: 'desc' }], take: 10000, where: { date: { lte: endOfDay(asOf) } } }),
  ])

  const activeSales = salesBills.filter((bill) => activeStatus(bill.status))
  const activePurchases = purchaseBills.filter((bill) => activeStatus(bill.status))
  const arBills = activeSales.filter((bill) => toNumber(bill.receivable_balance) > 0).map((bill) => {
    const dueDate = bill.due_date ?? addDays(bill.date, bill.credit_term ?? bill.customers?.credit_term ?? 0)
    return { amount: toNumber(bill.receivable_balance), bill, dueDate, overdueDays: Math.max(0, daysBetween(dueDate, asOf)) }
  })
  const apBills = activePurchases.filter((bill) => toNumber(bill.payable_balance) > 0).map((bill) => {
    const dueDate = addDays(bill.date, 0)
    return { amount: toNumber(bill.payable_balance), bill, dueDate, overdueDays: Math.max(0, daysBetween(dueDate, asOf)) }
  })
  const totalCash = cashAccounts.reduce((sum, account) => sum + account.thbEquivalent, 0)
  const arDomestic = arBills.filter((row) => marketScope(row.bill.customers?.market_scope) === 'domestic').reduce((sum, row) => sum + row.amount, 0)
  const arOverseas = arBills.filter((row) => marketScope(row.bill.customers?.market_scope) === 'overseas').reduce((sum, row) => sum + row.amount, 0)
  const arAging = arBills.reduce((acc, row) => {
    if (row.overdueDays <= 0) acc.current += row.amount
    else if (row.overdueDays <= 30) acc['1-30'] += row.amount
    else if (row.overdueDays <= 60) acc['31-60'] += row.amount
    else if (row.overdueDays <= 90) acc['61-90'] += row.amount
    else acc['90+'] += row.amount
    return acc
  }, { '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, current: 0 })

  const stock = stockRows.reduce((acc, row) => {
    acc.qty += toNumber(row.qty_in) - toNumber(row.qty_out)
    acc.value += toNumber(row.value_in) - toNumber(row.value_out)
    return acc
  }, { qty: 0, value: 0 })
  const totalPurchaseAmount = activePurchases.reduce((sum, row) => sum + toNumber(row.total_amount), 0)
  const paidPurchaseAmount = activePurchases.reduce((sum, row) => sum + toNumber(row.paid_amount), 0)
  const paidRatio = totalPurchaseAmount > 0 ? Math.min(1, paidPurchaseAmount / totalPurchaseAmount) : 1
  const pendingIssues = stockIssues.filter((issue) => (issue.status ?? '').toLowerCase() === 'pending')
  const pendingIssueSummary = pendingIssues.reduce((acc, issue) => {
    const qty = Array.isArray(issue.items) ? issue.items.filter(isJsonItem).reduce((sum, item) => sum + itemQty(item), 0) : 0
    acc.count += 1
    acc.cost += toNumber(issue.total_cost)
    acc.est += toNumber(issue.total_est_amount)
    acc.qty += qty
    return acc
  }, { cost: 0, count: 0, est: 0, qty: 0 })

  const matchedByPurchase = new Map<bigint, number>()
  tradingDeals.filter((deal) => activeStatus(deal.status)).forEach((deal) => {
    if (!deal.purchase_bill_id) return
    matchedByPurchase.set(deal.purchase_bill_id, (matchedByPurchase.get(deal.purchase_bill_id) ?? 0) + toNumber(deal.matched_purchase_amount))
  })
  const tradingPurchases = activePurchases.filter((bill) => (bill.transaction_mode ?? '').toUpperCase() === 'TRADING' && toNumber(bill.paid_amount) > 0)
  const tradingPending = tradingPurchases.reduce((acc, bill) => {
    const paid = toNumber(bill.paid_amount)
    const total = toNumber(bill.subtotal) || toNumber(bill.total_amount)
    const matched = matchedByPurchase.get(bill.id) ?? 0
    const unmatchedRatio = total > 0 ? Math.max(0, 1 - matched / total) : 1
    acc.billCount += unmatchedRatio > 0.01 ? 1 : 0
    acc.matchedAmount += Math.min(matched, paid)
    acc.paidAmount += paid
    acc.pendingAmount += paid * unmatchedRatio
    return acc
  }, { billCount: 0, matchedAmount: 0, paidAmount: 0, pendingAmount: 0 })

  const totalAR = arBills.reduce((sum, row) => sum + row.amount, 0)
  const totalAP = apBills.reduce((sum, row) => sum + row.amount, 0)
  const apOverdue = apBills.filter((row) => row.overdueDays > 0).reduce((sum, row) => sum + row.amount, 0)
  const arOverdue = arBills.filter((row) => row.overdueDays > 0).reduce((sum, row) => sum + row.amount, 0)
  const expenseToday = expenses.filter((expense) => activeStatus(expense.status)).reduce((sum, expense) => sum + toNumber(expense.net_amount || expense.amount), 0)
  const cashNeededToday = apOverdue + expenseToday
  const supplierAdvanceTotal = 0
  const customerAdvanceTotal = 0
  const totalAsset = totalCash + totalAR + stock.value + supplierAdvanceTotal + pendingIssueSummary.cost + tradingPending.pendingAmount
  const totalDebt = totalAP + customerAdvanceTotal

  return {
    asOf: today,
    charts: {
      arAging,
      assetComp: [
        { color: '#10b981', name: '💵 เงินสด/ธนาคาร', val: totalCash },
        { color: '#06b6d4', name: '📥 ลูกหนี้ (AR)', val: totalAR },
        { color: '#f59e0b', name: '📦 Stock', val: stock.value },
        { color: '#fbbf24', name: '📦 Pending Sale (รอเปิดบิล)', val: pendingIssueSummary.cost },
        { color: '#a855f7', name: '🔄 Trading Pending รับเงิน', val: tradingPending.pendingAmount },
        { color: '#8b5cf6', name: '💸 Supplier Advance', val: supplierAdvanceTotal },
      ].filter((row) => row.val > 0),
      debtComp: [
        { color: '#ef4444', name: '📤 เจ้าหนี้ (AP)', val: totalAP },
        { color: '#f97316', name: '💰 Customer Advance', val: customerAdvanceTotal },
      ].filter((row) => row.val > 0),
    },
    pendingIssueSummary,
    rows: {
      cashAccounts,
      receivable: { arDomestic, arOverdue, arOverseas, customerAdvanceTotal, totalAR },
      debt: { apOverdue, customerAdvanceTotal, expenseToday, supplierAdvanceTotal, totalAP },
      stock: { paidVal: stock.value * paidRatio, qty: stock.qty, unpaidVal: stock.value * (1 - paidRatio), val: stock.value },
    },
    sourceState: {
      limitations: ['Cash & Others Summary เป็น management/read baseline; customer/supplier advance target tables ยังไม่ยืนยันจึงแสดง 0 และไม่เปิด allocation/write/reclass/export actions.'],
      writeActionsEnabled: false,
    },
    summary: { cashNeededToday, netWorth: totalAsset - totalDebt, totalAsset, totalCash, totalDebt },
    tradingPending,
  }
}

export async function buildAnomalyDetector(asOfValue?: string | null) {
  const asOf = asOfValue && /^\d{4}-\d{2}-\d{2}$/.test(asOfValue) ? new Date(`${asOfValue}T00:00:00.000Z`) : new Date()
  const today = toDateOnly(asOf)
  const [cash, stockRows, salesBills, purchaseBills, customers, suppliers, bankRows, tradingDeals] = await Promise.all([
    accountBalances(asOf),
    prisma.stock_ledger.findMany({ include: { products: true }, orderBy: [{ date: 'desc' }], take: 80000, where: { date: { lte: endOfDay(asOf) } } }),
    prisma.sales_bills.findMany({ include: { customers: true }, orderBy: [{ date: 'desc' }], take: 10000, where: { date: { lte: endOfDay(asOf) } } }),
    prisma.purchase_bills.findMany({ include: { purchase_bill_items: { orderBy: { line_no: 'asc' }, where: { item_status: 'active' } }, suppliers: true }, orderBy: [{ date: 'desc' }], take: 10000, where: { date: { lte: endOfDay(asOf) } } }),
    prisma.customers.findMany({ orderBy: [{ name: 'asc' }], take: 10000, where: { active: { not: false } } }),
    prisma.suppliers.findMany({ orderBy: [{ name: 'asc' }], take: 10000, where: { active: { not: false } } }),
    prisma.bank_statement.findMany({ orderBy: [{ date: 'desc' }], take: 5000, where: { date: { lte: endOfDay(asOf) } } }),
    prisma.trading_deals.findMany({ orderBy: [{ date: 'desc' }], take: 5000, where: { date: { lte: endOfDay(asOf) } } }),
  ])
  const anomalies: Array<{ action: string; category: string; detail: string; fixHref?: string; icon: string; id: string; severity: Severity; title: string }> = []
  const push = (item: (typeof anomalies)[number]) => anomalies.push(item)
  const stockByProduct = new Map<string, { name: string; qty: number; value: number }>()
  stockRows.forEach((row) => {
    const key = row.products?.code ?? 'unknown'
    const current = stockByProduct.get(key) ?? { name: row.products?.name ?? 'ไม่ระบุสินค้า', qty: 0, value: 0 }
    current.qty += toNumber(row.qty_in) - toNumber(row.qty_out)
    current.value += toNumber(row.value_in) - toNumber(row.value_out)
    stockByProduct.set(key, current)
  })
  stockByProduct.forEach((row, key) => {
    if (row.qty < -0.001) push({ action: 'ตรวจ Stock Ledger และรายการเบิก/ขายที่ทำให้ยอดติดลบ', category: 'Stock', detail: `${row.name} คงเหลือ ${row.qty.toLocaleString('th-TH')} กก.`, fixHref: '/stock/ledger', icon: '🚨', id: `stock-neg-${key}`, severity: 'critical', title: `Stock ติดลบ: ${row.name}` })
    if (Math.abs(row.qty) < 0.001 && Math.abs(row.value) > 1) push({ action: 'ตรวจมูลค่าคงค้างและทำ adjustment/reconciliation หลังออกแบบ write flow', category: 'Stock', detail: `${row.name} qty 0 แต่มูลค่า ${row.value.toLocaleString('th-TH')}`, fixHref: '/stock/ledger', icon: '⚠', id: `stock-orphan-val-${key}`, severity: 'warn', title: `Stock 0 แต่มีมูลค่า: ${row.name}` })
  })
  cash.filter((account) => account.thbEquivalent < 0).forEach((account) => push({ action: 'ตรวจ Bank Statement และ OD limit', category: 'Cash', detail: `${account.name} balance ${account.thbEquivalent.toLocaleString('th-TH')}`, fixHref: '/finance/bank', icon: '🚨', id: `acc-neg-${String(account.id)}`, severity: 'critical', title: `บัญชีติดลบ: ${account.name}` }))
  if (cash.reduce((sum, account) => sum + account.thbEquivalent, 0) < 100000) push({ action: 'ตรวจ cash position และรายการรับ/จ่ายระยะสั้น', category: 'Cash', detail: 'เงินสด/ธนาคารรวมต่ำกว่า 100,000 บาท', fixHref: '/cash-others-summary', icon: '⚠', id: 'cash-low-total', severity: 'warn', title: 'เงินสดต่ำ' })

  salesBills.filter((bill) => activeStatus(bill.status)).forEach((bill) => {
    const receivable = toNumber(bill.receivable_balance)
    const dueDate = bill.due_date ?? addDays(bill.date, bill.credit_term ?? bill.customers?.credit_term ?? 0)
    const overdue = daysBetween(dueDate, asOf)
    if (receivable > 0 && overdue > 90) push({ action: 'ติดตามรับเงินและตรวจเครดิตเทอม', category: 'AR', detail: `${bill.doc_no} เกินกำหนด ${overdue} วัน · ${receivable.toLocaleString('th-TH')}`, fixHref: '/finance/ar', icon: '🚨', id: `ar-overdue-${bill.id}`, severity: 'critical', title: `ลูกหนี้ค้างเกิน 90 วัน: ${bill.doc_no}` })
    const total = toNumber(bill.total_amount)
    const cogs = toNumber(bill.cogs_amount || bill.total_cost)
    if (total > 0 && cogs > 0 && total - cogs < 0) push({ action: 'ตรวจราคาขาย ต้นทุน และ WAC', category: 'Sales', detail: `${bill.doc_no} ขาย ${total.toLocaleString('th-TH')} ต้นทุน ${cogs.toLocaleString('th-TH')}`, fixHref: '/profit-cost-analysis', icon: '🚨', id: `margin-neg-${bill.id}`, severity: 'critical', title: `บิลขายขาดทุน: ${bill.doc_no}` })
    if (bill.date > addDays(asOf, 1)) push({ action: 'ตรวจวันที่บิลขาย', category: 'Date', detail: `${bill.doc_no} วันที่ ${toDateOnly(bill.date)}`, fixHref: '/sales/bills', icon: '⚠', id: `sb-future-${bill.id}`, severity: 'warn', title: `บิลขายวันที่อนาคต: ${bill.doc_no}` })
    if (Array.isArray(bill.items) && bill.items.filter(isJsonItem).length === 0) push({ action: 'ตรวจรายการสินค้าในบิลขาย', category: 'Bill Content', detail: `${bill.doc_no} ไม่มีรายการสินค้า`, fixHref: '/sales/bills', icon: '⚠', id: `sb-empty-${bill.id}`, severity: 'warn', title: `บิลขายไม่มีรายการ: ${bill.doc_no}` })
  })
  purchaseBills.filter((bill) => activeStatus(bill.status)).forEach((bill) => {
    const payable = toNumber(bill.payable_balance)
    const dueDate = addDays(bill.date, 0)
    const overdue = daysBetween(dueDate, asOf)
    if (payable > 0 && overdue > 60) push({ action: 'จัดคิวจ่ายหรือปรับสถานะหนี้หลังตรวจเอกสาร', category: 'AP', detail: `${bill.doc_no} เกินกำหนด ${overdue} วัน · ${payable.toLocaleString('th-TH')}`, fixHref: '/finance/ap', icon: '⚠', id: `ap-overdue-${bill.id}`, severity: overdue > 90 ? 'critical' : 'warn', title: `เจ้าหนี้ค้างจ่าย: ${bill.doc_no}` })
    if (toNumber(bill.paid_amount) - toNumber(bill.total_amount) > 1) push({ action: 'ตรวจ payment allocation และยอดบิลซื้อ', category: 'Bill Math', detail: `${bill.doc_no} จ่าย ${toNumber(bill.paid_amount).toLocaleString('th-TH')} มากกว่ายอดบิล`, fixHref: '/purchase/bills', icon: '🚨', id: `pb-overpaid-${bill.id}`, severity: 'critical', title: `บิลซื้อจ่ายเกิน: ${bill.doc_no}` })
    if (bill.date > addDays(asOf, 1)) push({ action: 'ตรวจวันที่บิลซื้อ', category: 'Date', detail: `${bill.doc_no} วันที่ ${toDateOnly(bill.date)}`, fixHref: '/purchase/bills', icon: '⚠', id: `pb-future-${bill.id}`, severity: 'warn', title: `บิลซื้อวันที่อนาคต: ${bill.doc_no}` })
    if (purchaseBillItemRows(bill).filter(isJsonItem).reduce((sum, item) => sum + itemAmount(item), 0) === 0) push({ action: 'ตรวจรายการสินค้าและราคาในบิลซื้อ', category: 'Bill Content', detail: `${bill.doc_no} ยอดรายการเป็น 0`, fixHref: '/purchase/bills', icon: '⚠', id: `pb-empty-${bill.id}`, severity: 'warn', title: `บิลซื้อไม่มีรายการ/ราคา: ${bill.doc_no}` })
  })
  const customerNames = new Map<string, number>()
  customers.forEach((customer) => {
    if (!customer.phone && !customer.email) push({ action: 'เพิ่มข้อมูลติดต่อที่ Master Data ลูกค้า', category: 'Master', detail: `${customer.code ?? '-'} · ${customer.name}`, fixHref: '/master-data/customers', icon: 'ℹ', id: `cust-no-contact-${customer.id}`, severity: 'info', title: `ลูกค้าไม่มีข้อมูลติดต่อ: ${customer.name}` })
    const key = customer.name.trim().toLowerCase()
    customerNames.set(key, (customerNames.get(key) ?? 0) + 1)
  })
  customerNames.forEach((count, name) => {
    if (count > 1) push({ action: 'ตรวจ duplicate customer master', category: 'Master', detail: `${name} มี ${count} records`, fixHref: '/master-data/customers', icon: '⚠', id: `cust-dup-${name}`, severity: 'warn', title: `ลูกค้าชื่อซ้ำ: ${name}` })
  })
  const supplierNames = new Map<string, number>()
  suppliers.forEach((supplier) => supplierNames.set(supplier.name.trim().toLowerCase(), (supplierNames.get(supplier.name.trim().toLowerCase()) ?? 0) + 1))
  supplierNames.forEach((count, name) => {
    if (count > 1) push({ action: 'ตรวจ duplicate supplier master', category: 'Master', detail: `${name} มี ${count} records`, fixHref: '/master-data/suppliers', icon: '⚠', id: `sup-dup-${name}`, severity: 'warn', title: `Supplier ชื่อซ้ำ: ${name}` })
  })
  bankRows.filter((row) => !row.ref_id && !row.ref_no && (toNumber(row.amount_in) || toNumber(row.amount_out))).slice(0, 30).forEach((row) => push({ action: 'ผูก ref หรือระบุคำอธิบายที่ตรวจสอบได้', category: 'Cash', detail: `${toDateOnly(row.date)} · ${row.description ?? row.desc ?? '-'} · ${(toNumber(row.amount_in) - toNumber(row.amount_out)).toLocaleString('th-TH')}`, fixHref: '/finance/bank', icon: 'ℹ', id: `bs-orphan-${row.doc_no}`, severity: 'info', title: 'Bank entry ไม่มี ref' }))
  tradingDeals.filter((deal) => activeStatus(deal.status) && !['matched', 'closed'].includes((deal.status ?? '').toLowerCase()) && daysBetween(deal.date, asOf) > 30).forEach((deal) => push({ action: 'เปิด Trading Matching เพื่อตรวจการจับคู่', category: 'Trading', detail: `${deal.deal_no} ค้าง ${daysBetween(deal.date, asOf)} วัน`, fixHref: '/trading/matching', icon: '⚠', id: `trade-stuck-${deal.id}`, severity: 'warn', title: `Trading ค้าง match นาน: ${deal.deal_no}` }))
  const todayPurchases = purchaseBills.filter((bill) => activeStatus(bill.status) && toDateOnly(bill.date) === today).length
  const todaySales = salesBills.filter((bill) => activeStatus(bill.status) && toDateOnly(bill.date) === today).length
  if (asOf.getUTCDay() !== 0 && todayPurchases === 0 && todaySales === 0) push({ action: 'ตรวจว่าลืมบันทึกบิลประจำวันหรือไม่', category: 'Daily', detail: `${today} ยังไม่มีบิลซื้อหรือบิลขาย`, fixHref: '/daily-report', icon: 'ℹ', id: 'no-bill-today', severity: 'info', title: 'วันนี้ยังไม่มีบิลซื้อ-ขาย' })

  const order: Record<Severity, number> = { critical: 0, warn: 1, info: 2 }
  anomalies.sort((a, b) => order[a.severity] - order[b.severity] || a.category.localeCompare(b.category))
  return {
    anomalies,
    asOf: today,
    sourceState: {
      limitations: ['Anomaly Detector เป็น read-only scan; ปุ่มไปแก้เป็น link ไป active Next route เท่านั้น ไม่มี auto-fix/write/posting.'],
      writeActionsEnabled: false,
    },
    stats: {
      byCategory: Array.from(anomalies.reduce((map, item) => {
        map.set(item.category, (map.get(item.category) ?? 0) + 1)
        return map
      }, new Map<string, number>()).entries()).map(([cat, count]) => ({ cat, count })).sort((left, right) => right.count - left.count),
      critical: anomalies.filter((item) => item.severity === 'critical').length,
      info: anomalies.filter((item) => item.severity === 'info').length,
      ruleGroups: new Set(anomalies.map((item) => ruleKeyForStats(item.id))).size,
      total: anomalies.length,
      warn: anomalies.filter((item) => item.severity === 'warn').length,
    },
  }
}

function ruleKeyForStats(id: string) {
  const keys = ['stock-orphan-val', 'stock-neg', 'cust-no-contact', 'pb-overpaid', 'pb-future', 'pb-empty', 'sb-future', 'sb-empty', 'ar-overdue', 'ap-overdue', 'margin-neg', 'acc-neg', 'cash-low', 'cust-dup', 'sup-dup', 'bs-orphan', 'trade-stuck', 'no-bill']
  return keys.find((key) => id === key || id.startsWith(`${key}-`)) ?? (id.split('-').slice(0, -1).join('-') || id)
}
