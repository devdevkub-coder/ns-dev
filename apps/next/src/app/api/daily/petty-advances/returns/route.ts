import { NextResponse } from 'next/server'
import { pettyAdvanceReturnFormSchema } from '@/lib/daily'
import { apiErrorResponse } from '@/lib/server/api-error'
import { findActiveAccountReferenceByCode } from '@/lib/server/account-reference'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import type { Prisma } from '../../../../../../generated/prisma/client'

export const runtime = 'nodejs'

async function findPettyAdvanceByDocNo(client: Prisma.TransactionClient | typeof prisma, value: string) {
  const advancesClient = client.petty_advances as typeof prisma.petty_advances
  return advancesClient.findFirst({
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
      const advance = await findPettyAdvanceByDocNo(tx, values.advanceId)

      if (!advance) {
        return null
      }

      const existingPending = await tx.payment_approvals.findFirst({
        where: {
          source_id: advance.id.toString(),
          source_type: 'petty_advance_return',
          status: 'pending',
        },
      })
      if (existingPending) {
        throw new Error('มีรายการคืนเงินรออนุมัติอยู่แล้ว')
      }
      const remaining = Math.max(0, toNumber(advance.amount) - toNumber(advance.returned_amount))
      if (values.amount - remaining > 0.01) {
        throw new Error('ยอดคืนเงินเกินยอดคงค้าง')
      }

      const requestedReturn = await tx.payment_approvals.create({
        data: {
          approved_amount: values.amount,
          approved_by: actor,
          destination_account_no_snapshot: account.accountNo ?? null,
          destination_bank_account_id_snapshot: account.code ?? null,
          destination_bank_name_snapshot: account.name,
          destination_payment_method_snapshot: account.type ?? 'รับคืน',
          note: values.notes,
          party_id: advance.recipient_person_code ?? null,
          party_name_snapshot: advance.recipient_name,
          source_date_snapshot: normalizeDate(values.date),
          source_doc_no_snapshot: advance.doc_no,
          source_id: advance.id.toString(),
          source_type: 'petty_advance_return',
          status: 'pending',
          updated_at: new Date(),
        },
      })

      return requestedReturn
    })

    if (!result) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบรายการเงินสำรอง' }, { status: 404 })
    }

    return NextResponse.json({ id: result.id.toString(), status: result.status })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกคืนเงินสำรองจ่ายไม่ได้', 400)
  }
}
