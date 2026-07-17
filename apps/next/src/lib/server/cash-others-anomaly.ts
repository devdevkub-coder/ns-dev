import { toDateOnly, toNumber } from '@/lib/server/daily'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { prisma } from '@/lib/server/prisma'
import { listActiveAccounts, type AccountReferenceRecord } from '@/lib/server/reference-master-cache'

function endOfDay(date: Date) {
  return new Date(`${toDateOnly(date)}T23:59:59.999Z`)
}

function activeStatus(status?: string | null) {
  return !['cancelled', 'void', 'reversed'].includes((status ?? '').toLowerCase())
}

function branchWhere(branchIds: bigint[] | null) {
  return branchIds === null ? {} : { branch_id: { in: branchIds } }
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

function cachedMoney(value: string | null) {
  return value == null ? 0 : Number(value)
}

type CashAccountReference = Pick<AccountReferenceRecord, 'accountNo' | 'code' | 'currency' | 'id' | 'name' | 'openingBalance' | 'type'>

async function loadCashAccounts(branchIds: bigint[] | null): Promise<CashAccountReference[]> {
  if (branchIds === null) return listActiveAccounts()
  const rows = await prisma.accounts.findMany({
    orderBy: [{ type: 'asc' }, { name: 'asc' }, { account_no: 'asc' }],
    select: { account_no: true, code: true, currency: true, id: true, name: true, opening_balance: true, type: true },
    where: { active: { not: false }, ...branchWhere(branchIds) },
  })
  return rows.map((row) => ({
    accountNo: row.account_no ?? null,
    code: row.code,
    currency: row.currency ?? null,
    id: row.id,
    name: row.name,
    openingBalance: row.opening_balance?.toString() ?? null,
    type: row.type,
  }))
}

async function accountBalances(asOf: Date, branchIds: bigint[] | null) {
  const accounts = [...await loadCashAccounts(branchIds)]
    .sort((left: CashAccountReference, right: CashAccountReference) => {
      const typeOrder = left.type.localeCompare(right.type)
      if (typeOrder !== 0) return typeOrder
      const nameOrder = left.name.localeCompare(right.name)
      if (nameOrder !== 0) return nameOrder
      return (left.accountNo ?? '').localeCompare(right.accountNo ?? '')
    })
  const accountIds = accounts.map((account: CashAccountReference) => account.id)
  const bankRows = branchIds !== null
    ? await prisma.bank_statement.findMany({
        orderBy: [{ account_id: 'asc' }, { date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
        take: 60000,
        where: { accounts: { branch_id: { in: branchIds } }, date: { lte: endOfDay(asOf) } },
      })
    : accountIds.length > 0
    ? await prisma.bank_statement.findMany({
        orderBy: [{ account_id: 'asc' }, { date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
        take: 60000,
        where: { account_id: { in: accountIds }, date: { lte: endOfDay(asOf) } },
      })
      : []
  const balances = new Map<bigint, number>()
  accounts.forEach((account: CashAccountReference) => balances.set(account.id, cachedMoney(account.openingBalance)))
  bankRows.forEach((row: (typeof bankRows)[number]) => {
    if (!row.account_id) return
    const previous = balances.get(row.account_id) ?? 0
    balances.set(row.account_id, row.balance === null || row.balance === undefined ? previous + toNumber(row.amount_in) - toNumber(row.amount_out) : toNumber(row.balance))
  })
  return accounts.map((account: CashAccountReference) => {
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

async function resolveBranchIds(branchIdValue?: string | null, allowedBranchCodes?: string[] | null) {
  const allowedCodes = allowedBranchCodes === undefined || allowedBranchCodes === null
    ? null
    : [...new Set(allowedBranchCodes.map((code) => code.trim().toUpperCase()).filter(Boolean))]
  const selected = branchIdValue ? await findActiveBranchReferenceByCodeOrId(branchIdValue) : null
  if (branchIdValue) {
    if (!selected || (allowedCodes !== null && !allowedCodes.includes(selected.code.toUpperCase()))) return []
    return [selected.id]
  }
  if (allowedCodes === null) return null
  if (allowedCodes.length === 0) return []
  const branches = await prisma.branches.findMany({
    select: { id: true },
    where: { active: true, code: { in: allowedCodes } },
  })
  return branches.map((branch) => branch.id)
}

export async function buildCashOthersSummary(
  asOfValue?: string | null,
  branchIdValue?: string | null,
  allowedBranchCodes?: string[] | null,
) {
  const asOf = asOfValue && /^\d{4}-\d{2}-\d{2}$/.test(asOfValue) ? new Date(`${asOfValue}T00:00:00.000Z`) : new Date()
  const branchIds = await resolveBranchIds(branchIdValue, allowedBranchCodes)
  const today = toDateOnly(asOf)
  const [cashAccounts, salesBills, purchaseBills, stockRows, expenses, tradingDeals] = await Promise.all([
    accountBalances(asOf, branchIds),
    prisma.sales_bills.findMany({ include: { customers: true, sales_channels: true }, orderBy: [{ date: 'desc' }], take: 15000, where: { ...branchWhere(branchIds), date: { lte: endOfDay(asOf) } } }),
    prisma.purchase_bills.findMany({ include: { purchase_bill_items: { orderBy: { line_no: 'asc' }, where: { item_status: 'active' } }, suppliers: true }, orderBy: [{ date: 'desc' }], take: 15000, where: { ...branchWhere(branchIds), date: { lte: endOfDay(asOf) } } }),
    prisma.stock_ledger.findMany({ include: { products: true }, orderBy: [{ date: 'desc' }], take: 80000, where: { ...branchWhere(branchIds), date: { lte: endOfDay(asOf) } } }),
    prisma.expenses.findMany({ orderBy: [{ date: 'desc' }], take: 5000, where: { ...branchWhere(branchIds), date: new Date(`${today}T00:00:00.000Z`) } }),
    prisma.trading_deals.findMany({
      orderBy: [{ date: 'desc' }],
      take: 10000,
      where: {
        date: { lte: endOfDay(asOf) },
        ...(branchIds !== null ? { purchase_bills: { branch_id: { in: branchIds } } } : {}),
      },
    }),
  ])
  type CashAccountRow = (typeof cashAccounts)[number]
  type SalesBillRow = (typeof salesBills)[number]
  type PurchaseBillRow = (typeof purchaseBills)[number]
  type StockLedgerRow = (typeof stockRows)[number]
  type ExpenseRow = (typeof expenses)[number]
  type TradingDealRow = (typeof tradingDeals)[number]
  type ArBillRow = { amount: number; bill: SalesBillRow; dueDate: Date; overdueDays: number }
  type ApBillRow = { amount: number; bill: PurchaseBillRow; dueDate: Date; overdueDays: number }

  const activeSales = salesBills.filter((bill: SalesBillRow) => activeStatus(bill.status))
  const activePurchases = purchaseBills.filter((bill: PurchaseBillRow) => activeStatus(bill.status))
  const arBills = activeSales.filter((bill: SalesBillRow) => toNumber(bill.receivable_balance) > 0).map((bill: SalesBillRow): ArBillRow => {
    const dueDate = bill.due_date ?? addDays(bill.date, bill.credit_term ?? bill.customers?.credit_term ?? 0)
    return { amount: toNumber(bill.receivable_balance), bill, dueDate, overdueDays: Math.max(0, daysBetween(dueDate, asOf)) }
  })
  const apBills = activePurchases.filter((bill: PurchaseBillRow) => toNumber(bill.payable_balance) > 0).map((bill: PurchaseBillRow): ApBillRow => {
    const dueDate = addDays(bill.date, 0)
    return { amount: toNumber(bill.payable_balance), bill, dueDate, overdueDays: Math.max(0, daysBetween(dueDate, asOf)) }
  })
  const totalCash = cashAccounts.reduce((sum: number, account: CashAccountRow) => sum + account.thbEquivalent, 0)
  const arDomestic = arBills.filter((row: ArBillRow) => marketScope(row.bill.customers?.market_scope) === 'domestic').reduce((sum: number, row: ArBillRow) => sum + row.amount, 0)
  const arOverseas = arBills.filter((row: ArBillRow) => marketScope(row.bill.customers?.market_scope) === 'overseas').reduce((sum: number, row: ArBillRow) => sum + row.amount, 0)
  const arAging = arBills.reduce((acc: { '1-30': number; '31-60': number; '61-90': number; '90+': number; current: number }, row: ArBillRow) => {
    if (row.overdueDays <= 0) acc.current += row.amount
    else if (row.overdueDays <= 30) acc['1-30'] += row.amount
    else if (row.overdueDays <= 60) acc['31-60'] += row.amount
    else if (row.overdueDays <= 90) acc['61-90'] += row.amount
    else acc['90+'] += row.amount
    return acc
  }, { '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, current: 0 })

  const stock = stockRows.reduce((acc: { qty: number; value: number }, row: StockLedgerRow) => {
    acc.qty += toNumber(row.qty_in) - toNumber(row.qty_out)
    acc.value += toNumber(row.value_in) - toNumber(row.value_out)
    return acc
  }, { qty: 0, value: 0 })
  const totalPurchaseAmount = activePurchases.reduce((sum: number, row: PurchaseBillRow) => sum + toNumber(row.total_amount), 0)
  const paidPurchaseAmount = activePurchases.reduce((sum: number, row: PurchaseBillRow) => sum + toNumber(row.paid_amount), 0)
  const paidRatio = totalPurchaseAmount > 0 ? Math.min(1, paidPurchaseAmount / totalPurchaseAmount) : 1
  const matchedByPurchase = new Map<bigint, number>()
  tradingDeals.filter((deal: TradingDealRow) => activeStatus(deal.status)).forEach((deal: TradingDealRow) => {
    if (!deal.purchase_bill_id) return
    matchedByPurchase.set(deal.purchase_bill_id, (matchedByPurchase.get(deal.purchase_bill_id) ?? 0) + toNumber(deal.matched_purchase_amount))
  })
  const tradingPurchases = activePurchases.filter((bill: PurchaseBillRow) => (bill.transaction_mode ?? '').toUpperCase() === 'TRADING' && toNumber(bill.paid_amount) > 0)
  const tradingPending = tradingPurchases.reduce((acc: { billCount: number; matchedAmount: number; paidAmount: number; pendingAmount: number }, bill: PurchaseBillRow) => {
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

  const totalAR = arBills.reduce((sum: number, row: ArBillRow) => sum + row.amount, 0)
  const totalAP = apBills.reduce((sum: number, row: ApBillRow) => sum + row.amount, 0)
  const apOverdue = apBills.filter((row: ApBillRow) => row.overdueDays > 0).reduce((sum: number, row: ApBillRow) => sum + row.amount, 0)
  const arOverdue = arBills.filter((row: ArBillRow) => row.overdueDays > 0).reduce((sum: number, row: ArBillRow) => sum + row.amount, 0)
  const expenseToday = expenses.filter((expense: ExpenseRow) => activeStatus(expense.status)).reduce((sum: number, expense: ExpenseRow) => sum + toNumber(expense.net_amount || expense.amount), 0)
  const cashNeededToday = apOverdue + expenseToday
  const supplierAdvanceTotal = 0
  const customerAdvanceTotal = 0
  const totalAsset = totalCash + totalAR + stock.value + supplierAdvanceTotal + tradingPending.pendingAmount
  const totalDebt = totalAP + customerAdvanceTotal

  return {
    asOf: today,
    charts: {
      arAging,
      assetComp: [
        { color: '#10b981', name: 'เงินสดและธนาคาร', val: totalCash },
        { color: '#06b6d4', name: 'ลูกหนี้การค้า (AR)', val: totalAR },
        { color: '#f59e0b', name: 'สินค้าคงคลัง', val: stock.value },
        { color: '#a855f7', name: 'รอรับเงินจากการซื้อขาย', val: tradingPending.pendingAmount },
        { color: '#8b5cf6', name: 'เงินจ่ายล่วงหน้าผู้ขาย', val: supplierAdvanceTotal },
      ].filter((row) => row.val > 0),
      debtComp: [
        { color: '#ef4444', name: 'เจ้าหนี้การค้า (AP)', val: totalAP },
        { color: '#f97316', name: 'เงินรับล่วงหน้าลูกค้า', val: customerAdvanceTotal },
      ].filter((row) => row.val > 0),
    },
    rows: {
      cashAccounts,
      receivable: { arDomestic, arOverdue, arOverseas, customerAdvanceTotal, totalAR },
      debt: { apOverdue, customerAdvanceTotal, expenseToday, supplierAdvanceTotal, totalAP },
      stock: { paidVal: stock.value * paidRatio, qty: stock.qty, unpaidVal: stock.value * (1 - paidRatio), val: stock.value },
    },
    sourceState: {
      limitations: ['Cash & Others Summary เป็น management source; customer/supplier advance target tables ยังไม่ยืนยันจึงแสดง 0 และไม่เปิด allocation/write/reclass/export actions.'],
      writeActionsEnabled: false,
    },
    summary: { cashNeededToday, netWorth: totalAsset - totalDebt, totalAsset, totalCash, totalDebt },
    tradingPending,
  }
}
