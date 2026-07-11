import type { Prisma } from '../../../generated/prisma/client'
import {
  appendSupplierAdvanceStatusLog,
  supplierAdvanceStatusActionForStatus,
  SUPPLIER_ADVANCE_STATUS_ACTION,
} from '@/lib/server/advance-payment-history'
import { deriveAdvancePaymentWorkflowStatus, summarizeAdvancePaymentApprovalStatus } from '@/lib/server/advance-payments'
import { toNumber } from '@/lib/server/daily'

type PurchaseBillSettlementTx = Pick<
  Prisma.TransactionClient,
  'payment_approvals' | 'payments' | 'purchase_bills' | 'supplier_advance_allocations' | 'supplier_advance_payments' | 'supplier_advance_status_logs'
>

type NumericValue = { toNumber: () => number } | number | null | undefined

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function clampVatRate(value: number) {
  return Math.max(0, Math.min(100, value))
}

function purchaseBillAmountAfterAdvance(
  bill: {
    discount: NumericValue
    discount_total: NumericValue
    has_vat: boolean | null
    subtotal: NumericValue
    total_amount: NumericValue
    vat_rate_percent: NumericValue
    vat_type: string | null
  },
  advanceBaseAllocatedAmount: number,
) {
  const subtotal = toNumber(bill.subtotal)
  const discountTotal = toNumber(bill.discount_total) || toNumber(bill.discount)
  const afterDiscount = Math.max(0, roundMoney(subtotal - discountTotal))
  const vatRatePercent = clampVatRate(toNumber(bill.vat_rate_percent))
  const hasVat = Boolean(bill.has_vat) && bill.vat_type !== 'NONE' && vatRatePercent > 0
  const taxableBaseBeforeAdvance = hasVat && bill.vat_type === 'INCLUDE'
    ? roundMoney(afterDiscount * 100 / (100 + vatRatePercent))
    : afterDiscount
  const taxableBaseAmount = Math.max(0, roundMoney(taxableBaseBeforeAdvance - advanceBaseAllocatedAmount))
  const vatAmount = hasVat ? roundMoney(taxableBaseAmount * vatRatePercent / 100) : 0
  const totalAmount = hasVat ? roundMoney(taxableBaseAmount + vatAmount) : taxableBaseAmount

  return {
    taxableBaseAmount,
    totalAmount,
    vatAmount,
  }
}

export async function calculatePurchaseBillSettlement(tx: PurchaseBillSettlementTx, billId: bigint) {
  const [bill, payments, advanceAllocations] = await Promise.all([
    tx.purchase_bills.findUnique({
      select: {
        discount: true,
        discount_total: true,
        has_vat: true,
        id: true,
        status: true,
        subtotal: true,
        total_amount: true,
        vat_rate_percent: true,
        vat_type: true,
      },
      where: { id: billId },
    }),
    tx.payments.findMany({
      select: { amount: true, discount: true, status: true, withholding_tax: true },
      where: { bill_id: billId, NOT: { status: 'cancelled' } },
    }),
    tx.supplier_advance_allocations.findMany({
      select: { allocated_amount: true, allocated_subtotal_amount: true },
      where: { purchase_bill_id: billId, status: 'active' },
    }),
  ])

  if (!bill) throw new Error('ไม่พบบิลซื้อที่ต้องการคำนวณสถานะ')

  const paymentAmount = payments.reduce((sum, payment) => (
    sum + toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount)
  ), 0)
  const advanceBaseAllocatedAmount = roundMoney(advanceAllocations.reduce((sum, allocation) => (
    sum + (toNumber(allocation.allocated_subtotal_amount) || toNumber(allocation.allocated_amount))
  ), 0))
  const recalculatedBill = purchaseBillAmountAfterAdvance(bill, advanceBaseAllocatedAmount)
  const paidAmount = roundMoney(paymentAmount)
  const totalAmount = recalculatedBill.totalAmount
  if (paidAmount - totalAmount > 0.01) throw new Error('ยอดชำระรวมเกินยอดค้างของบิลซื้อ')

  const payableBalance = Math.max(0, roundMoney(totalAmount - paidAmount))
  const status = payableBalance <= 0.01 ? 'paid' : paidAmount <= 0 ? 'unpaid' : 'partial'

  return {
    advanceAllocatedAmount: advanceBaseAllocatedAmount,
    paidAmount,
    payableBalance,
    status,
    totalAmount,
    vatAmount: recalculatedBill.vatAmount,
  }
}

export async function refreshPurchaseBillSettlement(tx: PurchaseBillSettlementTx, billId: bigint, actor: string) {
  const settlement = await calculatePurchaseBillSettlement(tx, billId)
  await tx.purchase_bills.update({
    data: {
      paid_amount: settlement.paidAmount,
      payable_balance: settlement.payableBalance,
      status: settlement.status,
      total_amount: settlement.totalAmount,
      updated_at: new Date(),
      updated_by: actor,
      vat_amount: settlement.vatAmount,
    },
    where: { id: billId },
  })
  return settlement
}

export async function refreshSupplierAdvancePaymentAllocation(
  tx: PurchaseBillSettlementTx,
  advancePaymentId: bigint,
  actor?: string | null,
  options?: {
    action?: typeof SUPPLIER_ADVANCE_STATUS_ACTION[keyof typeof SUPPLIER_ADVANCE_STATUS_ACTION]
    note?: string | null
    meta?: Prisma.InputJsonValue
  },
) {
  const [advancePayment, activeAllocations] = await Promise.all([
    tx.supplier_advance_payments.findUnique({
      select: { amount: true, id: true, status: true, subtotal_amount: true },
      where: { id: advancePaymentId },
    }),
    tx.supplier_advance_allocations.findMany({
      select: { allocated_amount: true, allocated_subtotal_amount: true },
      where: { advance_payment_id: advancePaymentId, status: 'active' },
    }),
  ])

  if (!advancePayment) throw new Error('ไม่พบรายการ ADV ที่ต้องการอัปเดตสถานะ')

  const totalAmount = toNumber(advancePayment.subtotal_amount) || toNumber(advancePayment.amount)
  const allocatedAmount = roundMoney(activeAllocations.reduce((sum, allocation) => (
    sum + (toNumber(allocation.allocated_subtotal_amount) || toNumber(allocation.allocated_amount))
  ), 0))
  if (allocatedAmount - totalAmount > 0.01) throw new Error('ยอดใช้หักบิลรวมเกินยอด ADV')

  const remainingAmount = Math.max(0, roundMoney(totalAmount - allocatedAmount))
  const approvalSummary = await summarizeAdvancePaymentApprovalStatus(tx, advancePaymentId)
  const nextStatus = deriveAdvancePaymentWorkflowStatus({
    activeApprovalAmount: approvalSummary.activeApprovalAmount,
    allocatedAmount,
    allActiveApprovalsSettled: approvalSummary.allActiveApprovalsSettled,
    amount: totalAmount,
    currentStatus: advancePayment.status,
    remainingAmount,
    settledAmount: approvalSummary.settledAmount,
  })

  await tx.supplier_advance_payments.update({
    data: {
      allocated_amount: allocatedAmount,
      remaining_amount: remainingAmount,
      status: nextStatus,
      updated_at: new Date(),
    },
    where: { id: advancePaymentId },
  })

  if (nextStatus !== advancePayment.status) {
    await appendSupplierAdvanceStatusLog(tx, {
      action: options?.action ?? supplierAdvanceStatusActionForStatus(nextStatus),
      actor: actor ?? null,
      advancePaymentId,
      fromStatus: advancePayment.status,
      meta: options?.meta,
      note: options?.note ?? null,
      toStatus: nextStatus,
    })
  }

  return {
    allocatedAmount,
    remainingAmount,
    status: nextStatus,
  }
}
