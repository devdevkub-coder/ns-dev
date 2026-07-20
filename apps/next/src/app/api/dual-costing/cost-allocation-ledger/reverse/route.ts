import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { getDualCostingBranch } from '@/lib/server/dual-costing-branch'
import { toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

function appendAuditNote(current: string | null | undefined, note: string) {
  return current?.trim() ? `${current.trim()}\n${note}` : note
}

function poolStatus(originalQty: number, allocatedQty: number) {
  if (allocatedQty <= 0.001) return 'Available'
  if (allocatedQty >= originalQty - 0.001) return 'Fully Used'
  return 'Partially Used'
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const body = await request.json()
    const dealId = String(body.dealId ?? '').trim()
    const reason = String(body.reason ?? '').trim() || 'ยกเลิกการจัดสรรจาก Allocation Ledger'
    if (!/^\d+$/.test(dealId)) {
      return NextResponse.json({ error: 'ไม่พบรายการที่ต้องการยกเลิก' }, { status: 400 })
    }

    const actor = context.appUser?.email || context.authUser.email || 'system'
    const updatedAt = new Date()
    const branch = await getDualCostingBranch()

    const result = await prisma.$transaction(async (tx) => {
      const deal = await tx.trading_deals.findUnique({ where: { id: BigInt(dealId) } })
      if (!deal) throw new Error('ไม่พบรายการจัดสรรที่เลือก')
      if (['cancelled', 'reversed', 'void'].includes(String(deal.status ?? '').toLowerCase())) {
        throw new Error('รายการนี้ถูกยกเลิกไปแล้ว')
      }

      const facts = await tx.trading_allocation_facts.findMany({
        orderBy: { id: 'asc' },
        where: { status: 'active', trading_deal_id: deal.id },
      })
      if (facts.length === 0) throw new Error('ไม่พบข้อมูลต้นทุนที่ยังใช้งานสำหรับรายการนี้')

      let releasedQty = 0
      for (const fact of facts) {
        const qty = toNumber(fact.qty)
        const sourceLineId = fact.source_line_no == null ? undefined : String(fact.source_line_no)
        const entry = fact.source_doc_no
          ? await tx.stock_cost_pool_entries.findFirst({
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
            where: {
              branch_id: branch.id,
              product_id: fact.product_id ?? undefined,
              source_line_id: sourceLineId,
              source_ref_no: fact.source_doc_no,
            },
          })
          : null

        const auditNote = `Reversed from Allocation Ledger: ${reason}`
        if (entry) {
          const allocatedQty = Math.max(0, toNumber(entry.allocated_qty) - qty)
          await tx.stock_cost_pool_entries.update({
            data: {
              allocated_qty: allocatedQty,
              notes: appendAuditNote(entry.notes, auditNote),
              status: poolStatus(toNumber(entry.original_qty), allocatedQty),
              updated_at: updatedAt,
              updated_by: actor,
            },
            where: { id: entry.id },
          })
        }

        await tx.trading_allocation_facts.update({
          data: {
            notes: appendAuditNote(fact.notes, auditNote),
            status: 'reversed',
            updated_at: updatedAt,
            updated_by: actor,
          },
          where: { id: fact.id },
        })
        releasedQty += qty
      }

      await tx.trading_deals.update({
        data: {
          notes: appendAuditNote(deal.notes, `Reversed from Allocation Ledger: ${reason}`),
          status: 'Cancelled',
          updated_at: updatedAt,
          updated_by: actor,
        },
        where: { id: deal.id },
      })

      return { releasedQty, reversedFactCount: facts.length }
    })

    return NextResponse.json({ message: 'ยกเลิกการจัดสรรสำเร็จ', result, success: true })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof Error) return NextResponse.json({ error: caught.message }, { status: 400 })
    return apiErrorResponse(caught, 'ยกเลิก Allocation Ledger ไม่สำเร็จ', 500)
  }
}
