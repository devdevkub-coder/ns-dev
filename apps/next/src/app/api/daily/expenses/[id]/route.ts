import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

function isPendingApprovalExpenseStatus(status: string | null | undefined) {
  const normalized = String(status ?? '').toLowerCase()
  return normalized === 'pending_approval' || normalized === 'pending' || normalized === ''
}

async function findExpenseByDocNo(id: string) {
  return prisma.expenses.findFirst({
    select: { doc_no: true, id: true, status: true },
    where: { doc_no: id },
  })
}

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'finance.cash.view')

    const { id } = await context.params
    const actor = currentActor(auth)

    const expense = await findExpenseByDocNo(id)

    if (!expense) {
      return NextResponse.json({ error: 'ไม่พบรายการค่าใช้จ่าย' }, { status: 404 })
    }
    if (!isPendingApprovalExpenseStatus(expense.status)) {
      return NextResponse.json({ error: 'ยกเลิกได้เฉพาะรายการค่าใช้จ่ายที่ยังไม่อนุมัติ' }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.expenses.update({
        data: {
          paid_at: null,
          paid_status: 'unpaid',
          status: 'cancelled',
          updated_at: new Date(),
          updated_by: actor,
        },
        where: { id: expense.id },
      })

      await tx.bank_statement.deleteMany({
        where: {
          ref_id: expense.id.toString(),
          ref_type: 'EXP',
        },
      })
    })

    return NextResponse.json({ id: expense.doc_no })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ยกเลิกรายการค่าใช้จ่ายไม่ได้', 400)
  }
}
