import { impuritySchema, type Impurity } from '@/lib/impurity'

export type PrismaImpurityRow = {
  id: string
  name: string
  active: boolean | null
  created_at: Date | null
  updated_at: Date | null
}

export function mapPrismaImpurity(row: PrismaImpurityRow): Impurity {
  return impuritySchema.parse({
    id: row.id,
    name: row.name,
    active: row.active ?? true,
    createdAt: row.created_at?.toISOString() ?? null,
    updatedAt: row.updated_at?.toISOString() ?? null,
  })
}
