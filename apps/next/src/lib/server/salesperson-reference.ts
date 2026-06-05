import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import type { Prisma } from '../../../generated/prisma/client'

type SalespersonReference = {
  code: string
  id: bigint
  name: string
}

export async function findActiveSalespersonReferenceByCodeOrId(
  value: string | bigint | null | undefined,
): Promise<SalespersonReference | null> {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const internalId = parseInternalBigIntId(normalized)

  const salesperson = await prisma.salespersons.findFirst({
    select: { code: true, id: true, name: true },
    where: {
      active: true,
      OR: [
        { code: normalized.toUpperCase() },
        ...(internalId != null ? [{ id: internalId }] : []),
      ],
    } as Prisma.salespersonsWhereInput,
  })

  if (!salesperson) return null

  return {
    code: requireBusinessCode(salesperson.code, `พนักงานขาย ${salesperson.id}`),
    id: salesperson.id as bigint,
    name: salesperson.name,
  }
}

export async function listSalespersonReferencesByIds(ids: Array<string | bigint | null | undefined>) {
  const normalizedIds = Array.from(new Set(
    ids
      .map((value) => parseInternalBigIntId(value))
      .filter((value): value is bigint => value != null),
  ))
  if (!normalizedIds.length) return new Map<string, SalespersonReference>()

  const rows = await prisma.salespersons.findMany({
    select: { code: true, id: true, name: true },
    where: {
      id: { in: normalizedIds },
    } as Prisma.salespersonsWhereInput,
  })

  return new Map<string, SalespersonReference>(
    rows.map((row) => [
      String(row.id),
      {
        code: requireBusinessCode(row.code, `พนักงานขาย ${row.id}`),
        id: row.id as bigint,
        name: row.name,
      },
    ]),
  )
}
