import { requireBusinessCode } from '@/lib/business-code'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { buildCashFlowAnalysis } from '@/lib/server/finance-accounting-cashflow-planning'
import { buildBalanceSheet, buildPlStatement } from '@/lib/server/finance-accounting-statements'
import { buildStockFinance, buildWorkingCapital } from '@/lib/server/finance-accounting-working-capital'
import { prisma } from '@/lib/server/prisma'
import { listActiveAccounts, listActiveBranches, type AccountReferenceRecord } from '@/lib/server/reference-master-cache'

export type FinancialDashboardFilter = {
  asOf: Date
  branchId?: string
}

function dateOnly(date: Date) {
  return toDateOnly(date)
}

function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function monthLabel(date: Date) {
  return ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][date.getMonth()]
}

function sourceState() {
  return {
    basis: 'Financial Dashboard management source assembled from operational finance helpers. Not a statutory GL dashboard.',
    limitations: [
      'ยังไม่มี GL close/COA/retained earnings roll-forward จึงเป็น management dashboard เท่านั้น',
      'Cash need/inflow reuses AR/AP/loan schedule forecast source from operational documents',
      'No payment, receipt, transfer, financing, reclass, posting, or statutory statement write action is enabled',
    ],
    writeActionsEnabled: false,
  }
}

function cachedMoney(value: string | null) {
  return value == null ? 0 : Number(value)
}

async function cashSplit(asOf: Date, branchId?: string) {
  const branch = branchId ? await findActiveBranchReferenceByCodeOrId(branchId) : null
  const accounts = (await listActiveAccounts()).filter((account: AccountReferenceRecord) => branch?.id == null || account.branchId === branch.id)
  const accountIds = accounts.map((account: AccountReferenceRecord) => account.id)
  const bankRows = accountIds.length === 0
    ? []
    : await prisma.bank_statement.findMany({
      orderBy: [{ account_id: 'asc' }, { date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      take: 30000,
      where: { account_id: { in: accountIds }, date: { lte: endOfDay(asOf) } },
    })
  const balances = new Map<bigint, number>()
  accounts.forEach((account: AccountReferenceRecord) => balances.set(account.id, cachedMoney(account.openingBalance)))
  bankRows.forEach((row: (typeof bankRows)[number]) => {
    if (!row.account_id) return
    const previous = balances.get(row.account_id) ?? 0
    balances.set(row.account_id, row.balance === null || row.balance === undefined ? previous + toNumber(row.amount_in) - toNumber(row.amount_out) : toNumber(row.balance))
  })
  const byKind = accounts.reduce((acc, account: AccountReferenceRecord) => {
    const balance = balances.get(account.id) ?? 0
    const type = [account.type, account.name, account.bankName, account.bank].filter(Boolean).join(' ').toLowerCase()
    if (type.includes('od')) {
      acc.odUsed += Math.max(0, -balance)
      acc.odLimit += cachedMoney(account.odLimit)
    } else if (type.includes('fcd') || type.includes('foreign')) {
      acc.fcdBalance += balance
    } else if (type.includes('cash') || type.includes('เงินสด')) {
      acc.cashBalance += balance
    } else {
      acc.bankBalance += balance
    }
    return acc
  }, { bankBalance: 0, cashBalance: 0, fcdBalance: 0, odLimit: 0, odUsed: 0 })
  return { ...byKind, cashAndBank: byKind.cashBalance + byKind.bankBalance + byKind.fcdBalance, odAvailable: Math.max(0, byKind.odLimit - byKind.odUsed) }
}

async function unbilledDeliveryCost(asOf: Date, branchId?: string) {
  const branch = branchId ? await findActiveBranchReferenceByCodeOrId(branchId) : null
  const asOfEnd = endOfDay(asOf)
  const result = await prisma.stock_holds.aggregate({
    _sum: { value_snapshot: true },
    where: {
      source_type: 'WTO',
      held_at: { lte: asOfEnd },
      ...(branch?.id != null ? { branch_id: branch.id } : {}),
      OR: [{ consumed_at: null }, { consumed_at: { gt: asOfEnd } }],
      AND: [
        { OR: [{ released_at: null }, { released_at: { gt: asOfEnd } }] },
        { OR: [{ cancelled_at: null }, { cancelled_at: { gt: asOfEnd } }] },
      ],
    },
  })
  return toNumber(result._sum.value_snapshot)
}

export async function buildFinancialDashboard(filter: FinancialDashboardFilter) {
  const asOf = filter.asOf
  const currentMonthStart = monthStart(asOf)
  const last30Start = addDays(asOf, -29)
  const [branches, balanceSheet, monthPl, cashAnalysis, workingCapital, stockFinance, split, pendingDeliveryCost, monthlyPL] = await Promise.all([
    listActiveBranches(),
    buildBalanceSheet({ asOf, branchId: filter.branchId }),
    buildPlStatement({ branchId: filter.branchId, from: currentMonthStart, to: asOf, transactionMode: 'ALL' }),
    buildCashFlowAnalysis({ branchId: filter.branchId, from: currentMonthStart, to: asOf }),
    buildWorkingCapital({ asOf, branchId: filter.branchId, periodDays: 90 }),
    buildStockFinance({ asOf, branchId: filter.branchId, periodDays: 90 }),
    cashSplit(asOf, filter.branchId),
    unbilledDeliveryCost(asOf, filter.branchId),
    Promise.all(Array.from({ length: 6 }, (_, index) => {
      const start = addMonths(currentMonthStart, index - 5)
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
      return buildPlStatement({ branchId: filter.branchId, from: start, to: end < asOf ? end : asOf, transactionMode: 'ALL' }).then((pl) => ({
        cogs: pl.summary.cogs,
        exp: pl.summary.expenses + pl.summary.depreciation + pl.summary.interest,
        label: monthLabel(start),
        np: pl.summary.netProfitBeforeTax,
        rev: pl.summary.revenue,
      }))
    })),
  ])
  const assets = balanceSheet.summary.totalAssets
  const liabilities = balanceSheet.summary.totalLiabilities
  const equity = assets - liabilities
  const avgDailyOut = cashAnalysis.summary.burnRate || ((monthPl.summary.expenses + monthPl.summary.interest) / Math.max(1, Math.ceil((asOf.getTime() - last30Start.getTime()) / 86_400_000)))
  const runway = avgDailyOut > 0 ? split.cashAndBank / avgDailyOut : 999
  const cashNeedToday = 0
  const cashInToday = 0
  const cashNeed7 = cashAnalysis.summary.cashOut7
  const cashNeed30 = cashAnalysis.summary.cashOut30
  const cashIn7 = cashAnalysis.summary.cashIn7
  const cashIn30 = cashAnalysis.summary.cashIn30
  const netCashPos30 = split.cashAndBank + cashIn30 - cashNeed30
  const assetComp = [
    { color: '#10b981', name: '💵 Cash & Bank', value: split.cashAndBank },
    { color: '#06b6d4', name: '📥 ลูกหนี้ (AR)', value: balanceSheet.summary.ar },
    { color: '#f59e0b', name: '📦 Stock', value: balanceSheet.summary.inventory },
    { color: '#8b5cf6', name: '🏗 Fixed Asset', value: balanceSheet.summary.fixedAssetNet },
  ].filter((row) => row.value > 0)

  return {
    assetComp,
    branches: branches.map((branch) => {
      const code = requireBusinessCode(branch.code, `สาขา ${branch.id}`)
      return { code, id: code, name: branch.name }
    }),
    cashPeriods: [
      { cashIn: cashInToday, label: 'วันนี้', need: cashNeedToday },
      { cashIn: cashIn7, label: '7 วัน', need: cashNeed7 },
      { cashIn: cashIn30, label: '30 วัน', need: cashNeed30 },
    ],
    filters: { asOf: dateOnly(asOf), branchId: filter.branchId ?? 'ALL', monthStart: dateOnly(currentMonthStart) },
    insights: [
      { detail: `จาก Cash & Bank ÷ Avg Daily Out (${avgDailyOut.toFixed(2)}/วัน)`, title: 'เงินสดพอจ่ายกี่วัน', type: runway < 30 ? 'danger' : runway < 60 ? 'warn' : 'ok', value: runway >= 999 ? '∞' : `${Math.round(runway)} วัน` },
      { detail: 'รวมภาระ AP/Loan ที่ครบกำหนดจาก forecast source', title: 'วันนี้ต้องเตรียมเงิน', type: cashNeedToday > split.cashAndBank ? 'danger' : 'ok', value: cashNeedToday },
      { detail: `Net cash 7 วัน = ${split.cashAndBank + cashIn7 - cashNeed7}`, title: '7 วันข้างหน้าภาระอะไรบ้าง', type: cashNeed7 > split.cashAndBank + cashIn7 ? 'danger' : cashNeed7 > split.cashAndBank ? 'warn' : 'ok', value: cashNeed7 },
      { detail: `AR คงค้างทั้งหมด ${balanceSheet.summary.ar}`, title: 'ลูกหนี้ที่จะเก็บได้ (30 วัน)', type: 'ok', value: cashIn30 },
      { detail: `AP คงค้าง ${balanceSheet.summary.ap} + Loan ${balanceSheet.summary.currentLoan + balanceSheet.summary.longTermLoan}`, title: 'เจ้าหนี้/สินเชื่อต้องจ่าย (30 วัน)', type: cashNeed30 > split.cashAndBank + cashIn30 ? 'danger' : 'warn', value: cashNeed30 },
      { detail: `Stock/Cash ratio ${split.cashAndBank > 0 ? (balanceSheet.summary.inventory / split.cashAndBank * 100).toFixed(0) : '0'}%`, title: 'เงินจมใน Stock', type: split.cashAndBank > 0 && balanceSheet.summary.inventory / split.cashAndBank > 2 ? 'warn' : 'ok', value: balanceSheet.summary.inventory },
      { detail: monthPl.summary.netProfitBeforeTax > cashAnalysis.summary.operatingCashFlow + 10000 ? 'กำไรในงบสูงกว่าเงินสดจริง — ตรวจ AR/Stock' : 'กำไรกับเงินสดสอดคล้องกัน', title: 'กำไรอยู่ในงบ แต่เงินสดจริงพอไหม', type: Math.abs(monthPl.summary.netProfitBeforeTax - cashAnalysis.summary.operatingCashFlow) > Math.abs(monthPl.summary.netProfitBeforeTax) * 0.5 && monthPl.summary.netProfitBeforeTax > 0 ? 'warn' : 'ok', value: `NP ${monthPl.summary.netProfitBeforeTax} vs OCF ${cashAnalysis.summary.operatingCashFlow}` },
    ],
    monthlyPL,
    sourceState: sourceState(),
    summary: {
      ...split,
      ap: balanceSheet.summary.ap,
      ar: balanceSheet.summary.ar,
      cashNeed30,
      cashNeed7,
      cashNeedToday,
      cashIn30,
      cashIn7,
      cashInToday,
      cogs: monthPl.summary.cogs,
      equity,
      gp: monthPl.summary.grossProfit,
      gpPct: monthPl.summary.revenue > 0 ? monthPl.summary.grossProfit / monthPl.summary.revenue * 100 : 0,
      inv: balanceSheet.summary.inventory,
      netCashPos30,
      np: monthPl.summary.netProfitBeforeTax,
      npPct: monthPl.summary.revenue > 0 ? monthPl.summary.netProfitBeforeTax / monthPl.summary.revenue * 100 : 0,
      odAvailable: split.odAvailable,
      opCF: cashAnalysis.summary.operatingCashFlow,
      pendingDeliveryCost,
      rev: monthPl.summary.revenue,
      runway,
      stockCount: stockFinance.summary.itemCount,
      totalAssets: assets,
      totalLiab: liabilities,
      totalLoan: balanceSheet.summary.currentLoan + balanceSheet.summary.longTermLoan,
      totalNBV: balanceSheet.summary.fixedAssetNet,
      tradingPendingValue: 0,
      workingCapital: workingCapital.summary.currentAssets - workingCapital.summary.currentLiab,
    },
  }
}
