import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { expenseFormSchema } from '@/lib/daily'
import { apiErrorResponse } from '@/lib/server/api-error'
import { findActiveAccountReferenceByCode } from '@/lib/server/account-reference'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, listDailyAccounts, nextDailyDocNo, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { hasLockedPaymentApproval } from '@/lib/server/payment-approval-pending'
import { prisma } from '@/lib/server/prisma'
import { activeVatRatePercent, activeWhtRatePercent } from '@/lib/server/tax-settings'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

function bangkokDateInput(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).formatToParts(value)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

type ExpenseWithRelations = Prisma.expensesGetPayload<{
  include: {
    accounts: true
    branches: true
    expense_categories: true
  }
}>

type ExpenseLineJson = {
  amount: number
  categoryId: string | null
  categoryName: string
  description: string | null
  hasVat: boolean
  id: string
  lineNo: number
  vatAmount: number
  vatPct: number
  whtAmount: number
  whtPct: number
}

function isPendingApprovalExpenseStatus(status: string | null | undefined) {
  const normalized = String(status ?? '').toLowerCase()
  return normalized === 'pending_approval'
}

function requireExpenseStatus(status: string | null | undefined) {
  const normalized = String(status ?? '').toLowerCase()
  if (normalized === 'pending_approval' || normalized === 'approved' || normalized === 'paid' || normalized === 'cancelled') return normalized
  throw new Error(`สถานะค่าใช้จ่ายไม่ถูกต้อง: ${status ?? '-'}`)
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function nullableStringValue(value: unknown) {
  const text = stringValue(value)
  return text || null
}

function numberValue(value: unknown) {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0
  return Number.isFinite(numeric) ? numeric : 0
}

function normalizeStoredExpenseLines(row: ExpenseWithRelations): ExpenseLineJson[] {
  const items = Array.isArray(row.items) ? row.items : []
  const lines = items
    .flatMap((item, index) => {
      if (!isRecord(item)) return []
      const amount = roundMoney(numberValue(item.amount))
      const vatAmount = roundMoney(numberValue(item.vatAmount))
      const whtAmount = roundMoney(numberValue(item.whtAmount))
      return [{
        amount,
        categoryId: nullableStringValue(item.categoryId),
        categoryName: stringValue(item.categoryName) || '-',
        description: nullableStringValue(item.description),
        hasVat: Boolean(item.hasVat) || vatAmount > 0,
        id: stringValue(item.id) || `line-${index + 1}`,
        lineNo: Math.max(1, Math.trunc(numberValue(item.lineNo)) || index + 1),
        vatAmount,
        vatPct: numberValue(item.vatPct),
        whtAmount,
        whtPct: numberValue(item.whtPct),
      }]
    })
    .filter((line) => line.amount > 0)

  if (lines.length > 0) return lines

  const amount = toNumber(row.amount)
  const vatAmount = toNumber(row.vat ?? row.vat_amount)
  const whtAmount = toNumber(row.wht ?? row.wht_amount)
  return [{
    amount,
    categoryId: row.expense_categories?.code ?? null,
    categoryName: row.expense_categories?.name ?? '-',
    description: row.description ?? null,
    hasVat: vatAmount > 0,
    id: 'line-1',
    lineNo: 1,
    vatAmount,
    vatPct: vatAmount > 0 && amount > 0 ? roundMoney((vatAmount / amount) * 100) : 0,
    whtAmount,
    whtPct: whtAmount > 0 && amount > 0 ? roundMoney((whtAmount / amount) * 100) : toNumber(row.wht_pct),
  }]
}

async function findExpenseByDocNo(
  client: Prisma.TransactionClient | typeof prisma,
  value: string,
  select?: Prisma.expensesSelect,
) {
  const expensesClient = client.expenses as typeof prisma.expenses
  return expensesClient.findFirst({
    select,
    where: { doc_no: value },
  })
}

function expenseJson(row: ExpenseWithRelations) {
  const status = requireExpenseStatus(row.status)
  const lines = normalizeStoredExpenseLines(row)
  const categoryNames = Array.from(new Set(lines.map((line) => line.categoryName).filter((name) => name && name !== '-')))
  const categoryName = categoryNames.length > 1 ? `${categoryNames[0]} +${categoryNames.length - 1}` : categoryNames[0] ?? row.expense_categories?.name ?? '-'
  return {
    accountId: row.accounts?.code ?? '',
    accountName: row.accounts?.name ?? '-',
    amount: toNumber(row.amount),
    branchId: row.branches?.code ?? '',
    categoryId: row.expense_categories?.code ?? lines[0]?.categoryId ?? '',
    categoryName,
    date: toDateOnly(row.date),
    description: row.description ?? '',
    docNo: row.doc_no,
    dueDate: toDateOnly(row.due_date),
    hasVat: toNumber(row.vat ?? row.vat_amount) > 0,
    hasWht: toNumber(row.wht ?? row.wht_amount) > 0,
    id: row.doc_no,
    lines,
    netAmount: toNumber(row.net_amount),
    notes: row.notes ?? '',
    payee: row.payee ?? '',
    refDocNo: row.ref_doc_no ?? '',
    status,
    taxInvoiceNo: row.tax_invoice_no ?? '',
    vat: toNumber(row.vat ?? row.vat_amount),
    wht: toNumber(row.wht ?? row.wht_amount),
  }
}

function expenseStatusLabel(status: string) {
  if (status === 'approved') return 'อนุมัติแล้ว'
  if (status === 'paid') return 'เสร็จสิ้น'
  if (status === 'cancelled') return 'ยกเลิกแล้ว'
  return 'ยังไม่อนุมัติ'
}

function buildWorkbook(rows: ReturnType<typeof expenseJson>[]) {
  const workbookRows = rows.map((row) => ({
    DocNo: row.docNo,
    Date: row.date,
    DueDate: row.dueDate || '',
    RefDocNo: row.refDocNo || '',
    Payee: row.payee,
    Category: row.categoryName,
    LineCount: row.lines.length,
    Account: row.accountName,
    Status: expenseStatusLabel(row.status),
    Amount: row.amount,
    VAT: row.vat,
    WHT: row.wht,
    NetAmount: row.netAmount,
    Description: row.lines.map((line) => line.description).filter(Boolean).join(' / ') || row.description || '',
  }))

  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(workbookRows)
  const headers = workbookRows[0] ? Object.keys(workbookRows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, workbookRows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Expenses')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
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
    const search = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const categoryId = url.searchParams.get('categoryId') || ''
    const accountId = url.searchParams.get('accountId') || ''
    const statuses = (url.searchParams.get('status') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    const dateFrom = url.searchParams.get('dateFrom') || ''
    const dateTo = url.searchParams.get('dateTo') || ''

    const accountReference = accountId ? await findActiveAccountReferenceByCode(accountId) : null
    if (accountId && accountReference == null) {
      throw new Error('บัญชีไม่ถูกต้อง')
    }

    const [accounts, categories, expenseTypes, rows, vatRatePercent, whtRatePercent] = await Promise.all([
      listDailyAccounts(),
      prisma.expense_categories.findMany({
        include: { expense_types: { select: { active: true, code: true, name: true } } },
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
      }),
      prisma.expense_types.findMany({
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        select: { active: true, code: true, name: true },
      }),
      prisma.expenses.findMany({
        include: {
          accounts: true,
          branches: true,
          expense_categories: true,
        },
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        where: {
          ...(accountReference != null ? { account_id: accountReference.id } : {}),
          ...(statuses.length > 0 ? { status: { in: statuses } } : {}),
          ...(dateFrom || dateTo
            ? {
                date: {
                  ...(dateFrom ? { gte: normalizeDate(dateFrom) } : {}),
                  ...(dateTo ? { lte: normalizeDate(dateTo) } : {}),
                },
              }
            : {}),
        },
        take: 5000,
      }),
      activeVatRatePercent(new Date()),
      activeWhtRatePercent(new Date()),
    ])

    const mappedRows = rows.map(expenseJson).filter((row) => {
      const lineSearchText = row.lines.map((line) => `${line.categoryName} ${line.description ?? ''}`).join(' ')
      return (
        (!categoryId || row.categoryId === categoryId || row.lines.some((line) => line.categoryId === categoryId)) &&
        (!search || `${row.docNo} ${row.payee} ${row.refDocNo ?? ''} ${row.description ?? ''} ${lineSearchText}`.toLowerCase().includes(search))
      )
    })

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(buildWorkbook(mappedRows), `daily_expenses_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }

    return NextResponse.json({
      accounts,
      categories: categories.map((row) => ({
        active: row.active,
        id: row.code,
        name: row.name,
        typeId: row.expense_types?.code ?? null,
        typeName: row.expense_types?.name ?? null,
      })),
      expenseTypes: expenseTypes.map((row) => ({ active: row.active, id: row.code, name: row.name })),
      rows: mappedRows,
      settings: { vatRatePercent, whtRatePercent },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการค่าใช้จ่ายไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const values = expenseFormSchema.parse(await request.json())
    const actor = currentActor(context)
    const rawLines = values.lines && values.lines.length > 0
      ? values.lines
      : [{
          amount: values.amount,
          categoryId: values.categoryId,
          description: values.description,
          hasVat: values.hasVat,
          id: null,
          vatAmount: 0,
          whtAmount: 0,
          whtPct: 0,
        }]
    const categoryCodes = Array.from(new Set(rawLines.map((line) => line.categoryId).filter((value): value is string => Boolean(value))))
    const [vatRatePercent, whtRatePercent, account, categoryRows, branch] = await Promise.all([
      activeVatRatePercent(new Date()),
      activeWhtRatePercent(new Date()),
      values.accountId
        ? findActiveAccountReferenceByCode(values.accountId)
        : Promise.resolve(null),
      categoryCodes.length > 0
        ? prisma.expense_categories.findMany({
            select: { active: true, code: true, id: true, name: true },
            where: { code: { in: categoryCodes } },
          })
        : Promise.resolve([]),
      values.branchId ? findActiveBranchReferenceByCodeOrId(values.branchId) : Promise.resolve(null),
    ])
    const categoryByCode = new Map(categoryRows.map((category) => [category.code, category]))
    const invalidCategoryCode = categoryCodes.find((code) => {
      const category = categoryByCode.get(code)
      return !category || category.active === false
    })
    if (invalidCategoryCode) throw new Error('หมวดค่าใช้จ่ายไม่ถูกต้องหรือถูกปิดใช้งาน')
    if (values.branchId && !branch) {
      throw new Error('สาขาไม่ถูกต้องหรือถูกปิดใช้งาน')
    }
    if (values.accountId && !account) {
      throw new Error('บัญชีจ่ายไม่ถูกต้อง')
    }
    const persistedLines = rawLines.map((line, index) => {
      const amount = roundMoney(line.amount)
      const vatAmount = line.hasVat ? roundMoney(amount * vatRatePercent / 100) : 0
      const submittedWhtPct = roundMoney(line.whtPct > 0 ? line.whtPct : values.hasWht ? whtRatePercent : 0)
      const whtAmount = submittedWhtPct > 0 ? roundMoney(amount * submittedWhtPct / 100) : 0
      const category = line.categoryId ? categoryByCode.get(line.categoryId) : null
      return {
        amount,
        categoryId: line.categoryId ?? null,
        categoryName: category?.name ?? '',
        description: line.description ?? null,
        hasVat: line.hasVat,
        id: line.id ?? `line-${index + 1}`,
        lineNo: index + 1,
        vatAmount,
        vatPct: line.hasVat ? vatRatePercent : 0,
        whtAmount,
        whtPct: submittedWhtPct,
      }
    })
    const amount = roundMoney(persistedLines.reduce((sum, line) => sum + line.amount, 0))
    const vatAmount = roundMoney(persistedLines.reduce((sum, line) => sum + line.vatAmount, 0))
    const whtAmount = roundMoney(persistedLines.reduce((sum, line) => sum + line.whtAmount, 0))
    const netAmount = amount + vatAmount - whtAmount
    const headerCategoryCode = persistedLines.find((line) => line.categoryId)?.categoryId ?? null
    const headerCategory = headerCategoryCode ? categoryByCode.get(headerCategoryCode) : null
    const generatedDescription = persistedLines.map((line) => line.description).filter(Boolean).join(' / ')
    const headerDescription = (values.description ?? generatedDescription).slice(0, 500) || null
    const whtPcts = Array.from(new Set(persistedLines.map((line) => line.whtPct).filter((pct) => pct > 0)))
    const headerWhtPct = whtPcts.length === 1 ? whtPcts[0] : 0

    const result = await prisma.$transaction(async (tx) => {
      const existingExpense = values.id
        ? await findExpenseByDocNo(tx, values.id, {
            date: true,
            doc_no: true,
            id: true,
            status: true,
          })
        : null
      if (values.id && !existingExpense) {
        throw new Error('ไม่พบรายการค่าใช้จ่าย')
      }
      if (existingExpense && !isPendingApprovalExpenseStatus(existingExpense.status)) {
        throw new Error('แก้ไขได้เฉพาะรายการค่าใช้จ่ายที่ยังไม่อนุมัติ')
      }
      if (existingExpense && await hasLockedPaymentApproval(tx, 'expense', existingExpense.id)) {
        throw new Error('แก้ไขไม่ได้ เพราะรายการค่าใช้จ่ายนี้มี PMA อนุมัติแล้ว')
      }

      const documentDateInput = existingExpense
        ? toDateOnly(existingExpense.date)
        : bangkokDateInput(new Date())
      const documentDate = normalizeDate(documentDateInput)
      const docNo = existingExpense?.doc_no ?? await nextDailyDocNo('expenses', 'EXP', documentDateInput)
      const persistedStatus = 'pending_approval'

      const expense = existingExpense
        ? await tx.expenses.update({
            where: { id: existingExpense.id },
            data: {
              account_id: account?.id ?? null,
              amount,
              branch_id: branch?.id ?? null,
              category_id: headerCategory?.id ?? null,
              date: documentDate,
              description: headerDescription,
              doc_no: docNo,
              due_date: values.dueDate ? normalizeDate(values.dueDate) : null,
              items: persistedLines as Prisma.InputJsonValue,
              net_amount: netAmount,
              notes: values.notes,
              paid_at: null,
              paid_status: 'unpaid',
              payee: values.payee,
              ref_doc_no: values.refDocNo,
              status: persistedStatus,
              tax_invoice_no: values.taxInvoiceNo,
              updated_at: new Date(),
              updated_by: actor,
              vat: vatAmount,
              vat_amount: vatAmount,
              voucher_id: docNo,
              wht: whtAmount,
              wht_amount: whtAmount,
              wht_pct: headerWhtPct,
            },
          })
        : await tx.expenses.create({
            data: {
              account_id: account?.id ?? null,
              amount,
              branch_id: branch?.id ?? null,
              category_id: headerCategory?.id ?? null,
              created_by: actor,
              date: documentDate,
              description: headerDescription,
              doc_no: docNo,
              due_date: values.dueDate ? normalizeDate(values.dueDate) : null,
              items: persistedLines as Prisma.InputJsonValue,
              net_amount: netAmount,
              notes: values.notes,
              paid_at: null,
              paid_status: 'unpaid',
              payee: values.payee,
              ref_doc_no: values.refDocNo,
              status: persistedStatus,
              tax_invoice_no: values.taxInvoiceNo,
              updated_at: new Date(),
              updated_by: actor,
              vat: vatAmount,
              vat_amount: vatAmount,
              voucher_id: docNo,
              wht: whtAmount,
              wht_amount: whtAmount,
              wht_pct: headerWhtPct,
            },
          })

      await tx.bank_statement.deleteMany({
        where: {
          ref_id: expense.id.toString(),
          ref_type: 'EXP',
        },
      })

      return expense
    })

    return NextResponse.json({ id: result.doc_no })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกรายการค่าใช้จ่ายไม่ได้', 400)
  }
}
