import { NextResponse } from 'next/server'
import { pettyAdvanceReturnFormSchema } from '@/lib/daily'
import { apiErrorResponse } from '@/lib/server/api-error'
import { findActiveAccountReferenceByCode } from '@/lib/server/account-reference'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, nextDailyDocNo, normalizeDate, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

async function findPettyAdvanceByDocNo(value: string) {
  return prisma.petty_advances.findFirst({
    where: { doc_no: value },
  })
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const values = pettyAdvanceReturnFormSchema.parse(await request.json())
    const actor = currentActor(context)
    const account = await findActiveAccountReferenceByCode(values.accountId)
    if (!account) {
      throw new Error('บัญชีรับคืนไม่ถูกต้อง')
    }

    const result = await prisma.$transaction(async (tx) => {
      const advance = await findPettyAdvanceByDocNo(values.advanceId)

      if (!advance) {
        return null
      }

      const entry = await tx.petty_advance_returns.create({
        data: {
          account_id: account.id,
          advance_id: advance.id,
          amount: values.amount,
          created_by: actor,
          date: normalizeDate(values.date),
          doc_no: await nextDailyDocNo('petty_advance_returns', 'PRET', values.date),
          notes: values.notes,
        },
      })

      const returnedAmount = toNumber(advance.returned_amount) + values.amount
      const status = returnedAmount >= toNumber(advance.amount) ? 'closed' : advance.status
      await tx.petty_advances.update({
        data: {
          closed_at: status === 'closed' ? new Date() : advance.closed_at,
          returned_amount: returnedAmount,
          status,
          updated_at: new Date(),
          updated_by: actor,
        },
        where: { id: advance.id },
      })

      await tx.bank_statement.create({
        data: {
          account_id: account.id,
          amount_in: values.amount,
          amount_out: 0,
          created_by: actor,
          date: normalizeDate(values.date),
          description: `คืน ${advance.doc_no} โดย ${advance.recipient_name}`,
          doc_no: await nextDailyDocNo('bank_statement', 'BST', values.date),
          ref_id: entry.doc_no,
          ref_no: entry.doc_no,
          ref_type: 'PRET',
          type: 'คืนเงินสำรองจ่าย',
        },
      })

      return entry
    })

    if (!result) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบรายการเงินสำรอง' }, { status: 404 })
    }

    return NextResponse.json({ docNo: result.doc_no, id: result.doc_no })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกคืนเงินสำรองจ่ายไม่ได้', 400)
  }
}
