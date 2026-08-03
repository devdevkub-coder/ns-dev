import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { canAccessBranchId, getAllowedBranchIds } from '@/lib/server/branch-scope'
import { getDualCostingBranch } from '@/lib/server/dual-costing-branch'
import { DUAL_COSTING_ALLOCATION_ADVISORY_LOCK, getCostPoolStatus } from '@/lib/server/dual-costing-allocation-contract'
import { isDualCostingMatchId } from '@/lib/server/dual-costing-match-id'
import { toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

class AllocationLedgerConflictError extends Error {}

function appendAuditNote(current: string | null | undefined, note: string) {
  return current?.trim() ? `${current.trim()}\n${note}` : note
}

function isReversedStatus(status: string | null | undefined) {
  return ['cancelled', 'reversed', 'void'].includes(String(status ?? '').toLowerCase())
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const body = await request.json()
    const dealId = String(body.dealId ?? '').trim()
    const reason = String(body.reason ?? '').trim().slice(0, 500) || 'ย้อนกลับการจัดสรรจาก Allocation Ledger'
    if (!/^\d+$/.test(dealId)) {
      return NextResponse.json({ error: 'ไม่พบรายการที่ต้องการย้อนกลับการจัดสรร' }, { status: 400 })
    }

    const branch = await getDualCostingBranch()
    const allowedBranchIds = await getAllowedBranchIds(context)
    if (!canAccessBranchId(allowedBranchIds, branch.id, { allowNull: false })) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการ Allocation Ledger ของสาขานี้' }, { status: 403 })
    }

    const actor = context.appUser?.email || context.authUser.email || 'system'
    const updatedAt = new Date()
    const result = await prisma.$transaction(async (tx) => {
      // ponytail: one L5 allocation lock is intentionally global until measured contention justifies scoped locks.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DUAL_COSTING_ALLOCATION_ADVISORY_LOCK})`
      const anchor = await tx.trading_deals.findUnique({ where: { id: BigInt(dealId) } })
      if (!anchor) throw new Error('ไม่พบรายการจัดสรรที่เลือก')

      const storedMatchId = anchor.deal_no?.trim() ?? ''
      const isWholeMatch = isDualCostingMatchId(storedMatchId)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dual-costing-allocation-reverse:${isWholeMatch ? storedMatchId : anchor.id.toString()}`}))`

      const deals = await tx.trading_deals.findMany({
        orderBy: { id: 'asc' },
        where: isWholeMatch ? { deal_no: storedMatchId } : { id: anchor.id },
      })
      if (deals.length === 0) throw new Error('ไม่พบรายการจัดสรรที่เลือก')

      const dealIds = deals.map((deal) => deal.id)
      const facts = await tx.trading_allocation_facts.findMany({
        orderBy: { id: 'asc' },
        where: { trading_deal_id: { in: dealIds } },
      })
      const activeFacts = facts.filter((fact) => fact.status === 'active')
      const allReversed = deals.every((deal) => isReversedStatus(deal.status))

      if (allReversed) {
        if (activeFacts.length > 0) {
          throw new AllocationLedgerConflictError('พบสถานะ Allocation Ledger ไม่สอดคล้องกัน จึงไม่สามารถย้อนกลับซ้ำได้')
        }
        return {
          alreadyReversed: true,
          matchId: isWholeMatch ? storedMatchId : anchor.id.toString(),
          releasedQty: 0,
          reversedFactCount: 0,
        }
      }

      if (deals.some((deal) => isReversedStatus(deal.status))) {
        throw new AllocationLedgerConflictError('การจับคู่นี้มีสถานะไม่สอดคล้องกัน จึงไม่สามารถย้อนกลับบางส่วนได้')
      }
      if (activeFacts.length === 0 || activeFacts.length !== facts.length) {
        throw new AllocationLedgerConflictError('ไม่พบข้อมูลต้นทุนที่ยังใช้งานครบทั้งการจับคู่ จึงไม่สามารถย้อนกลับได้')
      }
      if (activeFacts.some((fact) => fact.cost_pool_entry_id == null)) {
        throw new AllocationLedgerConflictError('รายการเดิมยังระบุรายการ Cost Pool ไม่ชัดเจน จึงไม่สามารถย้อนกลับโดยเดารายการได้')
      }

      const productionTarget = anchor.sales_bill_no
        ? await tx.production_orders.findFirst({
          select: { id: true },
          where: { branch_id: branch.id, doc_no: anchor.sales_bill_no },
        })
        : null
      if (productionTarget) {
        throw new AllocationLedgerConflictError('การจัดสรรต้นทุนของการผลิตต้องใช้ flow ย้อนกลับเฉพาะ จึงยังไม่เปิดให้ย้อนกลับจาก Allocation Ledger')
      }

      const releasedByPoolId = new Map<string, number>()
      activeFacts.forEach((fact) => {
        const poolId = fact.cost_pool_entry_id!.toString()
        releasedByPoolId.set(poolId, (releasedByPoolId.get(poolId) ?? 0) + toNumber(fact.qty))
      })
      const poolIds = Array.from(releasedByPoolId.keys()).map((id) => BigInt(id))
      const pools = await tx.stock_cost_pool_entries.findMany({ where: { id: { in: poolIds } } })
      if (pools.length !== poolIds.length) {
        throw new AllocationLedgerConflictError('ไม่พบรายการ Cost Pool ครบทั้งการจับคู่ จึงไม่สามารถย้อนกลับได้')
      }

      const auditNote = `Reversed from Allocation Ledger: ${reason}`
      for (const pool of pools) {
        if (pool.branch_id !== branch.id) {
          throw new AllocationLedgerConflictError('รายการ Cost Pool อยู่นอกสาขาที่อนุญาต')
        }
        const releasedQty = releasedByPoolId.get(pool.id.toString()) ?? 0
        const nextAllocatedQty = toNumber(pool.allocated_qty) - releasedQty
        if (nextAllocatedQty < -0.001) {
          throw new AllocationLedgerConflictError(`Cost Pool ${pool.pool_key} มียอดจัดสรรไม่พอสำหรับการย้อนกลับ`)
        }
        const normalizedAllocatedQty = Math.max(0, nextAllocatedQty)
        await tx.stock_cost_pool_entries.update({
          data: {
            allocated_qty: normalizedAllocatedQty,
            notes: appendAuditNote(pool.notes, auditNote),
            status: getCostPoolStatus(toNumber(pool.original_qty), normalizedAllocatedQty, toNumber(pool.released_qty)),
            updated_at: updatedAt,
            updated_by: actor,
          },
          where: { id: pool.id },
        })
      }

      const factUpdates = await Promise.all(activeFacts.map((fact) => tx.trading_allocation_facts.updateMany({
        data: {
          notes: appendAuditNote(fact.notes, auditNote),
          status: 'reversed',
          updated_at: updatedAt,
          updated_by: actor,
        },
        where: { id: fact.id, status: 'active' },
      })))
      if (factUpdates.some((result) => result.count !== 1)) {
        throw new AllocationLedgerConflictError('ข้อมูลต้นทุนถูกแก้ไขระหว่างการย้อนกลับ กรุณาลองใหม่อีกครั้ง')
      }

      await Promise.all(deals.map((deal) => tx.trading_deals.update({
        data: {
          cancelled_at: updatedAt,
          cancelled_by: actor,
          cancelled_reason: reason,
          notes: appendAuditNote(deal.notes, auditNote),
          status: 'Cancelled',
          updated_at: updatedAt,
          updated_by: actor,
        },
        where: { id: deal.id },
      })))

      return {
        alreadyReversed: false,
        matchId: isWholeMatch ? storedMatchId : anchor.id.toString(),
        releasedQty: activeFacts.reduce((sum, fact) => sum + toNumber(fact.qty), 0),
        reversedFactCount: activeFacts.length,
      }
    })

    return NextResponse.json({
      message: result.alreadyReversed ? 'รายการนี้ถูกย้อนกลับแล้ว' : 'ย้อนกลับการจัดสรรสำเร็จ',
      result,
      success: true,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof AllocationLedgerConflictError) return NextResponse.json({ error: caught.message }, { status: 409 })
    if (caught instanceof Error) return NextResponse.json({ error: caught.message }, { status: 400 })
    return apiErrorResponse(caught, 'ย้อนกลับ Allocation Ledger ไม่สำเร็จ', 500)
  }
}
