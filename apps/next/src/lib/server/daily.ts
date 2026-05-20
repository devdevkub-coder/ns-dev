import type { Prisma } from '../../../generated/prisma/client'
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

export async function nextDailyDocNo(table: 'expenses' | 'payments' | 'petty_advances' | 'purchase_bills' | 'receipts' | 'sales_bills' | 'transfers', prefix: string, date: string) {
  const compactDate = date.slice(2, 4) + date.slice(5, 7)
  const startsWith = `${prefix}${compactDate}-`
  const model = prisma[table] as unknown as {
    findFirst: (args: {
      orderBy: { doc_no: 'desc' }
      select: { doc_no: true }
      where: { doc_no: { startsWith: string } }
    }) => Promise<{ doc_no: string } | null>
  }
  const last = await model.findFirst({
    orderBy: { doc_no: 'desc' },
    select: { doc_no: true },
    where: { doc_no: { startsWith } },
  })
  const lastNumber = Number(String(last?.doc_no ?? '').slice(startsWith.length))
  const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1
  return `${startsWith}${String(nextNumber).padStart(4, '0')}`
}

export async function listDailyAccounts() {
  const accounts = await prisma.accounts.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }, { account_no: 'asc' }],
    select: {
      active: true,
      account_no: true,
      id: true,
      name: true,
      type: true,
    },
  })

  return accounts.map((account) => ({
    active: account.active ?? true,
    code: account.account_no,
    id: account.id,
    name: account.name,
    type: account.type,
  }))
}

export function bankStatementTransferRows(values: {
  amount: number
  by: string
  date: string
  docNo: string
  fee: number
  fromAccountId: string
  fromAccountName: string
  id: string
  toAccountId: string
  toAccountName: string
}): Prisma.bank_statementCreateManyInput[] {
  return [
    {
      account_id: values.fromAccountId,
      amount_in: 0,
      amount_out: values.amount + values.fee,
      created_by: values.by,
      date: normalizeDate(values.date),
      description: `โอนเข้า ${values.toAccountName}`,
      id: `BS-TRF-${values.id}-from`,
      ref_id: values.id,
      ref_no: values.docNo,
      ref_type: 'TRF',
      type: 'โอนระหว่างบัญชี',
    },
    {
      account_id: values.toAccountId,
      amount_in: values.amount,
      amount_out: 0,
      created_by: values.by,
      date: normalizeDate(values.date),
      description: `รับโอนจาก ${values.fromAccountName}`,
      id: `BS-TRF-${values.id}-to`,
      ref_id: values.id,
      ref_no: values.docNo,
      ref_type: 'TRF',
      type: 'โอนระหว่างบัญชี',
    },
  ]
}
