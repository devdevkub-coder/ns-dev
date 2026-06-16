import { NextResponse } from 'next/server'
import { z } from 'zod'
import { pettyAdvanceFormSchema } from '@/lib/daily'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, listDailyAccounts, nextDailyDocNo, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type PettyAdvanceWithRelations = Prisma.petty_advancesGetPayload<{
  include: {
    accounts: true
    petty_advance_returns: {
      include: {
        accounts: true
      }
    }
  }
}>

type PettyAdvanceRecipientRow = {
  account_no: string | null
  bank_account: string | null
  bank_account_name: string | null
  bank_branch: string | null
  bank_name: string | null
  code: string
  first_name: string | null
  last_name: string | null
  name: string
  name_title: string | null
  type: string | null
}

type PettyAdvanceRecipientOption = {
  accountNo: string
  bankAccountLabel: string
  bankAccountName: string
  bankBranch: string
  bankName: string
  description: string
  hasReceivingAccount: boolean
  id: string
  label: string
  searchText: string
  type: string
}

const pettyAdvanceRecipientTypes = ['กรรมการ', 'พนักงาน']

async function findPettyAdvanceByDocNo(
  client: Prisma.TransactionClient | typeof prisma,
  value: string,
  select?: Prisma.petty_advancesSelect,
) {
  const advancesClient = client.petty_advances as typeof prisma.petty_advances
  return advancesClient.findFirst({
    select,
    where: { doc_no: value },
  })
}

function cleanText(value: string | null | undefined) {
  return value?.trim() ?? ''
}

function displayPersonName(row: PettyAdvanceRecipientRow) {
  const splitName = [row.name_title, row.first_name, row.last_name].map(cleanText).filter(Boolean).join(' ')
  return splitName || row.name
}

function formatAccountNoDisplay(value: string) {
  if (/^\d{10}$/.test(value)) return `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6)}`
  return value
}

function formatBankLabel(input: { accountName?: string | null; accountNo?: string | null; bankBranch?: string | null; bankName?: string | null }) {
  const bankName = cleanText(input.bankName)
  const accountName = cleanText(input.accountName)
  const accountNo = cleanText(input.accountNo)
  const bankBranch = cleanText(input.bankBranch)
  return [
    bankName,
    accountName,
    accountNo ? formatAccountNoDisplay(accountNo) : '',
    bankBranch ? `สาขา ${bankBranch}` : '',
  ].filter(Boolean).join(' / ')
}

function mapPettyAdvanceRecipient(row: PettyAdvanceRecipientRow): PettyAdvanceRecipientOption {
  const label = displayPersonName(row)
  const bankName = cleanText(row.bank_name)
  const bankAccountName = cleanText(row.bank_account_name) || label
  const accountNo = cleanText(row.account_no || row.bank_account)
  const bankBranch = cleanText(row.bank_branch)
  const bankAccountLabel = formatBankLabel({
    accountName: bankAccountName,
    accountNo,
    bankBranch,
    bankName,
  })
  const type = cleanText(row.type)
  const hasReceivingAccount = Boolean(bankName && bankAccountName && accountNo && /^\d+$/.test(accountNo))

  return {
    accountNo,
    bankAccountLabel,
    bankAccountName,
    bankBranch,
    bankName,
    description: [type, row.code, bankAccountLabel].filter(Boolean).join(' · '),
    hasReceivingAccount,
    id: row.code,
    label,
    searchText: [row.code, label, type, bankName, bankAccountName, accountNo, bankBranch].filter(Boolean).join(' '),
    type,
  }
}

async function listPettyAdvanceRecipients() {
  const rows = await prisma.director_employees.findMany({
    orderBy: [{ code: 'asc' }],
    select: {
      account_no: true,
      bank_account: true,
      bank_account_name: true,
      bank_branch: true,
      bank_name: true,
      code: true,
      first_name: true,
      last_name: true,
      name: true,
      name_title: true,
      type: true,
    },
    where: {
      active: true,
      type: { in: pettyAdvanceRecipientTypes },
    },
  })

  return rows.map(mapPettyAdvanceRecipient).filter((row) => row.hasReceivingAccount)
}

async function findPettyAdvanceRecipient(code: string) {
  const row = await prisma.director_employees.findFirst({
    select: {
      account_no: true,
      bank_account: true,
      bank_account_name: true,
      bank_branch: true,
      bank_name: true,
      code: true,
      first_name: true,
      last_name: true,
      name: true,
      name_title: true,
      type: true,
    },
    where: {
      active: true,
      code,
      type: { in: pettyAdvanceRecipientTypes },
    },
  })
  if (!row) return null
  return mapPettyAdvanceRecipient(row)
}

function pettyAdvanceFieldError(path: string, message: string) {
  return new z.ZodError([{ code: z.ZodIssueCode.custom, message, path: [path] }])
}

function advanceJson(row: PettyAdvanceWithRelations, pendingReturn = 0) {
  const returned = toNumber(row.returned_amount)
  const spent = 0
  const amount = toNumber(row.amount)

  return {
    accountId: row.accounts?.code ?? '',
    accountName: row.accounts?.name ?? '-',
    amount,
    date: toDateOnly(row.date),
    docNo: row.doc_no,
    id: row.doc_no,
    notes: row.notes ?? '',
    pendingReturn,
    recipientAccountLabel: formatBankLabel({
      accountName: row.recipient_bank_account_name,
      accountNo: row.recipient_account_no,
      bankBranch: row.recipient_bank_branch,
      bankName: row.recipient_bank_name,
    }),
    recipientAccountNo: row.recipient_account_no ?? '',
    recipientBankAccountName: row.recipient_bank_account_name ?? '',
    recipientBankBranch: row.recipient_bank_branch ?? '',
    recipientBankName: row.recipient_bank_name ?? '',
    recipientId: row.recipient_person_code ?? '',
    recipientName: row.recipient_name,
    remaining: amount - spent - returned,
    returned,
    returns: row.petty_advance_returns?.map((entry) => ({
      accountId: entry.accounts?.code ?? '',
      accountName: entry.accounts?.name ?? '-',
      amount: toNumber(entry.amount),
      date: toDateOnly(entry.date),
      docNo: entry.doc_no,
      id: entry.doc_no,
      notes: entry.notes ?? '',
    })) ?? [],
    spent,
    status: row.status,
    type: row.type,
  }
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const [accounts, rows, recipientOptions, pendingReturnApprovals] = await Promise.all([
      listDailyAccounts(),
      prisma.petty_advances.findMany({
        include: {
          accounts: true,
          petty_advance_returns: {
            include: { accounts: true },
            orderBy: [{ date: 'desc' }],
          },
        },
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        take: 5000,
      }),
      listPettyAdvanceRecipients(),
      prisma.payment_approvals.findMany({
        select: {
          approved_amount: true,
          source_id: true,
        },
        where: {
          source_type: 'petty_advance_return',
          status: 'pending',
        },
      }),
    ])
    const pendingReturnByAdvanceId = new Map<string, number>()
    pendingReturnApprovals.forEach((approval) => {
      pendingReturnByAdvanceId.set(approval.source_id, (pendingReturnByAdvanceId.get(approval.source_id) ?? 0) + toNumber(approval.approved_amount))
    })

    return NextResponse.json({ accounts, recipientOptions, rows: rows.map((row) => advanceJson(row, pendingReturnByAdvanceId.get(row.id.toString()) ?? 0)) })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดเงินสำรองจ่ายไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const values = pettyAdvanceFormSchema.parse(await request.json())
    const actor = currentActor(context)
    const recipient = await findPettyAdvanceRecipient(values.recipientId)
    if (!recipient) {
      throw pettyAdvanceFieldError('recipientId', 'เลือกผู้รับเงินจากรายชื่อกรรมการ/พนักงานที่ใช้งานอยู่')
    }
    if (!recipient.hasReceivingAccount) {
      throw pettyAdvanceFieldError('recipientId', 'ผู้รับเงินนี้ยังไม่มีบัญชีรับเงินในข้อมูลหลัก')
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingAdvance = values.id
        ? await findPettyAdvanceByDocNo(tx, values.id, {
            doc_no: true,
            id: true,
          })
        : null
      if (values.id && !existingAdvance) {
        throw new Error('ไม่พบรายการเงินสำรองจ่าย')
      }
      const docNo = existingAdvance?.doc_no ?? (await nextDailyDocNo('petty_advances', 'PADV', values.date, tx))
      const advance = existingAdvance
        ? await tx.petty_advances.update({
            where: { id: existingAdvance.id },
            data: {
              account_id: null,
              amount: values.amount,
              date: normalizeDate(values.date),
              doc_no: docNo,
              notes: values.notes,
              recipient_account_no: recipient.accountNo,
              recipient_bank_account_name: recipient.bankAccountName,
              recipient_bank_branch: recipient.bankBranch || null,
              recipient_bank_name: recipient.bankName,
              recipient_name: recipient.label,
              recipient_person_code: recipient.id,
              status: values.status,
              type: values.type,
              updated_at: new Date(),
              updated_by: actor,
            },
          })
        : await tx.petty_advances.create({
            data: {
              account_id: null,
              amount: values.amount,
              created_by: actor,
              date: normalizeDate(values.date),
              doc_no: docNo,
              notes: values.notes,
              recipient_account_no: recipient.accountNo,
              recipient_bank_account_name: recipient.bankAccountName,
              recipient_bank_branch: recipient.bankBranch || null,
              recipient_bank_name: recipient.bankName,
              recipient_name: recipient.label,
              recipient_person_code: recipient.id,
              status: values.status,
              type: values.type,
              updated_at: new Date(),
              updated_by: actor,
            },
          })

      return advance
    })

    return NextResponse.json({ id: result.doc_no })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกเงินสำรองจ่ายไม่ได้', 400)
  }
}
