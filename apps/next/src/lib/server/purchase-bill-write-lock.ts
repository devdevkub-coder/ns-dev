import { Prisma } from '../../../generated/prisma/client'

export class PurchaseBillWriteConflictError extends Error {
  readonly code = 'CONFLICT' as const
  readonly status = 409 as const

  constructor(message: string) {
    super(message)
    this.name = 'PurchaseBillWriteConflictError'
  }
}

function isPostgresLockNotAvailable(caught: unknown) {
  if (!(caught instanceof Prisma.PrismaClientKnownRequestError) || caught.code !== 'P2010') return false
  if (!caught.meta || typeof caught.meta !== 'object' || !('code' in caught.meta)) return false
  return caught.meta.code === '55P03'
}

export async function lockPurchaseBillWriteSources(
  tx: Prisma.TransactionClient,
  sources: {
    purchaseBillIds?: bigint[]
    poBuyIds?: bigint[]
    weightTicketIds?: bigint[]
  },
) {
  const purchaseBillIds = [...new Set(sources.purchaseBillIds ?? [])]
  const poBuyIds = [...new Set(sources.poBuyIds ?? [])]
  const weightTicketIds = [...new Set(sources.weightTicketIds ?? [])]

  try {
    // Keep the same order for every write path so concurrent writes do not deadlock.
    if (purchaseBillIds.length > 0) {
      await tx.$queryRaw`select id from public.purchase_bills where id in (${Prisma.join(purchaseBillIds)}) order by id for update nowait`
    }
    if (poBuyIds.length > 0) {
      await tx.$queryRaw`select id from public.po_buys where id in (${Prisma.join(poBuyIds)}) order by id for update nowait`
    }
    if (weightTicketIds.length > 0) {
      await tx.$queryRaw`select id from public.weight_tickets where id in (${Prisma.join(weightTicketIds)}) order by id for update nowait`
    }
  } catch (caught) {
    if (isPostgresLockNotAvailable(caught)) {
      throw new PurchaseBillWriteConflictError('ใบรับของ, PO Buy หรือบิลนี้กำลังถูกทำรายการอยู่ กรุณาลองใหม่อีกครั้ง')
    }
    throw caught
  }
}
