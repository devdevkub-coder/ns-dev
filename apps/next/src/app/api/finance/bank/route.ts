import type { Prisma } from '../../../../../generated/prisma/client'
import { NextResponse } from 'next/server'
import { XLSX } from '@/lib/server/xlsx'
import { requireBusinessCode } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { findActiveAccountReferenceByCode } from '@/lib/server/account-reference'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

type BankQuery = {
  accountId: string | null
  from: string | null
  page: number
  pageSize: number
  q: string | null
  refType: string | null
  sortDirection: 'asc' | 'desc'
  to: string | null
  type: string | null
}

function parseQuery(url: URL): BankQuery {
  const page = Number(url.searchParams.get('page') ?? '1')
  const pageSize = Number(url.searchParams.get('pageSize') ?? '50')
  return {
    accountId: url.searchParams.get('accountId') || null,
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

function statementWhere(query: BankQuery, internalAccountId: bigint | null, includeBeforeFrom: boolean): Prisma.bank_statementWhereInput {
  return {
    ...(internalAccountId != null ? { account_id: internalAccountId } : {}),
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

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const query = parseQuery(url)
    const search = query.q?.trim().toLowerCase()
    const accountReference = await findActiveAccountReferenceByCode(query.accountId)
    const internalAccountId = accountReference?.id ?? null

    const [sourceRows, accounts] = await Promise.all([
      prisma.bank_statement.findMany({
        include: {
          accounts: { include: { branches: { select: { id: true, name: true } } } },
        },
        orderBy: [{ account_id: 'asc' }, { date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
        take: 10000,
        where: statementWhere(query, internalAccountId, true),
      }),
      prisma.accounts.findMany({
        orderBy: [{ name: 'asc' }, { account_no: 'asc' }],
        select: {
          account_no: true,
          active: true,
          bank_name: true,
          branches: { select: { id: true, name: true } },
          code: true,
          currency: true,
          id: true,
          name: true,
          opening_balance: true,
          type: true,
          subtype: true,
          od_limit: true,
        },
        where: { active: true },
      }),
    ])

    const accountCodeByInternalId = new Map(accounts.map((account) => [String(account.id), requireBusinessCode(account.code, `บัญชีเงิน ${account.id}`)] as const))
    const runningByAccount = new Map<string, number>()
    accounts.forEach((account) => runningByAccount.set(String(account.id), toNumber(account.opening_balance)))

    const rowsWithRunning = sourceRows.map((row) => {
      const internalAccountKey = row.account_id?.toString() ?? ''
      const outwardAccountId = internalAccountKey ? (accountCodeByInternalId.get(internalAccountKey) ?? '') : ''
      const previous = runningByAccount.get(internalAccountKey) ?? 0
      const movement = toNumber(row.amount_in) - toNumber(row.amount_out)
      const runningBalance = row.balance === null || row.balance === undefined ? previous + movement : toNumber(row.balance)
      runningByAccount.set(internalAccountKey, runningBalance)
      return {
        accountId: outwardAccountId,
        accountName: row.accounts?.name ?? '-',
        accountNo: row.accounts?.account_no ?? '',
        amountIn: toNumber(row.amount_in),
        amountOut: toNumber(row.amount_out),
        bankName: row.accounts?.bank_name ?? row.accounts?.bank ?? '',
        branchName: row.accounts?.branches?.name ?? '-',
        cashFlowCategory: row.cash_flow_category ?? '',
        date: toDateOnly(row.date),
        description: row.description ?? row.desc ?? '',
        id: row.doc_no,
        movement,
        note: row.note ?? '',
        docNo: row.doc_no,
        refId: row.ref_no ?? row.doc_no,
        refNo: row.ref_no ?? '',
        refType: row.ref_type ?? '',
        runningBalance,
        type: row.type ?? '',
      }
    })

    const visibleRows = rowsWithRunning
      .filter((row) => !query.from || row.date >= query.from)
      .filter((row) => !search || `${row.accountName} ${row.accountNo} ${row.bankName} ${row.refNo} ${row.refType} ${row.description} ${row.note}`.toLowerCase().includes(search))
      .sort((left, right) => {
        const direction = query.sortDirection === 'asc' ? 1 : -1
        return (left.date.localeCompare(right.date) || left.refNo.localeCompare(right.refNo) || left.id.localeCompare(right.id)) * direction
      })

    const accountSummary = new Map<string, { accountId: string; accountName: string; amountIn: number; amountOut: number; balance: number; rows: number }>()
    visibleRows.forEach((row) => {
      const current = accountSummary.get(row.accountId) ?? { accountId: row.accountId, accountName: row.accountName, amountIn: 0, amountOut: 0, balance: row.runningBalance, rows: 0 }
      current.amountIn += row.amountIn
      current.amountOut += row.amountOut
      current.balance = row.runningBalance
      current.rows += 1
      accountSummary.set(row.accountId, current)
    })

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(await buildWorkbook(visibleRows.map((row) => ({
        Account: row.accountName,
        AmountIn: row.amountIn,
        AmountOut: row.amountOut,
        Balance: row.runningBalance,
        Date: row.date,
        Description: row.description,
        DocNo: row.docNo,
        RefNo: row.refNo,
        RefType: row.refType,
        Type: row.type,
      }))), `finance_bank_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }

    const start = (query.page - 1) * query.pageSize
    const totalRows = visibleRows.length
    const refTypes = Array.from(new Set(sourceRows.map((row) => row.ref_type).filter((value): value is string => Boolean(value)))).sort()
    const types = Array.from(new Set(sourceRows.map((row) => row.type).filter((value): value is string => Boolean(value)))).sort()

    return NextResponse.json({
      byAccount: Array.from(accountSummary.values()).sort((left, right) => right.balance - left.balance),
      filters: {
        accounts: accounts.map((row) => ({
          accountNo: row.account_no,
          active: row.active,
          bankName: row.bank_name,
          branchName: row.branches?.name ?? '',
          code: requireBusinessCode(row.code, `บัญชีเงิน ${row.id}`),
          currency: row.currency,
          id: requireBusinessCode(row.code, `บัญชีเงิน ${row.id}`),
          name: row.name,
          openingBalance: toNumber(row.opening_balance),
          type: row.type,
          subtype: row.subtype,
          odLimit: row.od_limit ? toNumber(row.od_limit) : null,
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
        amountIn: visibleRows.reduce((sum, row) => sum + row.amountIn, 0),
        amountOut: visibleRows.reduce((sum, row) => sum + row.amountOut, 0),
        netMovement: visibleRows.reduce((sum, row) => sum + row.movement, 0),
        rows: visibleRows.length,
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Bank Statement ไม่ได้', 500)
  }
}
