import { z } from 'zod'
import { readBlobResponse, readJsonResponse } from '@/lib/api-client'

const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)
const codePattern = /^[A-Za-z0-9_-]+$/
const productCodePattern = /^SKU\d{3,5}$/
const productTextPattern = /^[\p{L}\p{M}\p{N}\s.&,()/'"+#%-]+$/u

const optionalProductText = (label: string, maxLength = 160) => z.preprocess(
  blankToNull,
  z.string().trim()
    .max(maxLength, `${label}ยาวเกินไป`)
    .regex(productTextPattern, `${label}มีรูปแบบไม่ถูกต้อง`)
    .nullable()
    .default(null),
)

export const productSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  active: z.boolean().default(true),
  itemStatus: z.enum(['RM', 'WIP', 'FG', 'SCRAP']).default('RM'),
  type: z.string().nullable().default(null),
  unit: z.string().nullable().default(null),
  createdAt: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
})

export const productListSchema = z.array(productSchema)
export const productListResultSchema = z.object({
  rows: productListSchema,
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(1),
})
export const productImportResultSchema = z.object({
  inserted: z.number().int().min(0),
  totalRows: z.number().int().min(0),
  updated: z.number().int().min(0),
})

export type Product = z.infer<typeof productSchema>
export type ProductImportResult = z.infer<typeof productImportResultSchema>
export type ProductListResult = z.infer<typeof productListResultSchema>

export type ProductListOptions = {
  active?: string
  all?: boolean
  direction?: 'asc' | 'desc'
  page?: number
  pageSize?: number
  productType?: string
  q?: string
  sort?: string
}

export const productFormSchema = z.object({
  id: z.string().trim().regex(codePattern, 'รหัสภายในสินค้ามีรูปแบบไม่ถูกต้อง').optional(),
  code: z.preprocess(
    (value) => {
      const normalized = blankToNull(value)
      return typeof normalized === 'string' ? normalized.trim().toUpperCase() : normalized
    },
    z.string()
      .max(40, 'รหัสสินค้ายาวเกินไป')
      .regex(productCodePattern, 'รหัสสินค้าต้องเป็นรูปแบบ SKU001-SKU99999')
      .nullable()
      .default(null),
  ),
  name: z.string().trim()
    .min(1, 'กรอกชื่อสินค้า')
    .max(180, 'ชื่อสินค้ายาวเกินไป')
    .regex(productTextPattern, 'ชื่อสินค้ามีรูปแบบไม่ถูกต้อง'),
  itemStatus: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
    z.enum(['RM', 'WIP', 'FG', 'SCRAP'], { errorMap: () => ({ message: 'เลือกสถานะรับเข้าสต๊อก' }) }).default('RM'),
  ),
  type: optionalProductText('ประเภทสินค้า', 120),
  unit: z.preprocess(
    blankToNull,
    z.string().trim()
      .max(40, 'หน่วยยาวเกินไป')
      .regex(productTextPattern, 'หน่วยมีรูปแบบไม่ถูกต้อง')
      .nullable()
      .default('กก.'),
  ),
  active: z.boolean().default(true),
}).superRefine((values, context) => {
  if (values.id && !values.code) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'ไม่พบรหัสสินค้า', path: ['code'] })
  }
})

export type ProductFormValues = z.infer<typeof productFormSchema>

export async function listProducts(options: ProductListOptions = {}): Promise<ProductListResult> {
  const params = new URLSearchParams()
  if (options.active) params.set('active', options.active)
  if (options.all) params.set('all', '1')
  if (options.productType) params.set('type', options.productType)
  if (options.q) params.set('q', options.q)
  if (options.sort) params.set('sort', options.sort)
  if (options.direction) params.set('direction', options.direction)
  if (options.page) params.set('page', String(options.page))
  if (options.pageSize) params.set('pageSize', String(options.pageSize))

  const query = params.toString()
  const response = await fetch(`/api/master-data/products${query ? `?${query}` : ''}`, { cache: 'no-store' })
  return readJsonResponse(response, productListResultSchema, 'โหลดข้อมูลสินค้าไม่ได้')
}

export async function saveProduct(values: ProductFormValues): Promise<Product> {
  const response = await fetch('/api/master-data/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })

  return readJsonResponse(response, productSchema, 'บันทึกข้อมูลสินค้าไม่ได้')
}

export async function setProductActive(productId: string, active: boolean): Promise<Product> {
  const response = await fetch(`/api/master-data/products/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  })

  return readJsonResponse(response, productSchema, 'อัปเดตสถานะสินค้าไม่ได้')
}

export async function exportProducts(options: ProductListOptions = {}): Promise<{ blob: Blob; filename: string }> {
  const params = new URLSearchParams()
  if (options.active) params.set('active', options.active)
  if (options.productType) params.set('type', options.productType)
  if (options.q) params.set('q', options.q)
  if (options.sort) params.set('sort', options.sort)
  if (options.direction) params.set('direction', options.direction)

  const query = params.toString()
  const response = await fetch(`/api/master-data/products/export${query ? `?${query}` : ''}`, { cache: 'no-store' })

  const disposition = response.headers.get('content-disposition') ?? ''
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `products_${new Date().toISOString().slice(0, 10)}.xlsx`
  return {
    blob: await readBlobResponse(response, 'Export Excel ไม่สำเร็จ'),
    filename,
  }
}

export async function importProducts(file: File): Promise<ProductImportResult> {
  const body = new FormData()
  body.append('file', file)

  const response = await fetch('/api/master-data/products/import', {
    method: 'POST',
    body,
  })

  return readJsonResponse(response, productImportResultSchema, 'Import Excel ไม่สำเร็จ')
}
