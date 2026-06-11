import { NextResponse } from 'next/server'
import { parseInternalBigIntId, requireBusinessCode, requireDocumentNo, stringifyBusinessValue } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission, getBranchCodeIntersection } from '@/lib/server/auth-context'
import { listDailyAccounts, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const prismaExt = prisma as typeof prisma & {
      payment_approvals: {
        findMany: (args: unknown) => Promise<Array<{
          approved_amount: unknown
          approved_at: Date | null
          doc_no: string | null
          destination_account_no_snapshot: string | null
          destination_bank_name_snapshot: string | null
          destination_payment_method_snapshot: string | null
          id: bigint
          note: string | null
          party_name_snapshot: string | null
          source_doc_no_snapshot: string | null
          source_id: string
          source_type: string
          status: string
          void_reason: string | null
          voided_at: Date | null
          payments: Array<{ id: bigint }>
        }>>
      }
    }

    const allowedBranchCodes = getBranchCodeIntersection(context)
    let allowedBranchIds: bigint[] | undefined = undefined
    if (allowedBranchCodes) {
      const matchingBranches = await prisma.branches.findMany({
        where: { code: { in: allowedBranchCodes } },
        select: { id: true }
      })
      allowedBranchIds = matchingBranches.map((b) => b.id)
    }

    const [accounts, bills, payments, suppliers, voidedApprovals] = await Promise.all([
      listDailyAccounts(),
      prisma.purchase_bills.findMany({
        orderBy: [{ date: 'desc' }],
        select: { doc_no: true, id: true },
        take: 5000,
        where: {
          ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}),
        },
      }),
      prisma.payments.findMany({
        where: {
          ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}),
        },
        include: { accounts: true, suppliers: true },
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        take: 5000,
      }),
      prisma.suppliers.findMany({
        orderBy: [{ name: 'asc' }],
        select: { code: true, id: true, name: true },
      }),
      prismaExt.payment_approvals.findMany({
        orderBy: [{ voided_at: 'desc' }, { approved_at: 'desc' }],
        select: {
          approved_amount: true,
          approved_at: true,
          doc_no: true,
          destination_account_no_snapshot: true,
          destination_bank_name_snapshot: true,
          destination_payment_method_snapshot: true,
          id: true,
          note: true,
          party_name_snapshot: true,
          payments: { select: { id: true } },
          source_doc_no_snapshot: true,
          source_id: true,
          source_type: true,
          status: true,
          void_reason: true,
          voided_at: true,
        },
        take: 5000,
        where: { source_type: { in: ['purchase_bill', 'advance_payment', 'expense'] }, status: 'voided' },
      }),
    ])

    const voidedPBIds = [...new Set(voidedApprovals.filter(a => a.source_type === 'purchase_bill').map(a => parseInternalBigIntId(a.source_id)).filter((id): id is bigint => id != null))]
    const voidedADVIds = [...new Set(voidedApprovals.filter(a => a.source_type === 'advance_payment').map(a => parseInternalBigIntId(a.source_id)).filter((id): id is bigint => id != null))]
    const voidedEXPIds = [...new Set(voidedApprovals.filter(a => a.source_type === 'expense').map(a => parseInternalBigIntId(a.source_id)).filter((id): id is bigint => id != null))]
    
    const [voidedPBs, voidedADVs, voidedEXPs] = await Promise.all([
      voidedPBIds.length > 0 ? prisma.purchase_bills.findMany({
        select: { id: true },
        where: { id: { in: voidedPBIds }, ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}) }
      }) : Promise.resolve([]),
      voidedADVIds.length > 0 ? prisma.supplier_advance_payments.findMany({
        select: { id: true },
        where: { id: { in: voidedADVIds }, ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}) }
      }) : Promise.resolve([]),
      voidedEXPIds.length > 0 ? prisma.expenses.findMany({
        select: { id: true },
        where: { id: { in: voidedEXPIds }, ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}) }
      }) : Promise.resolve([])
    ])
    
    const allowedPBIdsSet = new Set(voidedPBs.map(b => b.id.toString()))
    const allowedADVIdsSet = new Set(voidedADVs.map(a => a.id.toString()))
    const allowedEXPIdsSet = new Set(voidedEXPs.map(e => e.id.toString()))
    
    const allowedVoidedApprovals = voidedApprovals.filter(approval => {
      if (approval.source_type === 'purchase_bill') return allowedPBIdsSet.has(approval.source_id)
      if (approval.source_type === 'advance_payment') return allowedADVIdsSet.has(approval.source_id)
      if (approval.source_type === 'expense') return allowedEXPIdsSet.has(approval.source_id)
      return false
    })

    const paymentApprovalIds = [...new Set(payments.map((payment) => payment.payment_approval_id).filter((approvalId): approvalId is bigint => approvalId != null))]
    const activeApprovals = paymentApprovalIds.length > 0 ? await prismaExt.payment_approvals.findMany({
      select: {
        doc_no: true,
        id: true,
        party_name_snapshot: true,
        source_doc_no_snapshot: true,
      },
      where: {
        id: { in: paymentApprovalIds },
      },
    }) : []
    const supplierCodeById = new Map(suppliers.map((supplier) => [supplier.id, requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`)]))
    const billDocNoById = new Map(bills.map((bill) => [bill.id, bill.doc_no]))
    const approvalDocNoByInternalId = new Map(
      activeApprovals.map((approval) => [stringifyBusinessValue(approval.id), requireDocumentNo(approval.doc_no, `อนุมัติจ่าย ${approval.id}`)] as const),
    )
    const approvalSourceDocNoByInternalId = new Map(
      activeApprovals.map((approval) => [stringifyBusinessValue(approval.id), approval.source_doc_no_snapshot ?? ''] as const),
    )
    const approvalPartyNameByInternalId = new Map(
      activeApprovals.map((approval) => [stringifyBusinessValue(approval.id), approval.party_name_snapshot ?? ''] as const),
    )
    const voucherIds = [...new Set(payments.map((payment) => payment.voucher_id).filter((voucherId): voucherId is string => Boolean(voucherId)))]
    const [bankStatements, paymentAllocations, paymentAccountSplits] = voucherIds.length > 0 ? await Promise.all([
      prisma.bank_statement.findMany({
        include: { accounts: true },
        orderBy: [{ created_at: 'asc' }, { date: 'asc' }],
        where: {
          ref_id: { in: voucherIds },
          ref_type: 'PMT',
        },
      }),
      prisma.payment_allocations.findMany({
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        where: { payment_voucher_id: { in: voucherIds } },
      }),
      prisma.payment_account_splits.findMany({
        include: { accounts: true },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        where: { payment_voucher_id: { in: voucherIds } },
      }),
    ]) : [[], [], []]
    const bankStatementsByVoucherId = new Map<string, typeof bankStatements>()
    bankStatements.forEach((row) => {
      const voucherId = row.ref_id ?? ''
      if (!voucherId) return
      bankStatementsByVoucherId.set(voucherId, [...(bankStatementsByVoucherId.get(voucherId) ?? []), row])
    })
    const paymentAllocationsByVoucherId = new Map<string, typeof paymentAllocations>()
    paymentAllocations.forEach((row) => {
      const voucherId = row.payment_voucher_id ?? ''
      if (!voucherId) return
      paymentAllocationsByVoucherId.set(voucherId, [...(paymentAllocationsByVoucherId.get(voucherId) ?? []), row])
    })
    const paymentAccountSplitsByVoucherId = new Map<string, typeof paymentAccountSplits>()
    paymentAccountSplits.forEach((row) => {
      const voucherId = row.payment_voucher_id ?? ''
      if (!voucherId) return
      paymentAccountSplitsByVoucherId.set(voucherId, [...(paymentAccountSplitsByVoucherId.get(voucherId) ?? []), row])
    })

    const voucherRows = new Map<string, {
      accountId: string
      accountName: string
      accountNames: string[]
      accountSummaries: string[]
      approvalIds: string[]
      amount: number
      billDocNo: string
      billDocNos: string[]
      date: string
      docNo: string
      fee: number
      id: string
      method: string
      netAmount: number
      notes: string
      partyName: string
      status: string
      supplierId: string
      withholdingTax: number
    }>()

    payments.forEach((payment) => {
      const voucherKey = payment.voucher_id ?? payment.doc_no
      if (!voucherKey) return
      const existing = voucherRows.get(voucherKey)
      const paymentApprovalInternalId = payment.payment_approval_id ? stringifyBusinessValue(payment.payment_approval_id) : ''
      const factAllocations = paymentAllocationsByVoucherId.get(voucherKey) ?? []
      const factBillDocNos = [...new Set(factAllocations.map((allocation) => allocation.source_doc_no_snapshot).filter((value): value is string => Boolean(value)))]
      const factApprovalIds = [...new Set(factAllocations.map((allocation) => allocation.payment_approval_doc_no).filter(Boolean))]
      const directSourceDocNos = Array.isArray(payment.lines)
        ? [...new Set(payment.lines.flatMap((line) => {
            if (typeof line !== 'object' || line === null || Array.isArray(line)) return []
            const sourceDocNo = String((line as Record<string, unknown>).sourceDocNo ?? '').trim()
            return sourceDocNo ? [sourceDocNo] : []
          }))]
        : []
      const billDocNo = factBillDocNos[0] ?? (payment.bill_id
        ? (billDocNoById.get(payment.bill_id) ?? '')
        : (paymentApprovalInternalId ? (approvalSourceDocNoByInternalId.get(paymentApprovalInternalId) ?? '') : directSourceDocNos[0] ?? ''))
      if (!existing) {
        const statementRows = bankStatementsByVoucherId.get(voucherKey) ?? []
        const splitRows = paymentAccountSplitsByVoucherId.get(voucherKey) ?? []
        const accountEntries = splitRows.length > 0
          ? splitRows.map((row) => ({
              accountId: row.account_code_snapshot ?? row.accounts?.code ?? '',
              accountName: row.account_name_snapshot ?? row.accounts?.name ?? '-',
              amount: toNumber(row.amount),
            }))
          : statementRows.length > 0
          ? statementRows.map((row) => ({
              accountId: row.accounts?.code ?? '',
              accountName: row.accounts?.name ?? '-',
              amount: toNumber(row.amount_out),
            }))
          : [{
              accountId: payment.accounts?.code ?? '',
              accountName: payment.accounts?.name ?? '-',
              amount: toNumber(payment.net_amount),
            }]
        const uniqueAccountEntries = accountEntries.filter((entry, index, entries) => (
          entries.findIndex((candidate) => candidate.accountId === entry.accountId && candidate.accountName === entry.accountName) === index
        ))
        voucherRows.set(voucherKey, {
          accountId: uniqueAccountEntries[0]?.accountId ?? payment.accounts?.code ?? '',
          accountName: uniqueAccountEntries[0]?.accountName ?? payment.accounts?.name ?? '-',
          accountNames: uniqueAccountEntries.map((entry) => entry.accountName),
          accountSummaries: uniqueAccountEntries.map((entry) => `${entry.accountName} · ${toNumber(entry.amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`),
          approvalIds: factApprovalIds.length > 0
            ? factApprovalIds
            : payment.payment_approval_id
              ? [approvalDocNoByInternalId.get(paymentApprovalInternalId) ?? ''].filter(Boolean)
              : [],
          amount: 0,
          billDocNo,
          billDocNos: factBillDocNos.length > 0 ? factBillDocNos : directSourceDocNos.length > 0 ? directSourceDocNos : billDocNo ? [billDocNo] : [],
          date: toDateOnly(payment.date),
          docNo: payment.doc_no,
          fee: 0,
          id: payment.doc_no,
          method: payment.method ?? '',
          netAmount: 0,
          notes: payment.notes ?? '',
          partyName: payment.suppliers?.name
            ?? (paymentApprovalInternalId ? (approvalPartyNameByInternalId.get(paymentApprovalInternalId) || '-') : '-'),
          status: payment.status ?? 'active',
          supplierId: payment.supplier_id ? (supplierCodeById.get(payment.supplier_id) ?? '') : '',
          withholdingTax: 0,
        })
      }

      const row = voucherRows.get(voucherKey)
      if (!row) return
      row.amount += toNumber(payment.amount)
      row.fee += toNumber(payment.fee ?? payment.bank_fee)
      row.netAmount += toNumber(payment.net_amount)
      row.withholdingTax += toNumber(payment.withholding_tax)
      if (payment.payment_approval_id) {
        const approvalId = approvalDocNoByInternalId.get(paymentApprovalInternalId) ?? ''
        if (approvalId && !row.approvalIds.includes(approvalId)) row.approvalIds.push(approvalId)
      }
      if (billDocNo && !row.billDocNos.includes(billDocNo)) row.billDocNos.push(billDocNo)
      if (!row.billDocNo && billDocNo) row.billDocNo = billDocNo
      if (payment.status === 'cancelled') row.status = 'cancelled'
    })

    allowedVoidedApprovals
      .filter((approval) => approval.payments.length === 0)
      .forEach((approval) => {
        const approvalDocNo = requireDocumentNo(approval.doc_no, `อนุมัติจ่าย ${approval.id}`)
        const rowId = approvalDocNo
        const accountNo = approval.destination_account_no_snapshot?.trim() ?? ''
        const bankName = approval.destination_bank_name_snapshot?.trim()
          || approval.destination_payment_method_snapshot?.trim()
          || 'ยังไม่ได้ทำจ่าย'
        const accountSummary = accountNo ? `${bankName} · ${accountNo}` : bankName
        const resolvedBillId = parseInternalBigIntId(approval.source_id)
        const billDocNo = approval.source_doc_no_snapshot ?? (resolvedBillId != null ? (billDocNoById.get(resolvedBillId) ?? '') : '')
        const amount = toNumber(approval.approved_amount)

        voucherRows.set(rowId, {
          accountId: '',
          accountName: bankName,
          accountNames: [bankName],
          accountSummaries: [accountSummary],
          approvalIds: [approvalDocNo],
          amount,
          billDocNo,
          billDocNos: billDocNo ? [billDocNo] : [],
          date: toDateOnly(approval.voided_at ?? approval.approved_at),
          docNo: approvalDocNo,
          fee: 0,
          id: rowId,
          method: approval.destination_payment_method_snapshot ?? '',
          netAmount: amount,
          notes: approval.void_reason ?? approval.note ?? '',
          partyName: approval.party_name_snapshot ?? '-',
          status: 'cancelled',
          supplierId: '',
          withholdingTax: 0,
        })
      })

    return NextResponse.json({
      accounts,
      bills: bills.map((bill) => ({
        docNo: bill.doc_no,
        id: bill.doc_no,
      })),
      rows: Array.from(voucherRows.values()),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดประวัติการจ่ายเงินไม่ได้', 500)
  }
}
