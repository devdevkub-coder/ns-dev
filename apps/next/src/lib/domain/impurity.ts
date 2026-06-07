import { impuritySchema, type Impurity } from '@/lib/impurity'
import { requireBusinessCode } from '@/lib/business-code'

export type PrismaImpurityRow = {
  id: bigint
  code: string | null
  name: string
  active: boolean
  created_at: Date | null
  updated_at: Date | null
}

export function mapPrismaImpurity(row: PrismaImpurityRow): Impurity {
  return impuritySchema.parse({
    id: row.id.toString(),
    code: requireBusinessCode(row.code, `สิ่งเจือปน ${row.id}`),
    name: row.name,
    active: row.active,
    createdAt: row.created_at?.toISOString() ?? null,
    updatedAt: row.updated_at?.toISOString() ?? null,
  })
}
