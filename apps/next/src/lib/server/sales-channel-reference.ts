import { requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'

type SalesChannelReference = {
  code: string
  id: bigint
  name: string
}

export async function findActiveSalesChannelReferenceByCode(
  value: string | null | undefined,
): Promise<SalesChannelReference | null> {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (!normalized) return null

  const row = await prisma.sales_channels.findFirst({
    select: { code: true, id: true, name: true },
    where: {
      active: true,
      code: normalized,
    },
  })

  if (!row) return null

  return {
    code: requireBusinessCode(row.code, `ช่องทางขาย ${row.id}`),
    id: row.id,
    name: row.name,
  }
}
