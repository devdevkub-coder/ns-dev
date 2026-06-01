import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import * as XLSX from 'xlsx'
import { expenseFormSchema } from '@/lib/daily'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, listDailyAccounts, nextDailyDocNo, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
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
    expense_categories: true
  }
}>

function isPendingApprovalExpenseStatus(status: string | null | undefined) {
  const normalized = String(status ?? '').toLowerCase()
  return normalized === 'pending_approval' || normalized === 'pending' || normalized === ''
}

function expenseJson(row: ExpenseWithRelations) {
  const rawStatus = String(row.status ?? row.paid_status ?? '').toLowerCase()
  const status = rawStatus === 'approved' || rawStatus === 'paid' || rawStatus === 'cancelled' || rawStatus === 'pending_approval'
    ? rawStatus
    : rawStatus === 'paid'
      ? 'paid'
      : 'pending_approval'
  return {
    accountId: row.account_id ?? '',
    accountName: row.accounts?.name ?? '-',
    amount: toNumber(row.amount),
    branchId: row.branch_id ?? '',
    categoryId: row.category_id ?? '',
    categoryName: row.expense_categories?.name ?? '-',
    date: toDateOnly(row.date),
    description: row.description ?? '',
    docNo: row.doc_no,
    dueDate: toDateOnly(row.due_date),
    hasVat: toNumber(row.vat ?? row.vat_amount) > 0,
    hasWht: toNumber(row.wht ?? row.wht_amount) > 0,
    id: row.id,
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
    Account: row.accountName,
    Status: expenseStatusLabel(row.status),
    Amount: row.amount,
    VAT: row.vat,
    WHT: row.wht,
    NetAmount: row.netAmount,
    Description: row.description || '',
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

    const [accounts, categories, rows, vatRatePercent, whtRatePercent] = await Promise.all([
      listDailyAccounts(),
      prisma.expense_categories.findMany({
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        select: { active: true, id: true, name: true },
      }),
      prisma.expenses.findMany({
        include: {
          accounts: true,
          expense_categories: true,
        },
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        where: {
          ...(categoryId ? { category_id: categoryId } : {}),
          ...(accountId ? { account_id: accountId } : {}),
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

    const mappedRows = rows.map(expenseJson).filter((row) => (
      !search || `${row.docNo} ${row.payee} ${row.refDocNo ?? ''} ${row.description ?? ''}`.toLowerCase().includes(search)
    ))

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(buildWorkbook(mappedRows), `daily_expenses_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }

    return NextResponse.json({ accounts, categories, rows: mappedRows, settings: { vatRatePercent, whtRatePercent } })
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
    const id = values.id ?? `EXP-${randomUUID()}`
    const actor = currentActor(context)
    const [vatRatePercent, whtRatePercent] = await Promise.all([
      activeVatRatePercent(new Date()),
      activeWhtRatePercent(new Date()),
    ])
    const vatAmount = values.hasVat ? Math.round(((values.amount * vatRatePercent / 100) + Number.EPSILON) * 100) / 100 : 0
    const whtAmount = values.hasWht ? Math.round(((values.amount * whtRatePercent / 100) + Number.EPSILON) * 100) / 100 : 0
    const netAmount = values.amount + vatAmount - whtAmount

    const result = await prisma.$transaction(async (tx) => {
      const existingExpense = values.id ? await tx.expenses.findUnique({
        select: { date: true, doc_no: true, status: true },
        where: { id: values.id },
      }) : null
      if (existingExpense && !isPendingApprovalExpenseStatus(existingExpense.status)) {
        throw new Error('แก้ไขได้เฉพาะรายการค่าใช้จ่ายที่ยังไม่อนุมัติ')
      }

      const documentDateInput = existingExpense
        ? toDateOnly(existingExpense.date)
        : bangkokDateInput(new Date())
      const documentDate = normalizeDate(documentDateInput)
      const docNo = existingExpense?.doc_no ?? await nextDailyDocNo('expenses', 'EXP', documentDateInput)
      const persistedStatus = 'pending_approval'

      const expense = await tx.expenses.upsert({
        where: { id },
        create: {
          account_id: values.accountId,
          amount: values.amount,
          branch_id: values.branchId,
          category_id: values.categoryId,
          created_by: actor,
          date: documentDate,
          description: values.description,
          doc_no: docNo,
          due_date: values.dueDate ? normalizeDate(values.dueDate) : null,
          id,
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
          voucher_id: id,
          wht: whtAmount,
          wht_amount: whtAmount,
        },
        update: {
          account_id: values.accountId,
          amount: values.amount,
          branch_id: values.branchId,
          category_id: values.categoryId,
          date: documentDate,
          description: values.description,
          doc_no: docNo,
          due_date: values.dueDate ? normalizeDate(values.dueDate) : null,
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
          voucher_id: id,
          wht: whtAmount,
          wht_amount: whtAmount,
        },
      })

      await tx.bank_statement.deleteMany({
        where: {
          ref_id: id,
          ref_type: 'EXP',
        },
      })

      return expense
    })

    return NextResponse.json({ id: result.id })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกรายการค่าใช้จ่ายไม่ได้', 400)
  }
}
