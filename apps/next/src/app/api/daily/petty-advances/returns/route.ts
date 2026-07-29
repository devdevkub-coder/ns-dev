import { NextResponse } from 'next/server'
import { pettyAdvanceReturnFormSchema } from '@/lib/daily'
import { apiErrorResponse } from '@/lib/server/api-error'
import { findActiveAccountReferenceByCode } from '@/lib/server/account-reference'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, documentBranchCode, nextDailyDocNo, normalizeDate, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import type { Prisma } from '../../../../../../generated/prisma/client'

export const runtime = 'nodejs'

async function findPettyAdvanceByDocNo(client: Prisma.TransactionClient | typeof prisma, value: string) {
  const advancesClient = client.petty_advances as typeof prisma.petty_advances
  return advancesClient.findFirst({
    include: { branches: { select: { code: true } } },
    where: { doc_no: value },
  })
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'daily.petty_advances.return')

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

      const existingPending = await tx.petty_advance_returns.findFirst({
        where: {
          advance_id: advance.id,
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

      const requestedReturn = await tx.petty_advance_returns.create({
        data: {
          account_id: account.id,
          advance_id: advance.id,
          amount: values.amount,
          created_by: actor,
          date: normalizeDate(values.date),
          doc_no: await nextDailyDocNo('petty_advance_returns', 'PRET', values.date, tx, documentBranchCode(advance.branches?.code)),
          notes: values.notes,
          status: 'pending',
          updated_at: new Date(),
          updated_by: actor,
        },
      })

      return requestedReturn
    })

    if (!result) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบรายการเงินสำรอง' }, { status: 404 })
    }

    return NextResponse.json({ docNo: result.doc_no, id: result.id.toString(), status: result.status })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกคืนเงินสำรองจ่ายไม่ได้', 400)
  }
}
