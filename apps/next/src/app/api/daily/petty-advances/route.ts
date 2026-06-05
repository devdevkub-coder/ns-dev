import { NextResponse } from 'next/server'
import { pettyAdvanceFormSchema } from '@/lib/daily'
import { apiErrorResponse } from '@/lib/server/api-error'
import { findActiveAccountReferenceByCode } from '@/lib/server/account-reference'
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

function advanceJson(row: PettyAdvanceWithRelations) {
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

    const [accounts, rows] = await Promise.all([
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
    ])

    return NextResponse.json({ accounts, rows: rows.map(advanceJson) })
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
    const account = await findActiveAccountReferenceByCode(values.accountId)
    if (!account) {
      throw new Error('บัญชีจ่ายออกไม่ถูกต้อง')
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
      const docNo = values.docNo ?? existingAdvance?.doc_no ?? await nextDailyDocNo('petty_advances', 'PADV', values.date)
      const advance = existingAdvance
        ? await tx.petty_advances.update({
            where: { id: existingAdvance.id },
            data: {
              account_id: account.id,
              amount: values.amount,
              date: normalizeDate(values.date),
              doc_no: docNo,
              notes: values.notes,
              recipient_name: values.recipientName,
              status: values.status,
              type: values.type,
              updated_at: new Date(),
              updated_by: actor,
            },
          })
        : await tx.petty_advances.create({
            data: {
              account_id: account.id,
              amount: values.amount,
              created_by: actor,
              date: normalizeDate(values.date),
              doc_no: docNo,
              notes: values.notes,
              recipient_name: values.recipientName,
              status: values.status,
              type: values.type,
              updated_at: new Date(),
              updated_by: actor,
            },
          })

      await tx.bank_statement.deleteMany({
        where: {
          ref_id: advance.id.toString(),
          ref_type: 'PADV',
        },
      })
      const statementDocNo = await nextDailyDocNo('bank_statement', 'BST', values.date)
      await tx.bank_statement.create({
        data: {
          account_id: account.id,
          amount_in: 0,
          amount_out: values.amount,
          created_by: actor,
          date: normalizeDate(values.date),
          description: `${docNo} - ${values.recipientName}${values.notes ? ` (${values.notes})` : ''}`,
          doc_no: statementDocNo,
          ref_id: advance.id.toString(),
          ref_no: docNo,
          ref_type: 'PADV',
          type: values.type === 'DIRECTOR_LOAN' ? 'กู้กรรมการ' : 'เงินสำรองจ่าย',
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
