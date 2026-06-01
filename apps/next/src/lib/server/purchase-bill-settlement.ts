import type { Prisma } from '../../../generated/prisma/client'
import { toNumber } from '@/lib/server/daily'

type PurchaseBillSettlementTx = Pick<
  Prisma.TransactionClient,
  'payments' | 'purchase_bills' | 'supplier_advance_allocations' | 'supplier_advance_payments'
>

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export async function calculatePurchaseBillSettlement(tx: PurchaseBillSettlementTx, billId: string) {
  const [bill, payments, advanceAllocations] = await Promise.all([
    tx.purchase_bills.findUnique({
      select: { id: true, status: true, total_amount: true },
      where: { id: billId },
    }),
    tx.payments.findMany({
      select: { amount: true, discount: true, status: true, withholding_tax: true },
      where: { bill_id: billId, NOT: { status: 'cancelled' } },
    }),
    tx.supplier_advance_allocations.findMany({
      select: { allocated_amount: true },
      where: { purchase_bill_id: billId, status: 'active' },
    }),
  ])

  if (!bill) throw new Error('ไม่พบบิลซื้อที่ต้องการคำนวณสถานะ')

  const paymentAmount = payments.reduce((sum, payment) => (
    sum + toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount)
  ), 0)
  const advanceAllocatedAmount = advanceAllocations.reduce((sum, allocation) => (
    sum + toNumber(allocation.allocated_amount)
  ), 0)
  const paidAmount = roundMoney(paymentAmount + advanceAllocatedAmount)
  const totalAmount = toNumber(bill.total_amount)
  if (paidAmount - totalAmount > 0.01) throw new Error('ยอดชำระรวมเกินยอดค้างของบิลซื้อ')

  const payableBalance = Math.max(0, roundMoney(totalAmount - paidAmount))
  const status = paidAmount <= 0 ? 'unpaid' : payableBalance <= 0.01 ? 'paid' : 'partial'

  return {
    advanceAllocatedAmount: roundMoney(advanceAllocatedAmount),
    paidAmount,
    payableBalance,
    status,
    totalAmount,
  }
}

export async function refreshPurchaseBillSettlement(tx: PurchaseBillSettlementTx, billId: string, actor: string) {
  const settlement = await calculatePurchaseBillSettlement(tx, billId)
  await tx.purchase_bills.update({
    data: {
      paid_amount: settlement.paidAmount,
      payable_balance: settlement.payableBalance,
      status: settlement.status,
      updated_at: new Date(),
      updated_by: actor,
    },
    where: { id: billId },
  })
  return settlement
}

export async function refreshSupplierAdvancePaymentAllocation(tx: PurchaseBillSettlementTx, advancePaymentId: string) {
  const [advancePayment, activeAllocations] = await Promise.all([
    tx.supplier_advance_payments.findUnique({
      select: { amount: true, id: true, status: true },
      where: { id: advancePaymentId },
    }),
    tx.supplier_advance_allocations.findMany({
      select: { allocated_amount: true },
      where: { advance_payment_id: advancePaymentId, status: 'active' },
    }),
  ])

  if (!advancePayment) throw new Error('ไม่พบรายการ ADV ที่ต้องการอัปเดตสถานะ')

  const totalAmount = toNumber(advancePayment.amount)
  const allocatedAmount = roundMoney(activeAllocations.reduce((sum, allocation) => (
    sum + toNumber(allocation.allocated_amount)
  ), 0))
  if (allocatedAmount - totalAmount > 0.01) throw new Error('ยอดใช้หักบิลรวมเกินยอด ADV')

  const remainingAmount = Math.max(0, roundMoney(totalAmount - allocatedAmount))
  const nextStatus = advancePayment.status === 'cancelled'
    ? 'cancelled'
    : advancePayment.status === 'pending_approval'
      ? 'pending_approval'
      : advancePayment.status === 'approved'
        ? 'approved'
        : advancePayment.status === 'refunding'
          ? 'refunding'
          : advancePayment.status === 'refunded'
            ? 'refunded'
            : allocatedAmount <= 0.01
              ? 'paid'
              : remainingAmount <= 0.01
                ? 'allocated'
                : 'partially_allocated'

  await tx.supplier_advance_payments.update({
    data: {
      allocated_amount: allocatedAmount,
      remaining_amount: remainingAmount,
      status: nextStatus,
      updated_at: new Date(),
    },
    where: { id: advancePaymentId },
  })

  return {
    allocatedAmount,
    remainingAmount,
    status: nextStatus,
  }
}
