import type { Prisma } from '../../../../../generated/prisma/client'
import { NextResponse } from 'next/server'
import { XLSX } from '@/lib/server/xlsx'
import { apiErrorResponse } from '@/lib/server/api-error'
import { findActiveAccountReferenceByCode } from '@/lib/server/account-reference'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { FINANCE_DEBT_PAGE_PERMISSIONS } from '@/lib/finance-debt-permissions'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { getFinanceBranchCodeIntersection } from '@/lib/server/finance-accounting-branch-scope'
import { prisma } from '@/lib/server/prisma'
import { listActiveAccounts, listActiveBranches, listActiveBranchesByCodes, type AccountReferenceRecord } from '@/lib/server/reference-master-cache'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

type BankQuery = {
  accountId: string | null
  accountGroup: string | null
  bankAccountType: string | null
  branchCode: string | null
  from: string | null
  page: number
  pageSize: number
  q: string | null
  refType: string | null
  sortDirection: 'asc' | 'desc'
  to: string | null
  type: string | null
}

type BankStatementRow = {
  accountId: string
  accountName: string
  accountNo: string
  amountIn: number
  amountOut: number
  bankName: string
  branchName: string
  cashFlowCategory: string
  date: string
  description: string
  docNo: string
  id: string
  movement: number
  movementCurrencyCode: string
  nativeAmountIn: number
  nativeAmountOut: number
  bookFxRate: number | null
  note: string
  odUsed: number
  refId: string
  refNo: string
  refType: string
  reversalOfId: string | null
  runningBalance: number
  sourceEventKey: string
  sourceEventType: string
  type: string
}

function parseQuery(url: URL): BankQuery {
  const page = Number(url.searchParams.get('page') ?? '1')
  const pageSize = Number(url.searchParams.get('pageSize') ?? '50')
  const branchCode = url.searchParams.get('branchCode')?.trim().toUpperCase()
  return {
    accountId: url.searchParams.get('accountId') || null,
    accountGroup: url.searchParams.get('accountGroup') || null,
    bankAccountType: url.searchParams.get('bankAccountType') || null,
    branchCode: branchCode && branchCode !== 'ALL' ? branchCode : null,
    from: url.searchParams.get('from') || null,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 500) : 50,
    q: url.searchParams.get('q') || null,
    refType: url.searchParams.get('refType') || null,
    sortDirection: url.searchParams.get('sortDirection') === 'asc' ? 'asc' : 'desc',
    to: url.searchParams.get('to') || null,
    type: url.searchParams.get('type') || null,
  }
}

function statementWhere(query: BankQuery, internalAccountId: bigint | null, visibleAccountIds: bigint[], includeBeforeFrom: boolean): Prisma.bank_statementWhereInput {
  return {
    ...(internalAccountId != null ? { account_id: internalAccountId } : { account_id: { in: visibleAccountIds } }),
    ...(query.refType ? { ref_type: query.refType } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.to || (!includeBeforeFrom && query.from)
      ? {
          date: {
            ...(!includeBeforeFrom && query.from ? { gte: normalizeDate(query.from) } : {}),
            ...(query.to ? { lte: normalizeDate(query.to) } : {}),
          },
        }
      : {}),
  }
}

async function buildWorkbook(rows: Array<Record<string, string | number>>) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  const headers = rows[0] ? Object.keys(rows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Bank Statement')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

function xlsxResponse(body: Buffer, filename: string) {
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  })
}

function parseBigIntId(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null
  try {
    return BigInt(value)
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, FINANCE_DEBT_PAGE_PERMISSIONS.bankStatement)

    const url = new URL(request.url)
    const query = parseQuery(url)
    const allowedBranchCodes = getFinanceBranchCodeIntersection(context)
    const visibleBranches = allowedBranchCodes === null
      ? await listActiveBranches()
      : allowedBranchCodes.length > 0
        ? await listActiveBranchesByCodes(allowedBranchCodes)
        : []
    const branch = query.branchCode
      ? visibleBranches.find((row) => row.code === query.branchCode) ?? null
      : null
    if (query.branchCode && !branch) {
      throw new Error('ไม่พบสาขาที่เปิดใช้งานหรือไม่มีสิทธิ์ดูข้อมูลสาขานี้')
    }
    const search = query.q?.trim().toLowerCase()
    const accountReference = await findActiveAccountReferenceByCode(query.accountId)
    if (query.accountId && !accountReference) {
      throw new Error('ไม่พบบัญชีเงินบริษัทตามรหัสบัญชีที่ระบุ')
    }
    const allAccounts = await listActiveAccounts()
    if (query.bankAccountType && query.accountGroup !== 'bank') {
      throw new Error('ประเภทบัญชีธนาคารใช้ได้เฉพาะประเภทบัญชีบริษัท ธนาคาร')
    }
    const accounts = allAccounts.filter((account) => account.accountGroup !== 'virtual'
      && (!branch || account.branchCode === branch.code)
      && (!query.accountGroup || account.accountGroup === query.accountGroup)
      && (!query.bankAccountType || account.bankAccountType === query.bankAccountType))
    if (accountReference && !accounts.some((account) => account.id === accountReference.id)) {
      throw new Error('บัญชีเงินบริษัทไม่อยู่ในสาขาที่เลือกหรือไม่มีสิทธิ์ดูข้อมูล')
    }
    const internalAccountId = accountReference?.id ?? null
    const visibleAccountIds = accounts.map((account) => account.id)

    const sourceRows = await prisma.bank_statement.findMany({
      include: {
        accounts: { include: { branches: { select: { id: true, name: true } } } },
      },
      orderBy: [{ account_id: 'asc' }, { date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      take: 10000,
      where: statementWhere(query, internalAccountId, visibleAccountIds, true),
    })

    const receiptIds = Array.from(new Set(sourceRows
      .filter((row) => row.ref_type === 'RCP' && row.ref_id)
      .map((row) => parseBigIntId(row.ref_id))
      .filter((id): id is bigint => id != null)))
    const receiptDocNos = Array.from(new Set(sourceRows
      .filter((row) => row.ref_type === 'RCP' && row.ref_no)
      .map((row) => row.ref_no as string)))
    const customerReceipts = receiptIds.length > 0 || receiptDocNos.length > 0
      ? await prisma.customer_receipts.findMany({
        select: {
          customer_name_snapshot: true,
          customer_receipt_allocations: {
            orderBy: [{ line_no: 'asc' }],
            select: { sales_bill_doc_no_snapshot: true },
          },
          doc_no: true,
          id: true,
        },
        where: {
          OR: [
            ...(receiptIds.length > 0 ? [{ id: { in: receiptIds } }] : []),
            ...(receiptDocNos.length > 0 ? [{ doc_no: { in: receiptDocNos } }] : []),
          ],
        },
      })
      : []
    const receiptDetailsByReference = new Map<string, { customerName: string; sourceDocNos: string[] }>()
    for (const receipt of customerReceipts) {
      const detail = {
        customerName: receipt.customer_name_snapshot,
        sourceDocNos: Array.from(new Set(receipt.customer_receipt_allocations.map((allocation) => allocation.sales_bill_doc_no_snapshot).filter(Boolean))),
      }
      receiptDetailsByReference.set(receipt.id.toString(), detail)
      receiptDetailsByReference.set(receipt.doc_no, detail)
    }

    const accountByInternalId = new Map(accounts.map((account: AccountReferenceRecord) => [String(account.id), account] as const))
    // Bank Statement is the only balance source for this page. Account Master
    // only supplies the selectable account metadata and never seeds a balance.
    const runningByAccount = new Map<string, number>(accounts.map((account: AccountReferenceRecord) => [String(account.id), 0]))

    const rowsWithRunning: BankStatementRow[] = sourceRows.map((row: (typeof sourceRows)[number]) => {
      const internalAccountKey = row.account_id?.toString() ?? ''
      const account = internalAccountKey ? accountByInternalId.get(internalAccountKey) : undefined
      const outwardAccountId = account?.code ?? ''
      const previous = runningByAccount.get(internalAccountKey) ?? 0
      const amountIn = toNumber(row.amount_in)
      const amountOut = toNumber(row.amount_out)
      const movement = amountIn - amountOut
      const rawBookBalance = previous + movement
      runningByAccount.set(internalAccountKey, rawBookBalance)
      const odLimit = account?.odLimit == null ? 0 : Number(account.odLimit)
      const hasOd = account?.subtype === 'current' && odLimit > 0
      const odUsed = hasOd ? Math.max(0, -rawBookBalance) : 0
      const runningBalance = hasOd ? Math.max(0, rawBookBalance) : rawBookBalance
      return {
        accountId: outwardAccountId,
        accountName: row.accounts?.name ?? '-',
        accountNo: row.accounts?.account_no ?? '',
        amountIn,
        amountOut,
        bookFxRate: row.book_fx_rate == null ? null : toNumber(row.book_fx_rate),
        bankName: row.accounts?.bank_name ?? row.accounts?.bank ?? '',
        branchName: row.accounts?.branches?.name ?? '-',
        cashFlowCategory: row.cash_flow_category ?? '',
        date: toDateOnly(row.date),
        description: (() => {
          const fallback = row.description ?? row.desc ?? ''
          if (row.ref_type === 'RCP' && row.ref_id) {
            const detail = receiptDetailsByReference.get(row.ref_id) ?? receiptDetailsByReference.get(row.ref_no ?? '')
            if (detail?.sourceDocNos.length && detail.customerName) return `${detail.sourceDocNos.join(', ')} - ${detail.customerName}`
          }
          return fallback
        })(),
        id: row.doc_no,
        movement,
        movementCurrencyCode: row.movement_currency_code,
        nativeAmountIn: toNumber(row.native_amount_in),
        nativeAmountOut: toNumber(row.native_amount_out),
        note: row.note ?? '',
        odUsed,
        docNo: row.doc_no,
        refId: row.ref_no ?? row.doc_no,
        refNo: row.ref_no ?? '',
        refType: row.ref_type ?? '',
        reversalOfId: row.reversal_of_id?.toString() ?? null,
        runningBalance,
        sourceEventKey: row.source_event_key,
        sourceEventType: row.source_event_type,
        type: row.type ?? '',
      }
    })

    const visibleRows = rowsWithRunning
      .filter((row: BankStatementRow) => !query.from || row.date >= query.from)
      .filter((row: BankStatementRow) => !search || `${row.accountName} ${row.accountNo} ${row.bankName} ${row.docNo} ${row.refNo} ${row.refType} ${row.description} ${row.note}`.toLowerCase().includes(search))
      .sort((left: BankStatementRow, right: BankStatementRow) => {
        const direction = query.sortDirection === 'asc' ? 1 : -1
        return (left.date.localeCompare(right.date) || left.refNo.localeCompare(right.refNo) || left.id.localeCompare(right.id)) * direction
      })

    const accountSummary = new Map<string, { accountId: string; accountName: string; amountIn: number; amountOut: number; balance: number; rows: number }>()
    visibleRows.forEach((row: BankStatementRow) => {
      const current = accountSummary.get(row.accountId) ?? { accountId: row.accountId, accountName: row.accountName, amountIn: 0, amountOut: 0, balance: row.runningBalance, rows: 0 }
      current.amountIn += row.amountIn
      current.amountOut += row.amountOut
      current.balance = row.runningBalance
      current.rows += 1
      accountSummary.set(row.accountId, current)
    })

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(await buildWorkbook(visibleRows.map((row: BankStatementRow) => ({
        Account: row.accountName,
        BookAmountInTHB: row.amountIn,
        BookAmountOutTHB: row.amountOut,
        BookBalanceTHB: row.runningBalance,
        MovementCurrency: row.movementCurrencyCode,
        NativeAmountIn: row.nativeAmountIn,
        NativeAmountOut: row.nativeAmountOut,
        BookFxRate: row.bookFxRate ?? '',
        Date: row.date,
        Description: row.description,
        DocNo: row.docNo,
        RefNo: row.refNo,
        RefType: row.refType,
        ReversalOfId: row.reversalOfId ?? '',
        SourceEventKey: row.sourceEventKey,
        SourceEventType: row.sourceEventType,
        Type: row.type,
      }))), `finance_bank_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }

    const start = (query.page - 1) * query.pageSize
    const totalRows = visibleRows.length
    const refTypes = Array.from(new Set(sourceRows.map((row: (typeof sourceRows)[number]) => row.ref_type).filter((value: string | null): value is string => Boolean(value)))).sort()
    const types = Array.from(new Set(sourceRows.map((row: (typeof sourceRows)[number]) => row.type).filter((value: string | null): value is string => Boolean(value)))).sort()

    return NextResponse.json({
      byAccount: Array.from(accountSummary.values()).sort((left, right) => right.balance - left.balance),
      filters: {
        branches: visibleBranches.map((row) => ({ code: row.code, id: row.code, name: row.name })),
        accounts: accounts.map((row: AccountReferenceRecord) => ({
          accountNo: row.accountNo,
          accountGroup: row.accountGroup,
          active: true,
          bankAccountType: row.bankAccountType,
          bankName: row.bankName,
          branchName: row.branchName ?? '',
          code: row.code,
          currency: row.currency,
          id: row.code,
          name: row.name,
          type: row.type,
          subtype: row.subtype,
          odLimit: row.odLimit == null ? null : Number(row.odLimit),
        })),
        refTypes,
        types,
      },
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(totalRows / query.pageSize)),
        totalRows,
      },
      rows: visibleRows.slice(start, start + query.pageSize),
      summary: {
        accounts: accountSummary.size,
        amountIn: visibleRows.reduce((sum: number, row: BankStatementRow) => sum + row.amountIn, 0),
        amountOut: visibleRows.reduce((sum: number, row: BankStatementRow) => sum + row.amountOut, 0),
        netMovement: visibleRows.reduce((sum: number, row: BankStatementRow) => sum + row.movement, 0),
        rows: visibleRows.length,
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Bank Statement ไม่ได้', 500)
  }
}
