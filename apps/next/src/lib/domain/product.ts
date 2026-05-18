import { Prisma } from '../../../generated/prisma/client'
import { productFormSchema, productSchema, type Product, type ProductFormValues } from '@/lib/product'

type PrismaProduct = {
  id: string
  code: string
  name: string
  active: boolean | null
  type: string | null
  unit: string | null
  target_margin_pct: Prisma.Decimal | null
  created_at: Date | null
  updated_at: Date | null
}

export function mapPrismaProduct(row: PrismaProduct): Product {
  return productSchema.parse({
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active ?? true,
    type: row.type,
    unit: row.unit,
    targetMarginPct: row.target_margin_pct === null ? null : row.target_margin_pct.toNumber(),
    createdAt: row.created_at?.toISOString() ?? null,
    updatedAt: row.updated_at?.toISOString() ?? null,
  })
}

export function toProductWriteInput(values: ProductFormValues) {
  const parsed = productFormSchema.parse(values)
  const code = parsed.code.toUpperCase()

  return {
    id: parsed.id || code,
    code,
    name: parsed.name,
    type: parsed.type || null,
    unit: parsed.unit || 'kg',
    target_margin_pct: parsed.targetMarginPct,
    active: parsed.active,
  }
}
