import type { Prisma } from '../../../generated/prisma/client'

/**
 * Cancels the line facts of a Sales Bill without touching the business note.
 *
 * The cancellation reason is a document-level fact owned by
 * `sales_bills.cancel_note` and `sales_bill_status_logs.note`. This helper
 * intentionally does NOT accept a `reason` parameter so it can never write a
 * cancellation reason into `sales_bill_lines.notes`.
 */
export async function cancelSalesBillLineFacts(
  tx: Pick<Prisma.TransactionClient, 'sales_bill_lines'>,
  input: { actor: string; cancelledAt: Date; salesBillId: bigint },
): Promise<Prisma.BatchPayload> {
  return tx.sales_bill_lines.updateMany({
    data: {
      status: 'cancelled',
      updated_at: input.cancelledAt,
      updated_by: input.actor,
    },
    where: {
      sales_bill_id: input.salesBillId,
      status: 'active',
    },
  })
}
