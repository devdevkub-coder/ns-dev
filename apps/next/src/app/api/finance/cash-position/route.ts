import { NextResponse } from 'next/server'
import { PURCHASE_BILL_ACTIVE_STATUSES } from '@/lib/purchase-bill-status'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { getAllowedBranchIds } from '@/lib/server/branch-scope'
import { FINANCE_DEBT_PAGE_PERMISSIONS } from '@/lib/finance-debt-permissions'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { buildFinanceCashPosition } from '@/lib/server/finance-accounting-cash-position'
import { prisma } from '@/lib/server/prisma'
import { listActiveBranches } from '@/lib/server/reference-master-cache'
import { applyWorksheetTableLayout, XLSX } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

function ageBucket(days: number) {
  if (days <= 0) return 'current'
  if (days <= 30) return 'b30'
  if (days <= 60) return 'b60'
  if (days <= 90) return 'b90'
  return 'gt90'
}

type AccountBalanceRow = {
  accountNo: string
  balance: number
  bankName: string
  branchName: string
  code: string
  currency: string
  id: string
  isFcd: boolean
  name: string
  odLimit: number
  odUsed: number
  type: string
}

type ExposureRow = {
  aging: number
  balance: number
  bucket: string
  dueDate: string
  partyName: string
  refNo: string
}

function parseAsOf(value: string | null) {
  if (!value) return new Date()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('วันที่ ณ สิ้นวันไม่ถูกต้อง')
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) throw new Error('วันที่ ณ สิ้นวันไม่ถูกต้อง')
  return date
}

function accountGroups(value: string | null): Array<'bank' | 'cash' | 'fcd'> | undefined {
  if (!value || value === 'ALL') return undefined
  if (value === 'bank' || value === 'cash' || value === 'fcd') return [value]
  throw new Error('กลุ่มบัญชีไม่ถูกต้อง')
}

async function xlsxResponse(sheets: Array<{ name: string; rows: Array<Record<string, string | number>> }>, filename: string) {
  const workbook = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows)
    applyWorksheetTableLayout(worksheet, Object.keys(sheet.rows[0] ?? {}).length, sheet.rows.length + 1)
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name)
  }
  const body = await XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  })
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, FINANCE_DEBT_PAGE_PERMISSIONS.cashPosition)
    const allowedBranchIds = await getAllowedBranchIds(context)
    const url = new URL(request.url)
    const asOf = parseAsOf(url.searchParams.get('asOf'))
    const requestedBranchId = url.searchParams.get('branchId')
    const groupFilter = accountGroups(url.searchParams.get('accountGroup'))
    const branches = await listActiveBranches()
    const visibleBranches = branches.filter((branch) => allowedBranchIds === null || allowedBranchIds.some((id) => id === branch.id))
    const selectedBranch = requestedBranchId ? visibleBranches.find((branch) => branch.id.toString() === requestedBranchId) : null
    if (requestedBranchId && !selectedBranch) return NextResponse.json({ error: 'ไม่พบสาขาที่เลือก หรือไม่มีสิทธิ์เข้าถึง' }, { status: 400 })
    const scopedBranchIds = selectedBranch ? [selectedBranch.id] : allowedBranchIds
    const branchWhere = scopedBranchIds === null ? {} : { branch_id: { in: scopedBranchIds } }

    const [cashPosition, salesBills, purchaseBills] = await Promise.all([
      buildFinanceCashPosition({ accountGroups: groupFilter, asOf, branchIds: scopedBranchIds }),
      prisma.sales_bills.findMany({
        include: { customers: { select: { credit_term: true, id: true, name: true } } },
        take: 10000,
        where: { ...branchWhere, NOT: { status: 'cancelled' } },
      }),
      prisma.purchase_bills.findMany({
        include: { suppliers: { select: { id: true, name: true } } },
        take: 10000,
        where: { ...branchWhere, status: { in: [...PURCHASE_BILL_ACTIVE_STATUSES] } },
      }),
    ])

    const accountRows: AccountBalanceRow[] = cashPosition.accountBalances.map((account) => ({
      accountNo: account.accountNo ?? '',
      balance: account.odLimit > 0 ? Math.max(0, account.balance) : account.balance,
      bankName: account.bankName ?? '',
      branchName: account.branchName ?? '',
      code: account.code,
      currency: account.isFcd ? account.supportedCurrencies.join(', ') : account.currency ?? '',
      id: account.code,
      isFcd: account.isFcd,
      name: account.name,
      odLimit: account.odLimit,
      odUsed: account.odLimit > 0 ? Math.max(0, -account.balance) : 0,
      type: account.isFcd ? 'FCD' : account.accountGroup === 'cash' ? 'เงินสด' : 'ธนาคาร',
    }))

    const byType = Array.from(accountRows.reduce((map: Map<string, { accounts: number; balance: number; type: string }>, row: AccountBalanceRow) => {
      const current = map.get(row.type) ?? { accounts: 0, balance: 0, type: row.type }
      current.accounts += 1
      current.balance += row.balance
      map.set(row.type, current)
      return map
    }, new Map<string, { accounts: number; balance: number; type: string }>()).values()).sort((left, right) => right.balance - left.balance)

    const today = asOf
    const arRows: ExposureRow[] = salesBills.map((bill: (typeof salesBills)[number]) => {
      const balance = Math.max(0, toNumber(bill.receivable_balance))
      const due = bill.due_date ? new Date(bill.due_date) : new Date(bill.date)
      if (!bill.due_date) due.setDate(due.getDate() + (bill.credit_term ?? bill.customers?.credit_term ?? 0))
      const aging = Math.floor((today.getTime() - due.getTime()) / 86400000)
      return { aging, balance, bucket: ageBucket(aging), dueDate: toDateOnly(due), partyName: bill.customers?.name ?? '-', refNo: bill.doc_no }
    }).filter((row: ExposureRow) => row.balance > 0.01)

    const apRows: ExposureRow[] = purchaseBills.map((bill: (typeof purchaseBills)[number]) => {
      const balance = Math.max(0, toNumber(bill.payable_balance))
      const due = new Date(bill.date)
      const aging = Math.floor((today.getTime() - due.getTime()) / 86400000)
      return { aging, balance, bucket: ageBucket(aging), dueDate: toDateOnly(due), partyName: bill.suppliers?.name ?? '-', refNo: bill.doc_no }
    }).filter((row: ExposureRow) => row.balance > 0.01)

    const payload = {
      accounts: accountRows.sort((left, right) => right.balance - left.balance),
      byType,
      exposure: {
        ap: {
          overdue: apRows.filter((row) => row.aging > 0).reduce((sum, row) => sum + row.balance, 0),
          total: apRows.reduce((sum: number, row: ExposureRow) => sum + row.balance, 0),
          upcoming7: apRows.filter((row) => row.aging >= -7 && row.aging <= 0).reduce((sum, row) => sum + row.balance, 0),
        },
        ar: {
          overdue: arRows.filter((row) => row.aging > 0).reduce((sum, row) => sum + row.balance, 0),
          total: arRows.reduce((sum: number, row: ExposureRow) => sum + row.balance, 0),
          upcoming7: arRows.filter((row) => row.aging >= -7 && row.aging <= 0).reduce((sum, row) => sum + row.balance, 0),
        },
      },
      nearDue: {
        ap: apRows.filter((row: ExposureRow) => row.aging >= -7 && row.aging <= 30).sort((left: ExposureRow, right: ExposureRow) => right.balance - left.balance).slice(0, 10),
        ar: arRows.filter((row: ExposureRow) => row.aging >= -7 && row.aging <= 30).sort((left: ExposureRow, right: ExposureRow) => right.balance - left.balance).slice(0, 10),
      },
      summary: {
        accountBalance: cashPosition.cashAndBank,
        accounts: accountRows.length,
        netAfterAp: accountRows.reduce((sum: number, row: AccountBalanceRow) => sum + row.balance, 0) - apRows.reduce((sum: number, row: ExposureRow) => sum + row.balance, 0),
        netExposure: arRows.reduce((sum: number, row: ExposureRow) => sum + row.balance, 0) - apRows.reduce((sum: number, row: ExposureRow) => sum + row.balance, 0),
      },
      filters: {
        accountGroup: url.searchParams.get('accountGroup') ?? 'ALL',
        asOf: toDateOnly(asOf),
        branchId: selectedBranch?.id.toString() ?? 'ALL',
        branches: visibleBranches.map((branch) => ({ id: branch.id.toString(), name: branch.name })),
      },
    }
    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse([
        {
          name: 'Cash Position',
          rows: accountRows.map((row) => ({
            'รหัสบัญชี': row.code,
            'ชื่อบัญชี': row.name,
            'ประเภท': row.type,
            'ธนาคาร': row.bankName,
            'เลขที่บัญชี': row.accountNo,
            'สกุลที่รองรับ': row.currency,
            'วงเงิน OD (THB)': row.odLimit,
            'OD ใช้ไป (THB)': row.odUsed,
            'ยอดคงเหลือทางบัญชี (THB)': row.balance,
            'Bank Statement': `/finance/bank?accountId=${encodeURIComponent(row.code)}`,
            'FCD Ledger': row.isFcd ? `/finance/foreign/fcd-ledger?accountId=${encodeURIComponent(row.code)}` : '',
          })),
        },
        {
          name: 'AR',
          rows: arRows.map((row) => ({ 'เลขที่เอกสาร': row.refNo, 'ลูกค้า': row.partyName, 'ครบกำหนด': row.dueDate, 'ยอดคงเหลือ (THB)': row.balance, 'AR': `/finance/ar?search=${encodeURIComponent(row.refNo)}` })),
        },
        {
          name: 'AP',
          rows: apRows.map((row) => ({ 'เลขที่เอกสาร': row.refNo, 'ผู้ขาย': row.partyName, 'ครบกำหนด': row.dueDate, 'ยอดคงเหลือ (THB)': row.balance, 'AP': `/finance/ap?search=${encodeURIComponent(row.refNo)}` })),
        },
      ], `finance_cash_position_${toDateOnly(asOf)}.xlsx`)
    }
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Cash Position ไม่ได้', 500)
  }
}
