import { requireBusinessCode } from '@/lib/business-code'
import { productFormSchema, productSchema, type Product, type ProductFormValues } from '@/lib/product'

type PrismaProduct = {
  id: bigint
  code: string
  name: string
  active: boolean | null
  item_status: string | null
  type: string | null
  unit: string | null
  created_at: Date | null
  updated_at: Date | null
}

export function mapPrismaProduct(row: PrismaProduct): Product {
  const outwardId = requireBusinessCode(row.code, `สินค้า ${row.id}`)
  return productSchema.parse({
    id: outwardId,
    code: outwardId,
    name: row.name,
    active: row.active ?? true,
    itemStatus: ['RM', 'WIP', 'FG', 'SCRAP'].includes(row.item_status ?? '') ? row.item_status : 'RM',
    type: row.type,
    unit: row.unit,
    createdAt: row.created_at?.toISOString() ?? null,
    updatedAt: row.updated_at?.toISOString() ?? null,
  })
}

export function toProductWriteInput(values: ProductFormValues) {
  const parsed = productFormSchema.parse(values)
  const code = parsed.code?.toUpperCase() || parsed.id || ''

  if (!code) {
    throw new Error('ไม่พบรหัสสินค้า')
  }

  return {
    code,
    name: parsed.name,
    item_status: parsed.itemStatus,
    type: parsed.type || null,
    unit: parsed.unit || 'กก.',
    active: parsed.active,
  }
}
