import { NextResponse } from 'next/server'
import { XLSX } from '@/lib/server/xlsx'
import { expenseFormSchema } from '@/lib/daily'
import { apiErrorResponse } from '@/lib/server/api-error'
import { findActiveAccountReferenceByCode } from '@/lib/server/account-reference'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, listDailyAccounts, nextBankStatementDocNos, nextDailyDocNo, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { hasLockedPaymentApproval } from '@/lib/server/payment-approval-pending'
import {
  appendPaymentStatusLog,
  createPaymentAccountSplitFacts,
  PAYMENT_STATUS_ACTION,
} from '@/lib/server/payment-history'
import { prisma } from '@/lib/server/prisma'
import { listActiveSupplierPaymentOptions } from '@/lib/server/reference-master-cache'
import { findActiveSupplierReferenceByCodeOrId } from '@/lib/server/supplier-reference'
import { activeVatRatePercent, activeWhtRatePercent } from '@/lib/server/tax-settings'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type ExpenseWithRelations = Prisma.expensesGetPayload<{
  include: {
    accounts: true
    branches: true
    expense_categories: true
    suppliers: true
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

type PayeeOption = {
  bankAccounts?: Array<{
    accountName: string | null
    accountNo: string | null
    active: boolean | null
    bankName: string | null
    code: string
    isPrimary: boolean | null
    paymentMethod: string | null
  }>
  code: string
  name: string
  source: 'customer' | 'supplier' | 'salesperson' | 'employee'
}

type SupplierPaymentOption = Awaited<ReturnType<typeof listActiveSupplierPaymentOptions>>[number]
type ExpenseJsonRow = ReturnType<typeof expenseJson>
type ExpenseCategoryLookupRow = {
  active: boolean | null
  code: string
  id: bigint
  name: string
}

function payeeSourceLabel(source: PayeeOption['source']) {
  if (source === 'supplier') return 'Supplier'
  return 'Supplier'
}

function normalizePayeeName(value: string | null | undefined) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function buildPayeeOptions(groups: PayeeOption[][]) {
  const byName = new Map<string, PayeeOption & { sourceLabel: string }>()
  for (const option of groups.flat()) {
    const name = normalizePayeeName(option.name)
    if (!name) continue
    const key = name.toLowerCase()
    const existing = byName.get(key)
    if (existing) {
      const nextSourceLabel = payeeSourceLabel(option.source)
      const sources = new Set(existing.sourceLabel.split(', '))
      sources.add(nextSourceLabel)
      byName.set(key, { ...existing, sourceLabel: Array.from(sources).join(', ') })
      continue
    }
    byName.set(key, {
      ...option,
      name,
      sourceLabel: payeeSourceLabel(option.source),
    })
  }
  return Array.from(byName.values()).sort((left, right) => left.name.localeCompare(right.name, 'th'))
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

function branchPaymentCode(branchCode: string | null | undefined) {
  const digits = String(branchCode ?? '').replace(/\D/g, '')
  return digits ? digits.padStart(2, '0').slice(-2) : null
}

async function nextSupplierPaymentDocNo(tx: Prisma.TransactionClient, date: string, branchCode: string) {
  const compactDate = date.slice(2, 4) + date.slice(5, 7)
  const startsWith = `PMT${branchCode}${compactDate}-`
  const rows = await tx.$queryRaw<Array<{ doc_no: string }>>`
    select doc_no
    from public.payments
    where doc_no like ${`PMT${compactDate}-%`}
       or doc_no like ${`PMT__${compactDate}-%`}
  `
  const lastNumber = rows.reduce((max: number, row: { doc_no: string }) => {
    const running = Number(row.doc_no.split('-').at(-1))
    return Number.isFinite(running) && running > max ? running : max
  }, 0)
  return `${startsWith}${String(lastNumber + 1).padStart(4, '0')}`
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
    .flatMap((item: unknown, index: number) => {
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
    .filter((line: ExpenseLineJson) => line.amount > 0)

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
    bankFee: 0,
    branchId: row.branches?.code ?? '',
    categoryId: row.expense_categories?.code ?? lines[0]?.categoryId ?? '',
    categoryName,
    date: toDateOnly(row.date),
    description: row.description ?? '',
    discount: 0,
    docNo: row.doc_no,
    dueDate: toDateOnly(row.due_date),
    hasVat: toNumber(row.vat ?? row.vat_amount) > 0,
    hasWht: toNumber(row.wht ?? row.wht_amount) > 0,
    id: row.doc_no,
    lines,
    netAmount: toNumber(row.net_amount),
    notes: row.notes ?? '',
    payee: row.suppliers?.name ?? row.payee ?? '',
    paymentAction: 'submit_approval' as const,
    refDocNo: row.ref_doc_no ?? '',
    status,
    supplierId: row.suppliers?.code ?? '',
    supplierPaymentDestinationId: null,
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

async function buildWorkbook(rows: ReturnType<typeof expenseJson>[]) {
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

    const [
      accounts,
      categories,
      supplierPayees,
      rows,
      vatRatePercent,
      whtRatePercent,
    ] = await Promise.all([
      listDailyAccounts(),
      prisma.expense_categories.findMany({
        include: { expense_types: { select: { active: true, code: true, name: true } } },
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
      }),
      listActiveSupplierPaymentOptions(),
      prisma.expenses.findMany({
        include: {
          accounts: true,
          branches: true,
          expense_categories: true,
          suppliers: true,
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

    const mappedRows = rows.map(expenseJson).filter((row: ExpenseJsonRow) => {
      const lineSearchText = row.lines.map((line: ExpenseLineJson) => `${line.categoryName} ${line.description ?? ''}`).join(' ')
      return (
        (!categoryId || row.categoryId === categoryId || row.lines.some((line: ExpenseLineJson) => line.categoryId === categoryId)) &&
        (!search || `${row.docNo} ${row.payee} ${row.refDocNo ?? ''} ${row.description ?? ''} ${lineSearchText}`.toLowerCase().includes(search))
      )
    })

    const payeeOptions = buildPayeeOptions([
      supplierPayees.map((row: SupplierPaymentOption) => ({
        bankAccounts: row.bankAccounts.map((account, index) => ({
          accountName: null,
          accountNo: account.accountNo,
          active: account.active,
          bankName: account.bankName,
          code: `${row.code}:${index}`,
          isPrimary: index === 0,
          paymentMethod: account.paymentMethod,
        })),
        code: row.code,
        name: row.name,
        source: 'supplier' as const,
      })),
    ])

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(await buildWorkbook(mappedRows), `daily_expenses_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }

    return NextResponse.json({
      accounts,
      categories: categories.map((row: { active: boolean | null, code: string, expense_types: { code: string, name: string } | null, name: string }) => ({
        active: row.active,
        id: row.code,
        name: row.name,
        typeId: row.expense_types?.code ?? null,
        typeName: row.expense_types?.name ?? null,
      })),
      payeeOptions,
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
    const [vatRatePercent, whtRatePercent, account, categoryRows, branch, supplier]: [
      number,
      number,
      Awaited<ReturnType<typeof findActiveAccountReferenceByCode>> | null,
      ExpenseCategoryLookupRow[],
      Awaited<ReturnType<typeof findActiveBranchReferenceByCodeOrId>> | null,
      Awaited<ReturnType<typeof findActiveSupplierReferenceByCodeOrId>> | null,
    ] = await Promise.all([
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
        : Promise.resolve<ExpenseCategoryLookupRow[]>([]),
      values.branchId ? findActiveBranchReferenceByCodeOrId(values.branchId) : Promise.resolve(null),
      findActiveSupplierReferenceByCodeOrId(values.supplierId),
    ])
    const categoryByCode = new Map<string, ExpenseCategoryLookupRow>(categoryRows.map((category: ExpenseCategoryLookupRow) => [category.code, category] as const))
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
    if (!supplier) {
      throw new Error('เลือก Supplier ผู้รับเงินให้ถูกต้อง')
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

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      const documentDateInput = values.date
      const documentDate = normalizeDate(documentDateInput)
      if (!existingExpense) {
        await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('expenses.doc_no'))`
      }
      const docNo = existingExpense?.doc_no ?? await nextDailyDocNo('expenses', 'EXP', documentDateInput, tx)
      const isPayNow = values.paymentAction === 'pay_now'
      const persistedStatus = isPayNow ? 'paid' : 'pending_approval'
      const selectedDestination = isPayNow
        ? await tx.supplier_bank_accounts.findFirst({
            include: { bank_names: { select: { name: true } } },
            where: {
              active: { not: false },
              code: values.supplierPaymentDestinationId ?? '',
              supplier_id: supplier.id,
            },
          })
        : null
      if (isPayNow && !selectedDestination) {
        throw new Error('เลือกช่องทางรับเงินของ Supplier ให้ถูกต้อง')
      }
      const paymentAccount = isPayNow && account
        ? await tx.accounts.findUnique({
            select: { branch_id: true, code: true, id: true, name: true },
            where: { id: account.id },
          })
        : null
      if (isPayNow && !paymentAccount) {
        throw new Error('เลือกบัญชีที่จ่ายของบริษัทให้ถูกต้อง')
      }
      const paymentBranchId = branch?.id ?? paymentAccount?.branch_id ?? null
      const paymentBranch = paymentBranchId
        ? await tx.branches.findFirst({ select: { code: true }, where: { active: true, id: paymentBranchId } })
        : null
      const paymentBranchCode = isPayNow ? branchPaymentCode(paymentBranch?.code) : null
      if (isPayNow && !paymentBranchCode) {
        throw new Error('ไม่พบสาขาสำหรับออกเลข PMT')
      }

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
              paid_at: isPayNow ? new Date() : null,
              paid_status: isPayNow ? 'paid' : 'unpaid',
              payee: supplier.name,
              payee_account_name: selectedDestination?.account_name ?? null,
              payee_account_no: selectedDestination?.account_no ?? null,
              payee_bank: selectedDestination?.bank_names?.name ?? selectedDestination?.payment_method ?? null,
              ref_doc_no: values.refDocNo,
              status: persistedStatus,
              supplier_id: supplier.id,
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
              paid_at: isPayNow ? new Date() : null,
              paid_status: isPayNow ? 'paid' : 'unpaid',
              payee: supplier.name,
              payee_account_name: selectedDestination?.account_name ?? null,
              payee_account_no: selectedDestination?.account_no ?? null,
              payee_bank: selectedDestination?.bank_names?.name ?? selectedDestination?.payment_method ?? null,
              ref_doc_no: values.refDocNo,
              status: persistedStatus,
              supplier_id: supplier.id,
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

      if (isPayNow) {
        if (!paymentAccount || !paymentBranchCode) throw new Error('ข้อมูลบัญชีจ่ายไม่ครบถ้วน')
        await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('payments.doc_no'))`
        const paymentDocNo = await nextSupplierPaymentDocNo(tx, values.date, paymentBranchCode)
        const voucherId = paymentDocNo
        const paidAt = new Date()
        const discount = Math.min(roundMoney(values.discount), Math.max(0, netAmount - 0.01))
        const bankFee = roundMoney(values.bankFee)
        const paymentAmount = roundMoney(netAmount - discount)
        const paymentNetAmount = roundMoney(paymentAmount + bankFee)
        if (paymentAmount <= 0) throw new Error('ยอดจ่ายหลังหักส่วนลดต้องมากกว่า 0')

        const payment = await tx.payments.create({
          data: {
            account_id: paymentAccount.id,
            amount: paymentAmount,
            bank_fee: bankFee,
            branch_id: paymentBranchId,
            created_by: actor,
            date: documentDate,
            discount,
            doc_no: paymentDocNo,
            fee: bankFee,
            lines: [{
              amount: paymentAmount,
              discount,
              fee: bankFee,
              sourceDocNo: docNo,
              sourceId: expense.id.toString(),
              sourceType: 'expense',
            }] as Prisma.InputJsonValue,
            method: selectedDestination?.payment_method ?? selectedDestination?.bank_names?.name ?? 'จ่ายค่าใช้จ่าย',
            net_amount: paymentNetAmount,
            notes: values.notes,
            status: 'active',
            supplier_id: supplier.id,
            updated_at: paidAt,
            updated_by: actor,
            voucher_id: voucherId,
            withholding_tax: 0,
          },
        })

        await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('bank_statement.doc_no'))`
        const [statementDocNo] = await nextBankStatementDocNos(values.date, 1, tx)
        if (!statementDocNo) throw new Error('ออกเลข Bank Statement ไม่ได้')
        const bankStatement = await tx.bank_statement.create({
          data: {
            account_id: paymentAccount.id,
            amount_in: 0,
            amount_out: paymentNetAmount,
            created_by: actor,
            date: documentDate,
            description: `${paymentDocNo} - จ่ายค่าใช้จ่าย ${docNo}`,
            doc_no: statementDocNo,
            ref_id: voucherId,
            ref_no: paymentDocNo,
            ref_type: 'PMT',
            type: 'จ่ายเงินผู้รับเงิน',
          },
        })
        await createPaymentAccountSplitFacts(tx, [{
          accountCodeSnapshot: paymentAccount.code,
          accountId: paymentAccount.id,
          accountNameSnapshot: paymentAccount.name,
          actor,
          amount: paymentNetAmount,
          bankStatementDocNo: statementDocNo,
          bankStatementId: bankStatement.id,
          createdAt: paidAt,
          paymentDocNo,
          paymentId: payment.id,
          paymentVoucherId: voucherId,
          splitKey: `PMTSPLIT-${paymentDocNo}-${statementDocNo}`,
        }])
        await appendPaymentStatusLog(tx, {
          action: PAYMENT_STATUS_ACTION.POSTED,
          actor,
          amountSnapshot: paymentAmount,
          createdAt: paidAt,
          fromStatus: null,
          meta: {
            directExpense: true,
            discount,
            expenseDocNo: docNo,
            fee: bankFee,
            sourceType: 'expense',
            voucherId,
          },
          netAmountSnapshot: paymentNetAmount,
          paymentDocNo,
          paymentId: payment.id,
          paymentVoucherId: voucherId,
          toStatus: 'active',
        })
        await appendPaymentStatusLog(tx, {
          action: PAYMENT_STATUS_ACTION.BANK_POSTED,
          actor,
          amountSnapshot: paymentAmount,
          createdAt: paidAt,
          fromStatus: null,
          meta: {
            bankStatementDocNos: [statementDocNo],
            directExpense: true,
            splitCount: 1,
            voucherId,
          },
          netAmountSnapshot: paymentNetAmount,
          paymentDocNo,
          paymentId: payment.id,
          paymentVoucherId: voucherId,
          toStatus: 'active',
        })
      }

      return expense
    })

    return NextResponse.json({ id: result.doc_no })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกรายการค่าใช้จ่ายไม่ได้', 400)
  }
}
