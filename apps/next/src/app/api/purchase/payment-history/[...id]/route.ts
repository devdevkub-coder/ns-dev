import { NextResponse } from 'next/server'
import { parseInternalBigIntId } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission, getBranchCodeIntersection } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { listActiveBranchesByCodes } from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

type TimelineTone = 'amber' | 'blue' | 'emerald' | 'rose' | 'slate'

function money(value: number | null | undefined) {
  return (value ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function dateOrDash(value: Date | null | undefined) {
  return value ? toDateOnly(value) : '-'
}

function isoDateTime(value: Date | null | undefined) {
  return value ? value.toISOString() : null
}

function paymentStatusLabel(status: string | null | undefined) {
  if (status === 'cancelled') return 'ยกเลิก'
  if (status === 'active') return 'จ่ายแล้ว'
  return status ?? '-'
}

function paymentActionLabel(action: string) {
  if (action === 'posted') return 'บันทึก PMT'
  if (action === 'bank_posted') return 'บันทึกบัญชีจ่าย'
  if (action === 'cancelled') return 'ยกเลิก PMT'
  if (action === 'bank_reversed') return 'คืนรายการบัญชีจ่าย'
  return action
}

function paymentActionTone(action: string): TimelineTone {
  if (action === 'posted' || action === 'bank_posted') return 'emerald'
  if (action === 'cancelled' || action === 'bank_reversed') return 'rose'
  return 'slate'
}

function approvalStatusLabel(status: string | null | undefined) {
  if (status === 'pending') return 'รออนุมัติ'
  if (status === 'approved') return 'รอจ่าย'
  if (status === 'paid') return 'จ่ายแล้ว'
  if (status === 'voided') return 'ยกเลิก'
  return status ?? '-'
}

function approvalActionLabel(action: string) {
  if (action === 'approved') return 'อนุมัติ PMA'
  if (action === 'selected_for_payment') return 'เลือกเข้าจ่าย'
  if (action === 'paid') return 'จ่าย PMA แล้ว'
  if (action === 'voided_before_payment') return 'ยกเลิก PMA ก่อนจ่าย'
  if (action === 'reversed_by_payment_cancel') return 'คืน PMA จากการยกเลิก PMT'
  return action
}

function approvalActionTone(action: string): TimelineTone {
  if (action === 'approved' || action === 'selected_for_payment') return 'blue'
  if (action === 'paid') return 'emerald'
  if (action === 'voided_before_payment' || action === 'reversed_by_payment_cancel') return 'rose'
  return 'slate'
}

function effectStatusLabel(status: string | null | undefined) {
  if (status === 'active') return 'จ่ายแล้ว'
  if (status === 'reversed') return 'ยกเลิก'
  return status ?? '-'
}

function sourceTypeLabel(sourceType: string | null | undefined) {
  if (sourceType === 'purchase_bill') return 'บิลซื้อ'
  if (sourceType === 'advance_payment') return 'เงินมัดจำ'
  if (sourceType === 'expense') return 'ค่าใช้จ่าย'
  return sourceType ?? '-'
}

function timelineDate(value: Date | null | undefined) {
  return isoDateTime(value) ?? ''
}

function directPaymentSourceRows(lines: unknown) {
  if (!Array.isArray(lines)) return []
  return lines.flatMap((line) => {
    if (typeof line !== 'object' || line === null || Array.isArray(line)) return []
    const record = line as Record<string, unknown>
    const sourceType = String(record.sourceType ?? '').trim()
    const sourceDocNo = String(record.sourceDocNo ?? '').trim()
    const amountValue = typeof record.amount === 'number'
      ? record.amount
      : typeof record.amount === 'string'
        ? Number(record.amount)
        : 0
    const amount = Number.isFinite(amountValue) ? amountValue : 0
    if (!sourceType && !sourceDocNo && amount <= 0) return []
    return [{
      amount,
      docNo: sourceDocNo || '-',
      sourceDocNo: sourceDocNo || '-',
      sourceType,
      statusLabel: 'จ่ายแล้ว',
    }]
  })
}

export async function GET(_request: Request, context: { params: Promise<{ id: string[] }> }) {
  try {
    const authContext = await getCurrentAuthContext()
    requirePermission(authContext, 'finance.cash.view')

    const allowedBranchCodes = getBranchCodeIntersection(authContext)
    let allowedBranchIds: bigint[] | undefined = undefined
    if (allowedBranchCodes) {
      const matchingBranches = await listActiveBranchesByCodes(allowedBranchCodes)
      allowedBranchIds = matchingBranches.map((b) => b.id)
    }

    const { id } = await context.params
    const documentId = decodeURIComponent(id.join('/'))
    const payments = await prisma.payments.findMany({
      include: {
        accounts: true,
        payment_approvals: {
          select: {
            doc_no: true,
            source_doc_no_snapshot: true,
          },
        },
        suppliers: true,
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      where: {
        OR: [
          { voucher_id: documentId },
          { doc_no: documentId },
        ],
      },
    })

    if (payments.length > 0) {
      if (allowedBranchIds && payments.some((payment: (typeof payments)[number]) => payment.branch_id != null && !allowedBranchIds.includes(payment.branch_id))) {
        return NextResponse.json({ error: 'ไม่พบรายการจ่ายเงิน' }, { status: 404 })
      }
    }

    if (payments.length === 0) {
      const approval = await prisma.payment_approvals.findFirst({
        where: { doc_no: documentId },
      })
      if (!approval) return NextResponse.json({ error: 'ไม่พบรายการจ่ายเงิน' }, { status: 404 })

      if (allowedBranchIds) {
        let sourceBranchId: bigint | null = null
        const sourceInternalId = parseInternalBigIntId(approval.source_id)
        if (sourceInternalId != null) {
          if (approval.source_type === 'purchase_bill') {
            const pb = await prisma.purchase_bills.findUnique({
              select: { branch_id: true },
              where: { id: sourceInternalId }
            })
            sourceBranchId = pb?.branch_id ?? null
          } else if (approval.source_type === 'advance_payment') {
            const adv = await prisma.supplier_advance_payments.findUnique({
              select: { branch_id: true },
              where: { id: sourceInternalId }
            })
            sourceBranchId = adv?.branch_id ?? null
          } else if (approval.source_type === 'expense') {
            const exp = await prisma.expenses.findUnique({
              select: { branch_id: true },
              where: { id: sourceInternalId }
            })
            sourceBranchId = exp?.branch_id ?? null
          }
        }
        if (sourceBranchId != null && !allowedBranchIds.includes(sourceBranchId)) {
          return NextResponse.json({ error: 'ไม่พบรายการจ่ายเงิน' }, { status: 404 })
        }
      }

      const [approvalStatusLogs, approvalAllocations] = await Promise.all([
        prisma.payment_approval_status_logs.findMany({
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
          where: { payment_approval_id: approval.id },
        }),
        prisma.payment_allocations.findMany({
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
          where: { payment_approval_id: approval.id },
        }),
      ])
      const approvalCurrentTone: TimelineTone = approval.status === 'voided'
        ? 'rose'
        : approval.status === 'paid'
          ? 'emerald'
          : approval.status === 'approved'
            ? 'blue'
            : 'slate'
      const timeline = [
        ...approvalStatusLogs.map((log: (typeof approvalStatusLogs)[number]) => ({
          actor: log.created_by ?? '',
          at: timelineDate(log.created_at),
          details: [
            `ยอดอนุมัติ: ${money(toNumber(log.approved_amount_snapshot))}`,
            log.payment_doc_no ? `PMT: ${log.payment_doc_no}` : '',
            log.note ? `หมายเหตุ: ${log.note}` : '',
          ].filter((value): value is string => Boolean(value)),
          pillLabel: approvalStatusLabel(log.to_status),
          tone: approvalActionTone(log.action),
          title: approvalActionLabel(log.action),
          transition: log.from_status
            ? `${approvalStatusLabel(log.from_status)} -> ${approvalStatusLabel(log.to_status)}`
            : approvalStatusLabel(log.to_status),
        })),
        ...approvalAllocations.map((allocation: (typeof approvalAllocations)[number]) => ({
          actor: allocation.created_by ?? '',
          at: timelineDate(allocation.status === 'reversed' ? allocation.updated_at ?? allocation.created_at : allocation.created_at),
          details: [
            `PMT: ${allocation.payment_doc_no}`,
            allocation.source_doc_no_snapshot ? `เอกสารต้นทาง: ${allocation.source_doc_no_snapshot}` : '',
            `ยอดจัดสรร: ${money(toNumber(allocation.allocated_amount))}`,
          ].filter((value): value is string => Boolean(value)),
          pillLabel: effectStatusLabel(allocation.status),
          tone: allocation.status === 'reversed' ? 'rose' as const : 'emerald' as const,
          title: allocation.status === 'reversed' ? 'คืน allocation จาก PMT' : 'ผูก PMA เข้ากับ PMT',
          transition: allocation.status === 'reversed' ? 'คืน allocation จาก PMT' : 'จัดสรร PMA เข้ากับ PMT',
        })),
      ].sort((left, right) => left.at.localeCompare(right.at))

      return NextResponse.json({
        accountRows: [],
        approvalRows: approvalAllocations.map((allocation: (typeof approvalAllocations)[number]) => ({
          amount: toNumber(allocation.allocated_amount),
          docNo: allocation.payment_doc_no,
          sourceDocNo: allocation.source_doc_no_snapshot ?? '-',
          statusLabel: effectStatusLabel(allocation.status),
        })),
        detailCards: [
          { label: 'เอกสารต้นทาง', value: approval.source_doc_no_snapshot ?? approval.source_id },
          { label: 'ประเภทต้นทาง', value: sourceTypeLabel(approval.source_type) },
          { label: 'ผู้รับเงิน', value: approval.party_name_snapshot ?? '-' },
          { label: 'วิธีจ่ายปลายทาง', value: approval.destination_payment_method_snapshot ?? '-' },
          { label: 'ธนาคารปลายทาง', value: approval.destination_bank_name_snapshot ?? '-' },
          { label: 'เลขบัญชีปลายทาง', value: approval.destination_account_no_snapshot ?? '-' },
          { label: 'ผู้อนุมัติ', value: approval.approved_by ?? '-' },
          { label: 'เหตุผลยกเลิก', value: approval.void_reason ?? '-' },
        ],
        docNo: approval.doc_no ?? documentId,
        heading: 'รายละเอียดอนุมัติจ่าย / PMA',
        latestStatusLabel: approvalStatusLabel(approval.status),
        latestTone: approvalCurrentTone,
        summary: {
          amount: toNumber(approval.approved_amount),
          approvedAt: dateOrDash(approval.approved_at),
          closedAt: approval.status === 'voided' ? dateOrDash(approval.voided_at) : dateOrDash(approval.paid_at),
          fee: 0,
          netAmount: toNumber(approval.approved_amount),
          statusLabel: approvalStatusLabel(approval.status),
          withholdingTax: 0,
        },
        timeline,
        timelineTitle: 'ประวัติ PMA',
        type: 'approval',
      })
    }

    const firstPayment = payments[0]!
    const voucherKey = firstPayment.voucher_id ?? firstPayment.doc_no
    const [statusLogs, allocations, accountSplits] = await Promise.all([
      prisma.payment_status_logs.findMany({
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        where: {
          OR: [
            { payment_voucher_id: voucherKey },
            { payment_doc_no: firstPayment.doc_no },
          ],
        },
      }),
      prisma.payment_allocations.findMany({
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        where: {
          OR: [
            { payment_voucher_id: voucherKey },
            { payment_doc_no: firstPayment.doc_no },
          ],
        },
      }),
      prisma.payment_account_splits.findMany({
        include: { accounts: true },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        where: {
          OR: [
            { payment_voucher_id: voucherKey },
            { payment_doc_no: firstPayment.doc_no },
          ],
        },
      }),
    ])

    const amount = payments.reduce((sum: number, payment: (typeof payments)[number]) => sum + toNumber(payment.amount), 0)
    const withholdingTax = payments.reduce((sum: number, payment: (typeof payments)[number]) => sum + toNumber(payment.withholding_tax), 0)
    const fee = payments.reduce((sum: number, payment: (typeof payments)[number]) => sum + toNumber(payment.fee ?? payment.bank_fee), 0)
    const netAmount = payments.reduce((sum: number, payment: (typeof payments)[number]) => sum + toNumber(payment.net_amount), 0)
    const status = payments.some((payment: (typeof payments)[number]) => payment.status === 'cancelled') ? 'cancelled' : 'active'
    const paymentCurrentTone: TimelineTone = status === 'cancelled' ? 'rose' : 'emerald'
    const directSourceRows = payments.flatMap((payment: (typeof payments)[number]) => directPaymentSourceRows(payment.lines))
    const timeline = [
      ...statusLogs.map((log: (typeof statusLogs)[number]) => ({
        actor: log.created_by ?? '',
        at: timelineDate(log.created_at),
        details: [
          `ยอดจ่าย: ${money(toNumber(log.amount_snapshot))}`,
          `สุทธิ: ${money(toNumber(log.net_amount_snapshot))}`,
          log.note ? `หมายเหตุ: ${log.note}` : '',
        ].filter((value): value is string => Boolean(value)),
        pillLabel: paymentStatusLabel(log.to_status),
        tone: paymentActionTone(log.action),
        title: paymentActionLabel(log.action),
        transition: log.from_status
          ? `${paymentStatusLabel(log.from_status)} -> ${paymentStatusLabel(log.to_status)}`
          : paymentStatusLabel(log.to_status),
      })),
      ...allocations.map((allocation: (typeof allocations)[number]) => ({
        actor: allocation.created_by ?? '',
        at: timelineDate(allocation.created_at),
        details: [
          `PMA: ${allocation.payment_approval_doc_no}`,
          allocation.source_doc_no_snapshot ? `เอกสารต้นทาง: ${allocation.source_doc_no_snapshot}` : '',
          `ยอดจัดสรร: ${money(toNumber(allocation.allocated_amount))}`,
        ].filter((value): value is string => Boolean(value)),
        pillLabel: effectStatusLabel(allocation.status),
        tone: allocation.status === 'reversed' ? 'rose' as const : 'blue' as const,
        title: allocation.status === 'reversed' ? 'คืน PMA allocation' : 'ผูก PMA เข้ากับ PMT',
        transition: allocation.status === 'reversed' ? 'คืน PMA allocation' : 'จัดสรร PMA เข้ากับ PMT',
      })),
      ...accountSplits.map((split: (typeof accountSplits)[number]) => ({
        actor: split.created_by ?? '',
        at: timelineDate(split.status === 'reversed' ? split.updated_at ?? split.created_at : split.created_at),
        details: [
          `บัญชี: ${split.account_name_snapshot ?? split.accounts?.name ?? '-'}`,
          split.account_code_snapshot ?? split.accounts?.code ? `รหัสบัญชี: ${split.account_code_snapshot ?? split.accounts?.code}` : '',
          split.bank_statement_doc_no ? `รายการธนาคาร: ${split.bank_statement_doc_no}` : '',
          `ยอด: ${money(toNumber(split.amount))}`,
        ].filter((value): value is string => Boolean(value)),
        pillLabel: effectStatusLabel(split.status),
        tone: split.status === 'reversed' ? 'rose' as const : 'emerald' as const,
        title: split.status === 'reversed' ? 'คืนรายการบัญชีจ่าย' : 'บันทึกรายการบัญชีจ่าย',
        transition: split.status === 'reversed' ? 'คืนรายการบัญชีจ่าย' : 'บันทึกรายการบัญชีจ่าย',
      })),
    ].sort((left, right) => left.at.localeCompare(right.at))

    const sourceDocNos = directSourceRows
      .map((row: (typeof directSourceRows)[number]) => row.sourceDocNo)
      .filter((value: string) => value !== '-')
    const allocationSourceDocNos = allocations
      .map((allocation: (typeof allocations)[number]) => allocation.source_doc_no_snapshot)
      .filter((value: string | null): value is string => Boolean(value))

    return NextResponse.json({
      accountRows: accountSplits.map((split: (typeof accountSplits)[number]) => ({
        accountName: split.account_name_snapshot ?? split.accounts?.name ?? '-',
        amount: toNumber(split.amount),
        bankStatementDocNo: split.bank_statement_doc_no ?? '-',
        statusLabel: effectStatusLabel(split.status),
      })),
      approvalRows: allocations.length > 0
        ? allocations.map((allocation: (typeof allocations)[number]) => ({
            amount: toNumber(allocation.allocated_amount),
            docNo: allocation.payment_approval_doc_no,
            sourceDocNo: allocation.source_doc_no_snapshot ?? '-',
            statusLabel: effectStatusLabel(allocation.status),
          }))
        : directSourceRows.map((row: (typeof directSourceRows)[number]) => ({
            amount: row.amount,
            docNo: sourceTypeLabel(row.sourceType),
            sourceDocNo: row.sourceDocNo,
            statusLabel: status === 'cancelled' ? 'ยกเลิก' : row.statusLabel,
          })),
      detailCards: [
        { label: 'เลขที่ PMT', value: firstPayment.doc_no },
        { label: 'วันที่จ่าย', value: dateOrDash(firstPayment.date) },
        { label: 'ผู้ขาย', value: firstPayment.suppliers?.name ?? '-' },
        { label: 'เอกสารต้นทาง', value: sourceDocNos.join(', ') || allocationSourceDocNos.join(', ') || '-' },
        { label: 'วิธีจ่าย', value: firstPayment.method ?? '-' },
        { label: 'หมายเหตุ', value: firstPayment.notes ?? '-' },
      ],
      docNo: firstPayment.doc_no,
      heading: 'รายละเอียดการจ่ายเงิน / PMT',
      latestStatusLabel: paymentStatusLabel(status),
      latestTone: paymentCurrentTone,
      summary: {
        amount,
        approvedAt: null,
        closedAt: null,
        fee,
        netAmount,
        statusLabel: paymentStatusLabel(status),
        withholdingTax,
      },
      timeline,
      timelineTitle: 'ประวัติ PMT',
      type: 'payment',
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายละเอียดประวัติการจ่ายเงินไม่ได้', 500)
  }
}
