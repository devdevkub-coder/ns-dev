import type { Prisma } from '../../../generated/prisma/client'
import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'

export function toDateOnly(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : ''
}

export function toNumber(value: { toNumber: () => number } | number | null | undefined) {
  if (value === null || value === undefined) return 0
  return typeof value === 'number' ? value : value.toNumber()
}

export function normalizeDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

export function currentActor(context: { appUser: { username: string } | null; authUser: { email?: string } }) {
  return context.appUser?.username ?? context.authUser.email ?? '-'
}

type DailyDocNoTable = 'bank_statement' | 'customer_receipts' | 'expenses' | 'payments' | 'petty_advance_returns' | 'petty_advances' | 'purchase_bills' | 'receipts' | 'sales_bills' | 'stock_issues' | 'transfers'
type DailyDocNoModel = {
  findFirst: (args: {
    orderBy: { doc_no: 'desc' }
    select: { doc_no: true }
    where: { doc_no: { startsWith: string } }
  }) => Promise<{ doc_no: string } | null>
}
type BankStatementHistoryModel = {
  findFirst: (args: {
    orderBy: { bank_statement_doc_no: 'desc' }
    select: { bank_statement_doc_no: true }
    where: { bank_statement_doc_no: { startsWith: string } }
  }) => Promise<{ bank_statement_doc_no: string | null } | null>
}

function dailyDocNoModel(client: unknown, table: DailyDocNoTable) {
  return (client as Record<DailyDocNoTable, DailyDocNoModel>)[table]
}

function docNoRunningNumber(docNo: string | null | undefined, startsWith: string) {
  const running = Number(String(docNo ?? '').slice(startsWith.length))
  return Number.isFinite(running) ? running : 0
}

export async function nextDailyDocNo(table: DailyDocNoTable, prefix: string, date: string, client: unknown = prisma) {
  const compactDate = date.slice(2, 4) + date.slice(5, 7)
  const startsWith = `${prefix}${compactDate}-`
  const model = dailyDocNoModel(client, table)
  const last = await model.findFirst({
    orderBy: { doc_no: 'desc' },
    select: { doc_no: true },
    where: { doc_no: { startsWith } },
  })
  const nextNumber = docNoRunningNumber(last?.doc_no, startsWith) + 1
  return `${startsWith}${String(nextNumber).padStart(4, '0')}`
}

export async function nextDailyDocNos(
  table: DailyDocNoTable,
  prefix: string,
  date: string,
  count: number,
  client: unknown = prisma,
) {
  if (count <= 0) return []
  const compactDate = date.slice(2, 4) + date.slice(5, 7)
  const startsWith = `${prefix}${compactDate}-`
  const model = dailyDocNoModel(client, table)
  const last = await model.findFirst({
    orderBy: { doc_no: 'desc' },
    select: { doc_no: true },
    where: { doc_no: { startsWith } },
  })
  const startNumber = docNoRunningNumber(last?.doc_no, startsWith) + 1
  return Array.from({ length: count }, (_, index) => `${startsWith}${String(startNumber + index).padStart(4, '0')}`)
}

export async function nextBankStatementDocNos(date: string, count: number, client: unknown = prisma) {
  if (count <= 0) return []
  const compactDate = date.slice(2, 4) + date.slice(5, 7)
  const startsWith = `BST${compactDate}-`
  const model = dailyDocNoModel(client, 'bank_statement')
  const historyModel = (client as { payment_account_splits?: BankStatementHistoryModel }).payment_account_splits
  const [lastStatement, lastPaymentSplit] = await Promise.all([
    model.findFirst({
      orderBy: { doc_no: 'desc' },
      select: { doc_no: true },
      where: { doc_no: { startsWith } },
    }),
    historyModel?.findFirst({
      orderBy: { bank_statement_doc_no: 'desc' },
      select: { bank_statement_doc_no: true },
      where: { bank_statement_doc_no: { startsWith } },
    }) ?? Promise.resolve(null),
  ])
  const startNumber = Math.max(
    docNoRunningNumber(lastStatement?.doc_no, startsWith),
    docNoRunningNumber(lastPaymentSplit?.bank_statement_doc_no, startsWith),
  ) + 1
  return Array.from({ length: count }, (_, index) => `${startsWith}${String(startNumber + index).padStart(4, '0')}`)
}

export async function listDailyAccounts() {
  const [accounts, statementTotals] = await Promise.all([
    prisma.accounts.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }, { account_no: 'asc' }],
      select: {
        active: true,
        account_no: true,
        code: true,
        id: true,
        name: true,
        opening_balance: true,
        type: true,
        subtype: true,
        od_limit: true,
      },
    }),
    prisma.bank_statement.groupBy({
      by: ['account_id'],
      _sum: {
        amount_in: true,
        amount_out: true,
      },
      where: { account_id: { not: null } },
    }),
  ])
  const statementTotalByAccountId = new Map(statementTotals.map((total) => [
    total.account_id?.toString() ?? '',
    toNumber(total._sum.amount_in) - toNumber(total._sum.amount_out),
  ] as const))

  return accounts.map((account) => {
    const realBalance = toNumber(account.opening_balance) + (statementTotalByAccountId.get(account.id.toString()) ?? 0)
    const odLimit = toNumber(account.od_limit)
    const odUsed = Math.max(0, -realBalance)
    const odRemaining = Math.max(0, odLimit - odUsed)
    const availableToPay = realBalance + odLimit

    return {
      active: account.active ?? true,
      balance: realBalance,
      code: account.account_no,
      id: requireBusinessCode(account.code, `บัญชีเงิน ${account.id}`),
      name: account.name,
      type: account.type,
      subtype: account.subtype,
      odLimit,
      odUsed,
      odRemaining,
      availableToPay,
    }
  })
}

export function bankStatementTransferRows(values: {
  amount: number
  by: string
  date: string
  docNo: string
  entryDocNos: [string, string]
  fee: number
  fromAccountId: string
  fromAccountName: string
  id: string
  toAccountId: string
  toAccountName: string
}): Prisma.bank_statementCreateManyInput[] {
  const fromAccountId = parseInternalBigIntId(values.fromAccountId)
  const toAccountId = parseInternalBigIntId(values.toAccountId)
  if (fromAccountId == null || toAccountId == null) {
    throw new Error('บัญชีต้นทางหรือปลายทางไม่ถูกต้อง')
  }
  return [
    {
      account_id: fromAccountId,
      amount_in: 0,
      amount_out: values.amount + values.fee,
      created_by: values.by,
      date: normalizeDate(values.date),
      description: `โอนเข้า ${values.toAccountName}`,
      doc_no: values.entryDocNos[0],
      ref_id: values.id,
      ref_no: values.docNo,
      ref_type: 'TRF',
      type: 'โอนระหว่างบัญชี',
    },
    {
      account_id: toAccountId,
      amount_in: values.amount,
      amount_out: 0,
      created_by: values.by,
      date: normalizeDate(values.date),
      description: `รับโอนจาก ${values.fromAccountName}`,
      doc_no: values.entryDocNos[1],
      ref_id: values.id,
      ref_no: values.docNo,
      ref_type: 'TRF',
      type: 'โอนระหว่างบัญชี',
    },
  ]
}
