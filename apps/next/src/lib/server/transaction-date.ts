import type { Prisma } from '../../../generated/prisma/client'

function toDateString(value: Date) {
  return value.toISOString().slice(0, 10)
}

/** Reads the action date from the same transaction that will persist a reversal. */
export async function currentTransactionDate(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<Array<{ business_date: Date }>>`select current_date as business_date`
  const businessDate = rows[0]?.business_date
  if (!businessDate) throw new Error('ไม่พบวันที่ดำเนินการสำหรับ reversal')
  return toDateString(businessDate)
}
