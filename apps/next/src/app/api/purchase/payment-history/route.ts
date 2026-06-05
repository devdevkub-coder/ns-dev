import { NextResponse } from 'next/server'
import { requireBusinessCode, requireDocumentNo, stringifyBusinessValue } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
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
          status: string
          void_reason: string | null
          voided_at: Date | null
          payments: Array<{ id: bigint }>
        }>>
      }
    }

    const [accounts, bills, payments, suppliers, voidedApprovals] = await Promise.all([
      listDailyAccounts(),
      prisma.purchase_bills.findMany({
        orderBy: [{ date: 'desc' }],
        select: { doc_no: true, id: true },
        take: 5000,
      }),
      prisma.payments.findMany({
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
          status: true,
          void_reason: true,
          voided_at: true,
        },
        take: 5000,
        where: { source_type: 'purchase_bill', status: 'voided' },
      }),
    ])
    const paymentApprovalIds = [...new Set(payments.map((payment) => payment.payment_approval_id).filter((approvalId): approvalId is bigint => approvalId != null))]
    const activeApprovals = paymentApprovalIds.length > 0 ? await prismaExt.payment_approvals.findMany({
      select: {
        doc_no: true,
        id: true,
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
    const voucherIds = [...new Set(payments.map((payment) => payment.voucher_id).filter((voucherId): voucherId is string => Boolean(voucherId)))]
    const bankStatements = voucherIds.length > 0 ? await prisma.bank_statement.findMany({
      include: { accounts: true },
      orderBy: [{ created_at: 'asc' }, { date: 'asc' }],
      where: {
        ref_id: { in: voucherIds },
        ref_type: 'PMT',
      },
    }) : []
    const bankStatementsByVoucherId = new Map<string, typeof bankStatements>()
    bankStatements.forEach((row) => {
      const voucherId = row.ref_id ?? ''
      if (!voucherId) return
      bankStatementsByVoucherId.set(voucherId, [...(bankStatementsByVoucherId.get(voucherId) ?? []), row])
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
      const billDocNo = payment.bill_id ? (billDocNoById.get(payment.bill_id) ?? '') : ''
      if (!existing) {
        const statementRows = bankStatementsByVoucherId.get(voucherKey) ?? []
        const accountEntries = statementRows.length > 0
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
          approvalIds: payment.payment_approval_id
            ? [approvalDocNoByInternalId.get(stringifyBusinessValue(payment.payment_approval_id)) ?? ''].filter(Boolean)
            : [],
          amount: 0,
          billDocNo,
          billDocNos: billDocNo ? [billDocNo] : [],
          date: toDateOnly(payment.date),
          docNo: payment.doc_no,
          fee: 0,
          id: payment.doc_no,
          method: payment.method ?? '',
          netAmount: 0,
          notes: payment.notes ?? '',
          partyName: payment.suppliers?.name ?? '-',
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
        const approvalId = approvalDocNoByInternalId.get(stringifyBusinessValue(payment.payment_approval_id)) ?? ''
        if (approvalId && !row.approvalIds.includes(approvalId)) row.approvalIds.push(approvalId)
      }
      if (billDocNo && !row.billDocNos.includes(billDocNo)) row.billDocNos.push(billDocNo)
      if (!row.billDocNo && billDocNo) row.billDocNo = billDocNo
      if (payment.status === 'cancelled') row.status = 'cancelled'
    })

    voidedApprovals
      .filter((approval) => approval.payments.length === 0)
      .forEach((approval) => {
        const approvalDocNo = requireDocumentNo(approval.doc_no, `อนุมัติจ่าย ${approval.id}`)
        const rowId = approvalDocNo
        const accountNo = approval.destination_account_no_snapshot?.trim() ?? ''
        const bankName = approval.destination_bank_name_snapshot?.trim()
          || approval.destination_payment_method_snapshot?.trim()
          || 'ยังไม่ได้ทำจ่าย'
        const accountSummary = accountNo ? `${bankName} · ${accountNo}` : bankName
        const resolvedBillId = BigInt(approval.source_id)
        const billDocNo = approval.source_doc_no_snapshot ?? billDocNoById.get(resolvedBillId) ?? ''
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
