import { NextResponse } from 'next/server'
import { weightTicketHeaderSchema } from '@/lib/weight-tickets'
import { apiErrorResponse } from '@/lib/server/api-error'
import { recordAuditLog } from '@/lib/server/app-logging'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { withAuthNoStore } from '@/lib/server/auth-response'
import { currentActor } from '@/lib/server/daily'
import { findActiveBranchReferencesByCodes } from '@/lib/server/branch-reference'
import { findActiveCustomerReferenceByCodeOrId } from '@/lib/server/customer-reference'
import { prisma } from '@/lib/server/prisma'
import { findActiveSupplierReferenceByCodeOrId } from '@/lib/server/supplier-reference'
import { publishWeightTicketChange } from '@/lib/server/weight-ticket-realtime'
import { branchScopeIds, canEditWeightTicket, getWeightTicketUsageCounts } from '@/lib/server/weight-tickets'
import { assertWeightTicketPartyForType } from '@/lib/server/weight-ticket-write/type-guards'

export const runtime = 'nodejs'

const headerFields = ['branchId', 'partyId', 'remark', 'vehicleImageNames', 'vehicleNo', 'godownName'] as const

class HeaderCollaborationConflictError extends Error {
  readonly status = 409
  constructor(readonly headerFields: string[]) {
    super('มีผู้ใช้อื่นแก้ไขหัวเอกสารแล้ว กรุณาโหลดข้อมูลล่าสุด')
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'daily.weight_tickets.update')
    const { id } = await context.params
    const values = weightTicketHeaderSchema.parse(await request.json())
    const scopedBranchIds = branchScopeIds(auth)
    if (scopedBranchIds !== null && !scopedBranchIds.length) return withAuthNoStore(NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของ' }, { status: 404 }))
    const existing = await prisma.weight_tickets.findFirst({
      select: {
        branch_id: true,
        branches: { select: { code: true } },
        customer_id: true,
        customers: { select: { code: true } },
        doc_no: true,
        doc_type: true,
        godown_name: true,
        id: true,
        party_name: true,
        remark: true,
        status: true,
        supplier_id: true,
        suppliers: { select: { code: true } },
        updated_at: true,
        vehicle_image_names: true,
        vehicle_no: true,
        weight_ticket_lines: { select: { id: true } },
      },
      where: {
        doc_no: id,
        ...(scopedBranchIds !== null ? { branches: { code: { in: scopedBranchIds } } } : {}),
      },
    })
    if (!existing) return withAuthNoStore(NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของ' }, { status: 404 }))
    const usage = await getWeightTicketUsageCounts(prisma, existing.id)
    if (!canEditWeightTicket({ docType: existing.doc_type, status: existing.status }, usage)) {
      return withAuthNoStore(NextResponse.json({ code: 'BAD_REQUEST', error: 'ใบรับ-ส่งของนี้ไม่สามารถแก้ไขได้' }, { status: 400 }))
    }
    if (values.type !== existing.doc_type) return withAuthNoStore(NextResponse.json({ code: 'BAD_REQUEST', error: 'ประเภทเอกสารไม่ตรงกัน' }, { status: 400 }))

    const changed = new Set(values.collaborationChangedHeaderFields)
    const currentHeader = {
      branchId: existing.branches.code,
      partyId: existing.doc_type === 'WTI' ? existing.suppliers?.code ?? '' : existing.customers?.code ?? '',
      remark: existing.remark ?? '',
      vehicleImageNames: existing.vehicle_image_names ?? [],
      vehicleNo: existing.vehicle_no ?? '',
      godownName: existing.godown_name ?? '',
    }
    if (values.collaborationBaseUpdatedAt && values.collaborationBaseUpdatedAt !== (existing.updated_at?.toISOString() ?? null) && values.collaborationBaseHeader) {
      const conflicts = headerFields.filter((field) => changed.has(field) && JSON.stringify(currentHeader[field]) !== JSON.stringify(values.collaborationBaseHeader?.[field]))
      if (conflicts.length) return withAuthNoStore(NextResponse.json({ code: 'CONFLICT', error: 'มีผู้ใช้อื่นแก้ไขหัวเอกสารแล้ว กรุณาโหลดข้อมูลล่าสุด', headerFields: conflicts }, { status: 409 }))
    }

    const [scopedBranches, branch, supplier, customer] = await Promise.all([
      scopedBranchIds === null ? Promise.resolve([]) : findActiveBranchReferencesByCodes(scopedBranchIds),
      prisma.branches.findFirst({ select: { id: true, code: true }, where: { active: true, code: values.branchId.toUpperCase() } }),
      values.type === 'WTI' ? findActiveSupplierReferenceByCodeOrId(values.partyId) : Promise.resolve(null),
      values.type === 'WTO' ? findActiveCustomerReferenceByCodeOrId(values.partyId) : Promise.resolve(null),
    ])
    if (!branch || (scopedBranchIds !== null && !scopedBranches.some((item) => item.id === branch.id))) return withAuthNoStore(NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือไม่มีสิทธิ์ใช้งาน' }, { status: 400 }))
    if (existing.weight_ticket_lines.length > 0 && (changed.has('branchId') || changed.has('partyId')) && (values.branchId.toUpperCase() !== existing.branches.code || values.partyId !== currentHeader.partyId)) {
      return withAuthNoStore(NextResponse.json({ code: 'BAD_REQUEST', error: 'เมื่อมีรายการสินค้าแล้ว การเปลี่ยนสาขาหรือคู่ค้าต้องบันทึกทั้งเอกสาร' }, { status: 400 }))
    }
    if (values.type === 'WTI' && changed.has('partyId') && !supplier) return withAuthNoStore(NextResponse.json({ code: 'BAD_REQUEST', error: 'ผู้ขายไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 }))
    if (values.type === 'WTO' && changed.has('partyId') && !customer) return withAuthNoStore(NextResponse.json({ code: 'BAD_REQUEST', error: 'ลูกค้าไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 }))

    const actor = currentActor(auth)
    const updatedAt = new Date()
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(${existing.id})`
      const locked = await tx.weight_tickets.findUniqueOrThrow({
        select: {
          branch_id: true,
          branches: { select: { code: true, name: true } },
          customer_id: true,
          customers: { select: { code: true, name: true } },
          doc_no: true,
          doc_type: true,
          godown_name: true,
          id: true,
          party_name: true,
          remark: true,
          status: true,
          supplier_id: true,
          suppliers: { select: { code: true, name: true } },
          updated_at: true,
          vehicle_image_names: true,
          vehicle_no: true,
          weight_ticket_lines: { select: { id: true } },
        },
        where: { id: existing.id },
      })
      const lockedUsage = await getWeightTicketUsageCounts(tx, locked.id)
      if (!canEditWeightTicket({ docType: locked.doc_type, status: locked.status }, lockedUsage)) {
        throw new Error('ใบรับ-ส่งของนี้ไม่สามารถแก้ไขได้')
      }
      const lockedHeader = {
        branchId: locked.branches.code,
        partyId: existing.doc_type === 'WTI' ? locked.suppliers?.code ?? '' : locked.customers?.code ?? '',
        remark: locked.remark ?? '',
        vehicleImageNames: locked.vehicle_image_names ?? [],
        vehicleNo: locked.vehicle_no ?? '',
        godownName: locked.godown_name ?? '',
      }
      if (values.collaborationBaseUpdatedAt && values.collaborationBaseUpdatedAt !== (locked.updated_at?.toISOString() ?? null) && values.collaborationBaseHeader) {
        const conflicts = headerFields.filter((field) => changed.has(field) && JSON.stringify(lockedHeader[field]) !== JSON.stringify(values.collaborationBaseHeader?.[field]))
        if (conflicts.length) throw new HeaderCollaborationConflictError(conflicts)
      }
      if (locked.weight_ticket_lines.length > 0 && (changed.has('branchId') || changed.has('partyId')) && (values.branchId.toUpperCase() !== locked.branches.code || values.partyId !== lockedHeader.partyId)) {
        throw new Error('เมื่อมีรายการสินค้าแล้ว การเปลี่ยนสาขาหรือคู่ค้าต้องบันทึกทั้งเอกสาร')
      }
      const nextHeader = {
        branchId: changed.has('branchId') ? branch.id : locked.branch_id,
        customerId: locked.doc_type === 'WTO' ? (changed.has('partyId') && customer ? customer.id : locked.customer_id) : null,
        godownName: changed.has('godownName') ? values.godownName : locked.godown_name,
        partyName: changed.has('partyId') ? (locked.doc_type === 'WTO' ? customer?.name : supplier?.name) ?? locked.party_name : locked.party_name,
        remark: changed.has('remark') ? values.remark || null : locked.remark,
        supplierId: locked.doc_type === 'WTI' ? (changed.has('partyId') && supplier ? supplier.id : locked.supplier_id) : null,
        vehicleImageNames: changed.has('vehicleImageNames') ? values.vehicleImageNames : locked.vehicle_image_names,
        vehicleNo: changed.has('vehicleNo') ? values.vehicleNo : locked.vehicle_no,
      }
      await assertWeightTicketPartyForType({
        branchId: nextHeader.branchId,
        customer: nextHeader.customerId == null ? null : changed.has('partyId') && customer ? customer : { id: nextHeader.customerId, name: locked.customers?.name ?? locked.party_name },
        supplier: nextHeader.supplierId == null ? null : changed.has('partyId') && supplier ? supplier : { id: nextHeader.supplierId, name: locked.suppliers?.name ?? locked.party_name },
        type: locked.doc_type === 'WTI' ? 'WTI' : 'WTO',
      })
      await tx.weight_tickets.update({
        data: {
          branch_id: nextHeader.branchId,
          customer_id: nextHeader.customerId,
          godown_name: nextHeader.godownName,
          party_name: nextHeader.partyName,
          remark: nextHeader.remark,
          supplier_id: nextHeader.supplierId,
          updated_at: updatedAt,
          updated_by: actor,
          vehicle_image_count: nextHeader.vehicleImageNames.length,
          vehicle_image_names: nextHeader.vehicleImageNames,
          vehicle_no: nextHeader.vehicleNo,
        },
        where: { id: existing.id },
      })
      return tx.weight_tickets.findUniqueOrThrow({ select: { doc_no: true, id: true, updated_at: true, branches: { select: { code: true } } }, where: { id: existing.id } })
    })
    await recordAuditLog({ action: 'update', afterData: values, beforeData: currentHeader, context: auth, entityId: String(updated.id), entityLabel: updated.doc_no, entitySchema: 'public', entityTable: 'weight_tickets', eventKey: 'daily.weight-ticket.header.updated', metadata: { documentNo: updated.doc_no, type: existing.doc_type }, request, targetId: String(updated.id), targetLabel: updated.doc_no, targetType: 'weight_ticket' })
    void publishWeightTicketChange({ branchId: updated.branches.code, changeType: 'updated', documentNo: updated.doc_no, updatedAt: updated.updated_at?.toISOString() ?? updatedAt.toISOString(), lineIds: [] })
    return withAuthNoStore(NextResponse.json({ updatedAt: updated.updated_at?.toISOString() ?? updatedAt.toISOString() }))
  } catch (caught) {
    if (caught instanceof AuthContextError) return withAuthNoStore(authContextErrorResponse(caught))
    if (caught instanceof HeaderCollaborationConflictError) return withAuthNoStore(NextResponse.json({ code: 'CONFLICT', error: caught.message, headerFields: caught.headerFields }, { status: caught.status }))
    return withAuthNoStore(apiErrorResponse(caught, 'บันทึกหัวเอกสารไม่ได้', 400))
  }
}
