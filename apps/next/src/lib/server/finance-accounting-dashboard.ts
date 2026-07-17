import { requireBusinessCode } from '@/lib/business-code'
import { roundMoney, toBangkokDateOnly, toBangkokEndOfDay, toNumber } from '@/lib/server/daily'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { buildFinanceCashPosition } from '@/lib/server/finance-accounting-cash-position'
import { buildCashFlowAnalysis } from '@/lib/server/finance-accounting-cashflow-planning'
import { buildBalanceSheet, buildPlStatement, FinancialStatementInputError } from '@/lib/server/finance-accounting-statements'
import { buildStockFinance } from '@/lib/server/finance-accounting-working-capital'
import { prisma } from '@/lib/server/prisma'

export type FinancialDashboardFilter = {
  allowedBranchCodes?: string[] | null
  asOf: Date
  branchId?: string
}

type DashboardBranchRef = { code: string; id: bigint; name: string }

export async function resolveDashboardBranchScope(filter: FinancialDashboardFilter) {
  const allowedCodes = filter.allowedBranchCodes === undefined || filter.allowedBranchCodes === null
    ? null
    : [...new Set(filter.allowedBranchCodes.map((code) => code.trim().toUpperCase()).filter(Boolean))]
  const selected = filter.branchId ? await findActiveBranchReferenceByCodeOrId(filter.branchId) : null
  if (filter.branchId && !selected) throw new FinancialStatementInputError(`ไม่พบสาขาที่ใช้งาน: ${filter.branchId}`)
  if (selected && allowedCodes !== null && !allowedCodes.includes(selected.code.toUpperCase())) {
    throw new Error('ไม่มีสิทธิ์ดูข้อมูลของสาขาที่ระบุ')
  }
  const visibleBranches = await prisma.branches.findMany({
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
    select: { code: true, id: true, name: true },
    where: { active: true, ...(allowedCodes !== null ? { code: { in: allowedCodes } } : {}) },
  }) as DashboardBranchRef[]
  const queryBranches = selected ? [selected] : allowedCodes === null ? null : visibleBranches
  return {
    branchCodes: queryBranches?.map((branch) => branch.code) ?? null,
    branchIds: queryBranches?.map((branch) => branch.id) ?? null,
    branches: visibleBranches,
  }
}

function dateOnly(date: Date) {
  return toBangkokDateOnly(date)
}

export function financialDashboardDateScope(value: Date) {
  const asOf = new Date(`${toBangkokDateOnly(value)}T00:00:00.000Z`)
  return {
    asOf,
    currentMonthStart: new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1)),
  }
}

function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function monthLabel(date: Date) {
  return ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][date.getUTCMonth()]
}

function sourceState(options?: { branchScoped?: boolean }) {
  return {
    basis: 'Financial Dashboard management source assembled from operational finance helpers. Not a statutory GL dashboard.',
    limitations: [
      'ยังไม่มี GL close/COA/retained earnings roll-forward จึงเป็น management dashboard เท่านั้น',
      'Cash need/inflow reuses AR/AP/loan schedule forecast source from operational documents',
      'ยอด FCD ใช้ accounts.opening_balance เท่านั้น เพราะ bank_statement ยังไม่มี foreign amount; แสดงแยกตามสกุลและไม่รวมในยอด/ประมาณการเงินบาท',
      ...(options?.branchScoped ? ['ยอด Loan/Equity ระดับบริษัทถูกตัดออกจากผลแบบจำกัดสาขา เพราะแหล่งข้อมูลยังไม่มีมิติสาขาที่ตรวจสอบได้'] : []),
      'No payment, receipt, transfer, financing, reclass, posting, or statutory statement write action is enabled',
    ],
    writeActionsEnabled: false,
  }
}

type FinancialDashboardInsight = {
  detail: string
  title: string
  type: 'danger' | 'ok' | 'warn'
  value: number | string
}

type FinancialDashboardInsightInput = {
  ap: number
  ar: number
  avgDailyOut: number
  cashAndBank: number
  cashIn30: number
  cashIn7: number
  cashNeed30: number
  cashNeed7: number
  inventory: number
  loan: number
  netProfitBeforeTax: number
  operatingCashFlow: number
}

type CashPositionInput = {
  bankBalance: number
  cashBalance: number
  odLimit: number
  odUsed: number
}

export function classifyFinancialCashAccount(account: {
  bank: string | null
  bank_name: string | null
  currency: string | null
  name: string
  type: string
}): 'BANK' | 'CASH' | 'FCD' | 'OD' {
  const description = [account.type, account.name, account.bank_name, account.bank].filter(Boolean).join(' ').toLowerCase()
  const currency = (account.currency ?? 'THB').trim().toUpperCase()
  if (currency !== 'THB' || description.includes('fcd') || description.includes('foreign')) return 'FCD'
  if (description.includes('od')) return 'OD'
  if (description.includes('cash') || description.includes('เงินสด')) return 'CASH'
  return 'BANK'
}

export function financialDashboardAccountBalance(account: {
  bank: string | null
  bank_name: string | null
  currency: string | null
  movement: number
  name: string
  openingBalance: number
  type: string
}) {
  return account.openingBalance + (classifyFinancialCashAccount(account) === 'FCD' ? 0 : account.movement)
}

export function buildCashPositionSummary(input: CashPositionInput) {
  return {
    ...input,
    cashAndBank: input.cashBalance + input.bankBalance,
    odAvailable: Math.max(0, input.odLimit - input.odUsed),
  }
}

export function summarizeFinancialCashAccounts(accounts: Array<{
  balance: number
  bank: string | null
  bank_name: string | null
  currency: string | null
  name: string
  odLimit: number
  type: string
}>) {
  const totals = { bankBalance: 0, cashBalance: 0, odLimit: 0, odUsed: 0 }
  const fcdByCurrency = new Map<string, number>()
  const unlabelledFcdBalances: Array<{ currency: string; value: number }> = []

  for (const account of accounts) {
    const kind = classifyFinancialCashAccount(account)
    if (kind === 'FCD') {
      const currency = account.currency?.trim().toUpperCase()
      if (currency) fcdByCurrency.set(currency, (fcdByCurrency.get(currency) ?? 0) + account.balance)
      else unlabelledFcdBalances.push({ currency: `ไม่ระบุสกุล (${account.name})`, value: account.balance })
    } else if (kind === 'OD') {
      totals.odLimit += account.odLimit
      if (account.balance < 0) totals.odUsed += Math.abs(account.balance)
      else totals.bankBalance += account.balance
    } else if (kind === 'CASH') {
      totals.cashBalance += account.balance
    } else {
      totals.bankBalance += account.balance
    }
  }

  return {
    ...buildCashPositionSummary(totals),
    fcdBalances: [...Array.from(fcdByCurrency, ([currency, value]) => ({ currency, value })), ...unlabelledFcdBalances]
      .filter((row) => row.value !== 0)
      .sort((left, right) => left.currency.localeCompare(right.currency, 'en')),
  }
}

function money(value: number) {
  const formatted = Math.abs(value).toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
  return value < 0 ? `(${formatted})` : formatted
}

export function buildFinancialDashboardInsights(input: FinancialDashboardInsightInput): FinancialDashboardInsight[] {
  const runway = input.avgDailyOut > 0 ? input.cashAndBank / input.avgDailyOut : null
  const projected7 = roundMoney(input.cashAndBank + input.cashIn7 - input.cashNeed7)
  const projected30 = roundMoney(input.cashAndBank + input.cashIn30 - input.cashNeed30)
  const receivableGap30 = roundMoney(input.cashIn30 - input.cashNeed30)
  const stockCashPercent = input.cashAndBank > 0 ? input.inventory / input.cashAndBank * 100 : null
  const stockCashPercentLabel = stockCashPercent === null ? null : `${stockCashPercent.toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`
  const profitCashGap = roundMoney(input.netProfitBeforeTax - input.operatingCashFlow)
  const materialProfitCashGap = input.netProfitBeforeTax > 0 && Math.abs(profitCashGap) > Math.abs(input.netProfitBeforeTax) * 0.3

  return [
    {
      detail: input.avgDailyOut > 0
        ? `อัตราใช้เงินสดเฉลี่ย ${money(input.avgDailyOut)} บาท/วัน`
        : 'ยังไม่มีฐานรายจ่ายเฉลี่ยสำหรับคำนวณ',
      title: 'เงินสดพอจ่ายกี่วัน',
      type: runway === null ? 'warn' : runway < 30 ? 'danger' : runway < 60 ? 'warn' : 'ok',
      value: runway === null ? 'ยังคำนวณไม่ได้' : runway > 999 ? 'มากกว่า 999 วัน' : `${Math.round(runway).toLocaleString('th-TH')} วัน`,
    },
    {
      detail: `คาดรับ ${money(input.cashIn7)} · คาดจ่าย ${money(input.cashNeed7)}`,
      title: 'สภาพคล่อง 7 วัน',
      type: projected7 < 0 ? 'danger' : 'ok',
      value: projected7,
    },
    {
      detail: `ลูกหนี้ ${money(input.ar)} · เจ้าหนี้/สินเชื่อ ${money(input.ap + input.loan)}`,
      title: 'เงินรับเทียบเงินจ่าย 30 วัน',
      type: projected30 < 0 ? 'danger' : receivableGap30 < 0 ? 'warn' : 'ok',
      value: receivableGap30,
    },
    {
      detail: stockCashPercent === null
        ? 'ไม่มีฐานเงินสดและธนาคารสำหรับคำนวณสัดส่วน'
        : `${stockCashPercentLabel} ของเงินสดและธนาคาร`,
      title: 'เงินจมในสินค้าคงคลัง',
      type: stockCashPercent === null ? (input.cashAndBank < 0 ? 'danger' : 'warn') : stockCashPercent > 200 ? 'warn' : 'ok',
      value: stockCashPercentLabel ?? 'ยังคำนวณไม่ได้',
    },
    {
      detail: `กำไรก่อนภาษี ${money(input.netProfitBeforeTax)} · OCF ${money(input.operatingCashFlow)}`,
      title: 'กำไรก่อนภาษีเทียบ OCF',
      type: materialProfitCashGap ? 'warn' : 'ok',
      value: profitCashGap,
    },
  ]
}

async function cashSplit(asOf: Date, branchIds: bigint[] | null) {
  return buildFinanceCashPosition({ asOf, branchIds })
}

async function unbilledDeliveryCost(asOf: Date, branchIds: bigint[] | null) {
  const asOfEnd = toBangkokEndOfDay(asOf)
  const result = await prisma.stock_holds.aggregate({
    _sum: { value_snapshot: true },
    where: {
      source_type: 'WTO',
      held_at: { lte: asOfEnd },
      ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
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
  const { asOf, currentMonthStart } = financialDashboardDateScope(filter.asOf)
  const last30Start = addDays(asOf, -29)
  const scope = await resolveDashboardBranchScope(filter)
  const [balanceSheets, monthPl, cashAnalysis, stockFinanceReports, split, pendingDeliveryCost, monthlyPL] = await Promise.all([
    scope.branchCodes === null
      ? Promise.all([buildBalanceSheet({ asOf })])
      : Promise.all(scope.branchCodes.map((branchId) => buildBalanceSheet({ asOf, branchId }))),
    buildPlStatement({ allowedBranchCodes: filter.allowedBranchCodes, branchId: filter.branchId, from: currentMonthStart, to: asOf, transactionMode: 'ALL' }),
    buildCashFlowAnalysis({ allowedBranchCodes: filter.allowedBranchCodes, branchId: filter.branchId, from: currentMonthStart, to: asOf }),
    scope.branchCodes === null
      ? Promise.all([buildStockFinance({ asOf, periodDays: 90 })])
      : Promise.all(scope.branchCodes.map((branchId) => buildStockFinance({ asOf, branchId, periodDays: 90 }))),
    cashSplit(asOf, scope.branchIds),
    unbilledDeliveryCost(asOf, scope.branchIds),
    Promise.all(Array.from({ length: 6 }, (_, index) => {
      const start = addMonths(currentMonthStart, index - 5)
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
      return buildPlStatement({ allowedBranchCodes: filter.allowedBranchCodes, branchId: filter.branchId, from: start, to: end < asOf ? end : asOf, transactionMode: 'ALL' }).then((pl) => ({
        cogs: pl.summary.cogs,
        exp: pl.summary.expenses + pl.summary.depreciation + pl.summary.interest,
        label: monthLabel(start),
        np: pl.summary.netProfitBeforeTax,
        rev: pl.summary.revenue,
      }))
    })),
  ])
  const balanceSheet = balanceSheets.reduce((summary, report) => ({
    ap: summary.ap + report.summary.ap,
    ar: summary.ar + report.summary.ar,
    currentLoan: summary.currentLoan + report.summary.currentLoan,
    fixedAssetNet: summary.fixedAssetNet + report.summary.fixedAssetNet,
    inventory: summary.inventory + report.summary.inventory,
    longTermLoan: summary.longTermLoan + report.summary.longTermLoan,
  }), { ap: 0, ar: 0, currentLoan: 0, fixedAssetNet: 0, inventory: 0, longTermLoan: 0 })
  const currentLoan = scope.branchCodes === null ? balanceSheet.currentLoan : 0
  const longTermLoan = scope.branchCodes === null ? balanceSheet.longTermLoan : 0
  const assets = split.cashAndBank + balanceSheet.ar + balanceSheet.inventory + balanceSheet.fixedAssetNet
  const liabilities = balanceSheet.ap + currentLoan + longTermLoan
  const equity = assets - liabilities
  const avgDailyOut = cashAnalysis.summary.burnRate || ((monthPl.summary.expenses + monthPl.summary.interest) / Math.max(1, Math.ceil((asOf.getTime() - last30Start.getTime()) / 86_400_000)))
  const cashNeed7 = cashAnalysis.summary.cashOut7
  const cashNeed30 = cashAnalysis.summary.cashOut30
  const cashIn7 = cashAnalysis.summary.cashIn7
  const cashIn30 = cashAnalysis.summary.cashIn30
  const netCashPos30 = roundMoney(split.cashAndBank + cashIn30 - cashNeed30)
  const assetComp = [
    { color: '#3b82f6', name: 'เงินสดและธนาคาร', value: split.cashAndBank },
    { color: '#06b6d4', name: 'ลูกหนี้การค้า (AR)', value: balanceSheet.ar },
    { color: '#f59e0b', name: 'สินค้าคงคลัง', value: balanceSheet.inventory },
    { color: '#8b5cf6', name: 'สินทรัพย์ถาวร (NBV)', value: balanceSheet.fixedAssetNet },
  ].filter((row) => row.value > 0)

  return {
    assetComp,
    branches: scope.branches.map((branch) => {
      const code = requireBusinessCode(branch.code, `สาขา ${branch.id}`)
      return { code, id: code, name: branch.name }
    }),
    fcdBalances: split.fcdBalances,
    cashPeriods: [
      { cashIn: cashIn7, label: '7 วัน', need: cashNeed7, projected: roundMoney(split.cashAndBank + cashIn7 - cashNeed7) },
      { cashIn: cashIn30, label: '30 วัน', need: cashNeed30, projected: netCashPos30 },
    ],
    filters: { asOf: dateOnly(asOf), branchId: filter.branchId ?? 'ALL', monthStart: dateOnly(currentMonthStart) },
    insights: buildFinancialDashboardInsights({
      ap: balanceSheet.ap,
      ar: balanceSheet.ar,
      avgDailyOut,
      cashAndBank: split.cashAndBank,
      cashIn30,
      cashIn7,
      cashNeed30,
      cashNeed7,
      inventory: balanceSheet.inventory,
      loan: currentLoan + longTermLoan,
      netProfitBeforeTax: monthPl.summary.netProfitBeforeTax,
      operatingCashFlow: cashAnalysis.summary.operatingCashFlow,
    }),
    monthlyPL,
    sourceState: sourceState({ branchScoped: scope.branchCodes !== null }),
    summary: {
      ap: balanceSheet.ap,
      ar: balanceSheet.ar,
      bankBalance: split.bankBalance,
      cashAndBank: split.cashAndBank,
      cashBalance: split.cashBalance,
      cashNeed30,
      cashNeed7,
      cashIn30,
      cashIn7,
      cogs: monthPl.summary.cogs,
      equity,
      gp: monthPl.summary.grossProfit,
      gpPct: monthPl.summary.revenue > 0 ? monthPl.summary.grossProfit / monthPl.summary.revenue * 100 : 0,
      inv: balanceSheet.inventory,
      netCashPos30,
      np: monthPl.summary.netProfitBeforeTax,
      npPct: monthPl.summary.revenue > 0 ? monthPl.summary.netProfitBeforeTax / monthPl.summary.revenue * 100 : 0,
      odAvailable: split.odAvailable,
      odLimit: split.odLimit,
      odUsed: split.odUsed,
      opCF: cashAnalysis.summary.operatingCashFlow,
      pendingDeliveryCost,
      rev: monthPl.summary.revenue,
      stockCount: stockFinanceReports.reduce((sum, report) => sum + report.summary.itemCount, 0),
      totalAssets: assets,
      totalLiab: liabilities,
      totalLoan: currentLoan + longTermLoan,
      totalNBV: balanceSheet.fixedAssetNet,
      workingCapital: split.cashAndBank + balanceSheet.ar + balanceSheet.inventory - balanceSheet.ap - currentLoan,
    },
  }
}
