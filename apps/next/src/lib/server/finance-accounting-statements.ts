import type { Prisma } from '../../../generated/prisma/client'
import { requireBusinessCode } from '@/lib/business-code'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { listActiveAccounts, listActiveBranches, type AccountReferenceRecord } from '@/lib/server/reference-master-cache'

const CANCELLED_STATUSES = ['cancelled', 'void', 'ยกเลิก']

export type PeriodFilter = {
  branchId?: string
  from: Date
  to: Date
  transactionMode?: 'ALL' | 'STOCK' | 'TRADING'
}

export type AsOfFilter = {
  asOf: Date
  branchId?: string
}

type DetailRow = {
  amount: number
  date: string
  description: string
  refNo: string
}

type StatementLine = {
  amount: number
  details?: DetailRow[]
  label: string
  level?: number
  section: string
  tone?: 'default' | 'good' | 'bad' | 'muted' | 'total'
}

type BranchRow = {
  code: string
  id: string
  name: string
}

type SourceState = {
  basis: string
  limitations: string[]
  writeActionsEnabled: false
}

type SalesBillRow = Prisma.sales_billsGetPayload<{
  include: { branches: { select: { code: true; name: true } }; customers: { select: { name: true } } }
}>

type PurchaseBillRow = Prisma.purchase_billsGetPayload<{
  include: { branches: { select: { code: true; name: true } }; suppliers: { select: { name: true } } }
}>

type ExpenseRow = Prisma.expensesGetPayload<{
  include: { branches: { select: { code: true; name: true } }; expense_categories: { select: { name: true } } }
}>

type BankRow = Prisma.bank_statementGetPayload<{
  include: { accounts: { select: { account_no: true; bank_name: true; name: true; type: true } } }
}>

type AssetRow = Prisma.assetsGetPayload<{
  include: { depreciations: true }
}>

type LoanRow = Prisma.loansGetPayload<{
  include: { loan_payments: true; loan_schedules: true }
}>

function dateOnly(date: Date) {
  return toDateOnly(date)
}

function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function notCancelledWhere() {
  return { NOT: { status: { in: CANCELLED_STATUSES } } }
}

function sourceState(extra: string[] = []): SourceState {
  return {
    basis: 'Management/source from operational transactions. Not a statutory GL statement.',
    limitations: [
      'ยังไม่มี GL journal, COA mapping, closing period และ retained earnings roll-forward ที่ยืนยันแล้ว',
      'ตัวเลขคำนวณจาก sales/purchase/expense/bank/stock/asset/loan/equity operational tables',
      ...extra,
    ],
    writeActionsEnabled: false,
  }
}

function transactionModeWhere(mode?: string) {
  if (!mode || mode === 'ALL') return {}
  return { transaction_mode: mode }
}

function sumDetails(rows: DetailRow[]) {
  return rows.reduce((sum, row) => sum + row.amount, 0)
}

function moneyLine(section: string, label: string, amount: number, details?: DetailRow[], tone?: StatementLine['tone'], level = 0): StatementLine {
  return { amount, details, label, level, section, tone }
}

function branchRow(branch: { code?: string | null; id: string | bigint; name: string }): BranchRow {
  const code = requireBusinessCode(branch.code, `สาขา ${branch.id}`)
  return { code, id: code, name: branch.name }
}

function cachedMoney(value: string | null) {
  return value == null ? 0 : Number(value)
}

function bankRef(row: BankRow) {
  return row.ref_no || row.ref_type || `${row.accounts?.account_no ?? row.accounts?.name ?? 'BANK'}-${dateOnly(row.date)}`
}

function isInternalTransfer(row: BankRow) {
  const text = [row.ref_type, row.cash_flow_category, row.description, row.desc, row.note].filter(Boolean).join(' ').toLowerCase()
  return text.includes('transfer') || text.includes('internal') || text.includes('โอนระหว่าง')
}

function classifyCashFlow(row: BankRow): 'operating' | 'investing' | 'financing' {
  const text = [row.cash_flow_category, row.ref_type, row.description, row.desc, row.note].filter(Boolean).join(' ').toLowerCase()
  if (text.includes('invest') || text.includes('asset') || text.includes('fixed')) return 'investing'
  if (text.includes('financ') || text.includes('loan') || text.includes('equity') || text.includes('capital')) return 'financing'
  return 'operating'
}

async function listBranches() {
  const branches = await listActiveBranches()
  return branches.map(branchRow)
}

async function loadPlInputs(filter: PeriodFilter) {
  const dateWhere = { gte: filter.from, lte: filter.to }
  const branch = filter.branchId ? await findActiveBranchReferenceByCodeOrId(filter.branchId) : null
  const branchWhere = branch?.id != null ? { branch_id: branch.id } : {}
  return Promise.all([
    prisma.sales_bills.findMany({
      include: { branches: { select: { code: true, name: true } }, customers: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      take: 20000,
      where: { ...notCancelledWhere(), ...branchWhere, ...transactionModeWhere(filter.transactionMode), date: dateWhere },
    }),
    prisma.expenses.findMany({
      include: { branches: { select: { code: true, name: true } }, expense_categories: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      take: 20000,
      where: { ...notCancelledWhere(), ...branchWhere, date: dateWhere },
    }),
    prisma.depreciations.findMany({
      include: { assets: { select: { branch_id: true, code: true, name: true } } },
      orderBy: [{ date: 'asc' }],
      take: 10000,
      where: { date: dateWhere, ...(branch?.id != null ? { assets: { branch_id: branch.id } } : {}) },
    }),
    prisma.loan_payments.findMany({
      include: { loans: { select: { contract_no: true, lender_name: true } } },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      take: 10000,
      where: { ...notCancelledWhere(), date: dateWhere },
    }),
    prisma.fx_gain_loss.findMany({
      orderBy: [{ date: 'asc' }],
      take: 10000,
      where: { date: dateWhere },
    }),
    listBranches(),
  ])
}

export async function buildPlStatement(filter: PeriodFilter) {
  const [salesBillsRaw, expensesRaw, depreciationsRaw, loanPayments, fxRows, branches] = await loadPlInputs(filter)
  const salesBills = salesBillsRaw as SalesBillRow[]
  const expenses = expensesRaw as ExpenseRow[]
  const depreciations = depreciationsRaw as Array<Prisma.depreciationsGetPayload<{ include: { assets: { select: { branch_id: true; code: true; name: true } } } }>>
  type DepreciationRow = (typeof depreciations)[number]
  type LoanPaymentRow = (typeof loanPayments)[number]
  type FxGainLossRow = (typeof fxRows)[number]
  const salesDetails = salesBills.map((bill: SalesBillRow) => ({
    amount: toNumber(bill.subtotal) || toNumber(bill.total_amount) - toNumber(bill.vat_amount),
    date: dateOnly(bill.date),
    description: bill.customers?.name ?? bill.branches?.name ?? '-',
    refNo: bill.doc_no,
  }))
  const cogsDetails = salesBills.map((bill: SalesBillRow) => ({
    amount: toNumber(bill.cogs_amount) || toNumber(bill.total_cost),
    date: dateOnly(bill.date),
    description: `${bill.transaction_mode ?? 'STOCK'} · ${bill.customers?.name ?? '-'}`,
    refNo: bill.doc_no,
  })).filter((row) => row.amount > 0)
  const expenseDetails = expenses.map((expense: ExpenseRow) => ({
    amount: toNumber(expense.net_amount) || toNumber(expense.amount),
    date: dateOnly(expense.date),
    description: expense.expense_categories?.name ?? expense.payee ?? '-',
    refNo: expense.doc_no,
  }))
  const depreciationDetails = depreciations.map((dep: DepreciationRow) => ({
    amount: toNumber(dep.amount),
    date: dateOnly(dep.date),
    description: dep.assets?.name ?? '-',
    refNo: dep.assets?.code ?? `DEP-${dateOnly(dep.date)}`,
  }))
  const interestDetails = loanPayments.map((payment: LoanPaymentRow) => ({
    amount: toNumber(payment.interest_amount),
    date: dateOnly(payment.date),
    description: payment.loans?.lender_name ?? '-',
    refNo: payment.doc_no || payment.loans?.contract_no || '-',
  })).filter((row: DetailRow) => row.amount > 0)
  const fxDetails = fxRows.map((row: FxGainLossRow) => ({
    amount: toNumber(row.gain_loss),
    date: dateOnly(row.date),
    description: [row.currency, row.ref_type].filter(Boolean).join(' · ') || '-',
    refNo: row.notes || `FX-${dateOnly(row.date)}`,
  })).filter((row: DetailRow) => row.amount !== 0)

  const revenue = sumDetails(salesDetails)
  const cogs = sumDetails(cogsDetails)
  const expensesTotal = sumDetails(expenseDetails)
  const depreciation = sumDetails(depreciationDetails)
  const interest = sumDetails(interestDetails)
  const fxNet = sumDetails(fxDetails)
  const grossProfit = revenue - cogs
  const operatingExpenses = expensesTotal + depreciation
  const operatingProfit = grossProfit - operatingExpenses
  const netProfitBeforeTax = operatingProfit - interest + fxNet
  const stockRevenue = salesBills.filter((bill) => bill.transaction_mode !== 'TRADING').reduce((sum, bill) => sum + (toNumber(bill.subtotal) || toNumber(bill.total_amount) - toNumber(bill.vat_amount)), 0)
  const tradingRevenue = salesBills.filter((bill) => bill.transaction_mode === 'TRADING').reduce((sum, bill) => sum + (toNumber(bill.subtotal) || toNumber(bill.total_amount) - toNumber(bill.vat_amount)), 0)

  return {
    branches,
    filters: {
      branchId: filter.branchId ?? 'ALL',
      from: dateOnly(filter.from),
      to: dateOnly(filter.to),
      transactionMode: filter.transactionMode ?? 'ALL',
    },
    sections: [
      moneyLine('revenue', 'Revenue / รายได้จาก Sales Bills', revenue, salesDetails, 'good'),
      moneyLine('cogs', 'COGS (WAC) / ต้นทุนขาย', -cogs, cogsDetails, 'bad'),
      moneyLine('grossProfit', 'Gross Profit / กำไรขั้นต้น', grossProfit, undefined, 'total'),
      moneyLine('opex', 'Operating Expenses / ค่าใช้จ่ายดำเนินงาน', -expensesTotal, expenseDetails, 'bad'),
      moneyLine('opex', 'Depreciation Expense / ค่าเสื่อมราคา', -depreciation, depreciationDetails, 'bad', 1),
      moneyLine('opex', 'Total Operating Expenses', -operatingExpenses, undefined, 'total'),
      moneyLine('operatingProfit', 'Operating Profit', operatingProfit, undefined, 'total'),
      moneyLine('finance', 'Interest Expense / ดอกเบี้ยจ่าย', -interest, interestDetails, 'bad'),
      moneyLine('finance', 'Realized FX Gain/(Loss)', fxNet, fxDetails, fxNet >= 0 ? 'good' : 'bad'),
      moneyLine('net', 'Net Profit Before Tax / กำไรก่อนภาษี', netProfitBeforeTax, undefined, 'total'),
    ],
    sourceState: sourceState(['Revenue ใช้ subtotal ก่อน VAT เมื่อมีข้อมูล ไม่รวมการปิดงวดภาษี', 'Interest ใช้ loan payments cash-basis ในช่วงวันที่']),
    split: {
      stock: { cogs: salesBills.filter((bill) => bill.transaction_mode !== 'TRADING').reduce((sum, bill) => sum + (toNumber(bill.cogs_amount) || toNumber(bill.total_cost)), 0), revenue: stockRevenue },
      trading: { cogs: salesBills.filter((bill) => bill.transaction_mode === 'TRADING').reduce((sum, bill) => sum + (toNumber(bill.cogs_amount) || toNumber(bill.total_cost)), 0), revenue: tradingRevenue },
    },
    summary: {
      cogs,
      depreciation,
      expenses: expensesTotal,
      fxNet,
      grossProfit,
      interest,
      netProfitBeforeTax,
      operatingProfit,
      revenue,
    },
  }
}

async function loadBalanceSheetInputs(filter: AsOfFilter) {
  const asOf = endOfDay(filter.asOf)
  const branch = filter.branchId ? await findActiveBranchReferenceByCodeOrId(filter.branchId) : null
  const branchWhere = branch?.id != null ? { branch_id: branch.id } : {}
  const accounts = (await listActiveAccounts()).filter((account: AccountReferenceRecord) => branch?.id == null || account.branchId === branch.id)
  return Promise.all([
    Promise.resolve(accounts),
    prisma.bank_statement.findMany({
      include: { accounts: { select: { account_no: true, bank_name: true, name: true, type: true } } },
      orderBy: [{ account_id: 'asc' }, { date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      take: 30000,
      where: { date: { lte: asOf }, ...(branch?.id != null ? { accounts: { branch_id: branch.id } } : {}) },
    }),
    prisma.sales_bills.findMany({
      include: { branches: { select: { code: true, name: true } }, customers: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      take: 20000,
      where: { ...notCancelledWhere(), ...branchWhere, date: { lte: asOf } },
    }),
    prisma.purchase_bills.findMany({
      include: { branches: { select: { code: true, name: true } }, suppliers: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      take: 20000,
      where: { ...notCancelledWhere(), ...branchWhere, date: { lte: asOf } },
    }),
    prisma.stock_ledger.findMany({
      orderBy: [{ date: 'asc' }, { ref_no: 'asc' }],
      take: 30000,
      where: { ...branchWhere, date: { lte: asOf } },
    }),
    prisma.assets.findMany({
      include: { depreciations: { where: { date: { lte: asOf } } } },
      orderBy: [{ code: 'asc' }],
      take: 10000,
      where: { ...(branch?.id != null ? { branch_id: branch.id } : {}) },
    }),
    prisma.loans.findMany({
      include: { loan_payments: { where: { date: { lte: asOf } } }, loan_schedules: true },
      orderBy: [{ contract_no: 'asc' }],
      take: 10000,
    }),
    prisma.equity.findFirst({ orderBy: { updated_at: 'desc' } }),
    listBranches(),
  ])
}

export async function buildBalanceSheet(filter: AsOfFilter) {
  const [accountsRaw, bankRowsRaw, salesBillsRaw, purchaseBillsRaw, stockRows, assetsRaw, loans, equity, branches] = await loadBalanceSheetInputs(filter)
  const accounts = accountsRaw as AccountReferenceRecord[]
  const bankRows = bankRowsRaw as BankRow[]
  const salesBills = salesBillsRaw as SalesBillRow[]
  const purchaseBills = purchaseBillsRaw as PurchaseBillRow[]
  const assets = assetsRaw as AssetRow[]
  const balances = new Map<bigint, number>()
  accounts.forEach((account: AccountReferenceRecord) => balances.set(account.id, cachedMoney(account.openingBalance)))
  bankRows.forEach((row: BankRow) => {
    if (!row.account_id) return
    const previous = balances.get(row.account_id) ?? 0
    const next = row.balance === null || row.balance === undefined ? previous + toNumber(row.amount_in) - toNumber(row.amount_out) : toNumber(row.balance)
    balances.set(row.account_id, next)
  })
  const cashDetails = accounts.map((account: AccountReferenceRecord) => ({
    amount: balances.get(account.id) ?? 0,
    date: dateOnly(filter.asOf),
    description: [account.bankName ?? account.bank, account.name, account.accountNo].filter(Boolean).join(' · '),
    refNo: account.accountNo || account.name,
  }))
  const cash = sumDetails(cashDetails)
  const arDetails = salesBills.map((bill: SalesBillRow) => ({
    amount: Math.max(0, toNumber(bill.receivable_balance) || (toNumber(bill.total_amount) - toNumber(bill.received_amount))),
    date: dateOnly(bill.date),
    description: bill.customers?.name ?? '-',
    refNo: bill.doc_no,
  })).filter((row) => row.amount > 0)
  const apDetails = purchaseBills.map((bill: PurchaseBillRow) => ({
    amount: Math.max(0, toNumber(bill.payable_balance) || (toNumber(bill.total_amount) - toNumber(bill.paid_amount))),
    date: dateOnly(bill.date),
    description: bill.suppliers?.name ?? '-',
    refNo: bill.doc_no,
  })).filter((row) => row.amount > 0)
  type StockLedgerRow = (typeof stockRows)[number]
  const inventoryDetails = stockRows.map((row: StockLedgerRow) => ({
    amount: toNumber(row.value_in) - toNumber(row.value_out),
    date: dateOnly(row.date),
    description: row.movement_type,
    refNo: row.ref_no || row.ref_type || `STOCK-${dateOnly(row.date)}`,
  })).filter((row: DetailRow) => row.amount !== 0)
  const fixedAssetDetails = assets.map((asset: AssetRow) => {
    const cost = toNumber(asset.net_asset_cost) || (toNumber(asset.original_cost) - toNumber(asset.vat_amount))
    const accumDep = asset.depreciations.reduce((sum: number, dep: AssetRow['depreciations'][number]) => sum + toNumber(dep.amount), 0)
    return {
      amount: Math.max(toNumber(asset.salvage_value), cost - accumDep),
      date: asset.purchase_date ? dateOnly(asset.purchase_date) : dateOnly(filter.asOf),
      description: asset.name,
      refNo: asset.code,
    }
  }).filter((row: DetailRow) => row.amount > 0)
  const fixedCost = assets.reduce((sum, asset) => sum + (toNumber(asset.net_asset_cost) || (toNumber(asset.original_cost) - toNumber(asset.vat_amount))), 0)
  const accumulatedDep = assets.reduce((sum: number, asset: AssetRow) => sum + asset.depreciations.reduce((depSum: number, dep: AssetRow['depreciations'][number]) => depSum + toNumber(dep.amount), 0), 0)
  const loanDetails = loans.map((loan: LoanRow) => {
    const paidPrincipal = loan.loan_payments.reduce((sum: number, payment: LoanRow['loan_payments'][number]) => sum + toNumber(payment.principal_amount), 0)
    return {
      amount: Math.max(0, toNumber(loan.principal_amount) - paidPrincipal),
      date: loan.start_date ? dateOnly(loan.start_date) : dateOnly(filter.asOf),
      description: loan.lender_name ?? loan.loan_type,
      refNo: loan.contract_no,
    }
  }).filter((row: DetailRow) => row.amount > 0)
  const currentLimit = addMonths(filter.asOf, 12)
  const currentLoan = loans.reduce((sum: number, loan: LoanRow) => sum + loan.loan_schedules.filter((schedule: LoanRow['loan_schedules'][number]) => schedule.due_date <= currentLimit && schedule.payment_status !== 'Paid').reduce((scheduleSum: number, schedule: LoanRow['loan_schedules'][number]) => scheduleSum + Math.max(0, toNumber(schedule.principal_amount) - toNumber(schedule.paid_amount)), 0), 0)
  const totalLoan = sumDetails(loanDetails)
  const longTermLoan = Math.max(0, totalLoan - currentLoan)
  const ar = sumDetails(arDetails)
  const ap = sumDetails(apDetails)
  const inventory = sumDetails(inventoryDetails)
  const fixedAssetNet = sumDetails(fixedAssetDetails)
  const paidUpCapital = toNumber(equity?.paid_up_capital)
  const retainedEarnings = toNumber(equity?.retained_earnings)
  const ownerAdjustment = toNumber(equity?.owner_equity_adjustment)
  const currentYearPl = 0
  const totalAssets = cash + ar + inventory + fixedAssetNet
  const totalLiabilities = ap + currentLoan + longTermLoan
  const totalEquity = paidUpCapital + retainedEarnings + ownerAdjustment + currentYearPl
  const liabilitiesAndEquity = totalLiabilities + totalEquity

  return {
    branches,
    filters: { asOf: dateOnly(filter.asOf), branchId: filter.branchId ?? 'ALL' },
    sections: {
      assets: [
        moneyLine('currentAssets', 'Cash and Bank', cash, cashDetails, 'good'),
        moneyLine('currentAssets', 'Accounts Receivable', ar, arDetails, 'default'),
        moneyLine('currentAssets', 'Inventory (WAC ledger value)', inventory, inventoryDetails, 'default'),
        moneyLine('nonCurrentAssets', 'Fixed Assets at Cost', fixedCost, fixedAssetDetails, 'default'),
        moneyLine('nonCurrentAssets', 'Accumulated Depreciation', -accumulatedDep, undefined, 'bad', 1),
        moneyLine('nonCurrentAssets', 'Net Fixed Assets', fixedAssetNet, fixedAssetDetails, 'total'),
      ],
      equity: [
        moneyLine('equity', 'Paid-up Capital', paidUpCapital, undefined, 'default'),
        moneyLine('equity', 'Retained Earnings', retainedEarnings, undefined, 'default'),
        moneyLine('equity', 'Owner Adjustment', ownerAdjustment, undefined, ownerAdjustment >= 0 ? 'good' : 'bad'),
        moneyLine('equity', 'Current Year P&L', currentYearPl, undefined, 'muted'),
      ],
      liabilities: [
        moneyLine('currentLiabilities', 'Accounts Payable', ap, apDetails, 'bad'),
        moneyLine('currentLiabilities', 'Current Portion of Loan', currentLoan, loanDetails, 'bad'),
        moneyLine('nonCurrentLiabilities', 'Long-term Loan / Leasing', longTermLoan, loanDetails, 'bad'),
      ],
    },
    sourceState: sourceState(['Current Year P&L is not rolled into retained earnings until GL/closing-period design is confirmed']),
    summary: {
      ar,
      ap,
      cash,
      currentLoan,
      fixedAssetNet,
      inventory,
      liabilitiesAndEquity,
      longTermLoan,
      totalAssets,
      totalEquity,
      totalLiabilities,
    },
    balanceCheck: {
      balanced: Math.abs(totalAssets - liabilitiesAndEquity) < 0.01,
      difference: totalAssets - liabilitiesAndEquity,
    },
    ratios: {
      currentRatio: totalLiabilities > 0 ? (cash + ar + inventory) / (ap + currentLoan || 1) : 0,
      debtToEquity: totalEquity > 0 ? totalLiabilities / totalEquity : 0,
      workingCapital: cash + ar + inventory - ap - currentLoan,
    },
  }
}

export async function buildCashFlowStatement(filter: PeriodFilter) {
  const fromStart = filter.from
  const toEnd = endOfDay(filter.to)
  const branch = filter.branchId ? await findActiveBranchReferenceByCodeOrId(filter.branchId) : null
  const accountWhere = branch?.id != null ? { accounts: { branch_id: branch.id } } : {}
  const [accountsRaw, beforeRowsRaw, periodRowsRaw, branches] = await Promise.all([
    listActiveAccounts().then((rows) => rows.filter((account: AccountReferenceRecord) => branch?.id == null || account.branchId === branch.id)),
    prisma.bank_statement.findMany({
      include: { accounts: { select: { account_no: true, bank_name: true, name: true, type: true } } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      take: 30000,
      where: { ...accountWhere, date: { lt: fromStart } },
    }),
    prisma.bank_statement.findMany({
      include: { accounts: { select: { account_no: true, bank_name: true, name: true, type: true } } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      take: 30000,
      where: { ...accountWhere, date: { gte: fromStart, lte: toEnd } },
    }),
    listBranches(),
  ])
  const accounts = accountsRaw.filter((account: AccountReferenceRecord) => branch?.id == null || account.branchId === branch.id)
  const beforeRows = beforeRowsRaw as BankRow[]
  const periodRows = periodRowsRaw as BankRow[]
  const openingCash = accounts.reduce((sum: number, account: AccountReferenceRecord) => sum + cachedMoney(account.openingBalance), 0) + beforeRows.reduce((sum, row) => sum + toNumber(row.amount_in) - toNumber(row.amount_out), 0)
  const activityRows = periodRows.filter((row: BankRow) => !isInternalTransfer(row)).map((row: BankRow) => {
    const inflow = toNumber(row.amount_in)
    const outflow = toNumber(row.amount_out)
    return {
      amount: inflow - outflow,
      category: classifyCashFlow(row),
      date: dateOnly(row.date),
      description: row.description || row.desc || row.accounts?.name || '-',
      inflow,
      outflow,
      refNo: bankRef(row),
    }
  })
  const internalTransfers = periodRows.filter((row: BankRow) => isInternalTransfer(row)).reduce((sum, row) => sum + Math.abs(toNumber(row.amount_in) - toNumber(row.amount_out)), 0)
  const byCategory = (category: 'operating' | 'investing' | 'financing') => {
    const rows = activityRows.filter((row) => row.category === category)
    return {
      inflow: rows.reduce((sum, row) => sum + row.inflow, 0),
      net: rows.reduce((sum, row) => sum + row.amount, 0),
      outflow: rows.reduce((sum, row) => sum + row.outflow, 0),
      rows,
    }
  }
  const operating = byCategory('operating')
  const investing = byCategory('investing')
  const financing = byCategory('financing')
  const netChange = operating.net + investing.net + financing.net
  const endingCash = openingCash + netChange

  return {
    activities: { financing, investing, operating },
    branches,
    filters: { branchId: filter.branchId ?? 'ALL', from: dateOnly(filter.from), method: 'direct', to: dateOnly(filter.to) },
    rows: [
      moneyLine('operating', 'Operating Activities - Cash In', operating.inflow, operating.rows.filter((row) => row.inflow > 0), 'good'),
      moneyLine('operating', 'Operating Activities - Cash Out', -operating.outflow, operating.rows.filter((row) => row.outflow > 0), 'bad'),
      moneyLine('operating', 'Net Cash from Operating Activities', operating.net, undefined, 'total'),
      moneyLine('investing', 'Net Cash from Investing Activities', investing.net, investing.rows, investing.net >= 0 ? 'good' : 'bad'),
      moneyLine('financing', 'Net Cash from Financing Activities', financing.net, financing.rows, financing.net >= 0 ? 'good' : 'bad'),
      moneyLine('summary', 'Net Increase/(Decrease) in Cash', netChange, undefined, 'total'),
      moneyLine('summary', 'Beginning Cash Balance', openingCash, undefined, 'muted'),
      moneyLine('summary', 'Ending Cash Balance', endingCash, undefined, 'total'),
    ],
    sourceState: sourceState(['Direct method from bank_statement amount_in/amount_out', 'Internal transfers are excluded from activity totals']),
    summary: {
      endingCash,
      financing: financing.net,
      internalTransfers,
      investing: investing.net,
      netChange,
      operating: operating.net,
      openingCash,
      totalInflow: operating.inflow + investing.inflow + financing.inflow,
      totalOutflow: operating.outflow + investing.outflow + financing.outflow,
    },
  }
}
