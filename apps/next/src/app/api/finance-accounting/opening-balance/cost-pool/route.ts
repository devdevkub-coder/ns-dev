import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { XLSX, type WorkBook } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_ROWS = 5000
const importTypeSchema = z.enum(['purchase_bill', 'opening_po', 'regrade'])
const importTypeLabels = { opening_po: 'เปิด PO', purchase_bill: 'บิลซื้อ', regrade: 'ปรับเกรด' } as const
type ImportType = z.infer<typeof importTypeSchema>
type Row = {
  availableQty: number
  availableValue: number
  category: string
  date: string
  docNo: string
  importType: ImportType
  lineKey: string
  partyName: string
  productName: string
  quantity: number
  unitCost: number
}
type ResolvedRow = Row & { error?: string; productId?: bigint; status: 'error' | 'ready' }

function text(value: unknown) { return String(value ?? '').trim() }
function norm(value: unknown) { return text(value).replace(/\s+/g, ' ').toLowerCase() }
function number(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(text(value).replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : NaN
}
function date(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString().slice(0, 10)
  const raw = text(value)
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!slash) return raw.slice(0, 10)
  let [, first, second, year] = slash
  const firstNumber = Number(first)
  const secondNumber = Number(second)
  if (firstNumber > 12 && secondNumber <= 12) [first, second] = [second, first]
  const normalizedYear = Number(year) > 2400 ? Number(year) - 543 : Number(year)
  return `${normalizedYear.toString().padStart(4, '0')}-${first.padStart(2, '0')}-${second.padStart(2, '0')}`
}
function column(headers: unknown[], labels: string[]) { return headers.findIndex((header) => labels.some((label) => norm(header) === norm(label))) }
function sourceKey(importType: ImportType, docNo: string, lineKey: string) { return `OPENING_COST_POOL:${importType}:${docNo}:${lineKey}` }

function parseWorkbook(workbook: WorkBook, importType: ImportType) {
  const sheet = workbook.SheetNames.map((name) => workbook.Sheets[name]).find((candidate) => {
    const headers = candidate.rows[0] ?? []
    return column(headers, ['เลขที่เอกสาร', 'เลขที่']) >= 0 && column(headers, ['TYPE', 'Type']) >= 0 && column(headers, ['วันที่ออก', 'วันที่']) >= 0 && column(headers, ['สินค้า', 'ชื่อสินค้า']) >= 0 && column(headers, ['จำนวน', 'Qty']) >= 0 && column(headers, ['ราคา', 'ต้นทุน']) >= 0 && column(headers, ['รอขาย', 'จำนวนคงเหลือ']) >= 0
  })
  if (!sheet) throw new Error('ไม่พบชีต Cost Pool ที่มีหัวตารางครบถ้วน')
  const headers = sheet.rows[0] ?? []
  const indexes = {
    availableQty: column(headers, ['รอขาย', 'จำนวนคงเหลือ']),
    availableValue: column(headers, ['มูลค่ารอขาย', 'มูลค่าคงเหลือ']),
    category: column(headers, ['หมวดหมู่', 'กลุ่มสินค้า']),
    date: column(headers, ['วันที่ออก', 'วันที่']),
    docNo: column(headers, ['เลขที่เอกสาร', 'เลขที่']),
    product: column(headers, ['สินค้า', 'ชื่อสินค้า']),
    quantity: column(headers, ['จำนวน', 'Qty']),
    type: column(headers, ['TYPE', 'Type']),
    unitCost: column(headers, ['ราคา', 'ต้นทุน']),
    party: column(headers, ['ผู้ขาย', 'คู่ค้า', 'Supplier']),
  }
  let currentDocNo = ''
  return sheet.rows.slice(1).flatMap((row, rowIndex) => {
    if (!row.some((value) => text(value) !== '')) return []
    const rawType = text(row[indexes.type])
    if (rawType !== importTypeLabels[importType]) return []
    if (text(row[indexes.docNo])) currentDocNo = text(row[indexes.docNo])
    const lineKey = `row-${rowIndex + 2}`
    const availableQty = number(row[indexes.availableQty])
    const availableValue = indexes.availableValue >= 0 ? number(row[indexes.availableValue]) : availableQty * number(row[indexes.unitCost])
    return [{
      availableQty,
      availableValue,
      category: text(row[indexes.category]),
      date: date(row[indexes.date]),
      docNo: currentDocNo,
      importType,
      lineKey,
      partyName: indexes.party >= 0 ? text(row[indexes.party]) : '',
      productName: text(row[indexes.product]),
      quantity: number(row[indexes.quantity]),
      unitCost: number(row[indexes.unitCost]),
    }]
  }).slice(0, MAX_ROWS)
}

async function resolve(rows: Row[], branchCode: string, warehouseCode: string): Promise<ResolvedRow[]> {
  const [products, branch, warehouse] = await Promise.all([
    prisma.products.findMany({ select: { id: true, metal_group: true, name: true }, where: { active: true } }),
    prisma.branches.findFirst({ select: { id: true }, where: { active: true, code: branchCode } }),
    prisma.warehouses.findFirst({ select: { branch_id: true, id: true }, where: { active: true, code: warehouseCode } }),
  ])
  const productsByName = new Map<string, typeof products[number][]>()
  for (const product of products) productsByName.set(norm(product.name), [...(productsByName.get(norm(product.name)) ?? []), product])
  const sourceKeys = rows.map((row) => sourceKey(row.importType, row.docNo, row.lineKey))
  const existing = new Set((sourceKeys.length ? await prisma.stock_cost_pool_entries.findMany({ select: { source_ref_id: true }, where: { source_ref_id: { in: sourceKeys } } }) : []).map((row) => row.source_ref_id))
  return rows.map((row) => {
    const matches = productsByName.get(norm(row.productName)) ?? []
    const product = matches.length === 1 ? matches[0] : null
    const error = !branch ? `ไม่พบสาขา ${branchCode}`
      : !warehouse ? `ไม่พบคลัง ${warehouseCode}`
        : warehouse.branch_id !== branch.id ? `คลัง ${warehouseCode} ไม่ได้อยู่สาขา ${branchCode}`
          : !row.docNo ? 'ไม่พบเลขที่เอกสาร (ตรวจสอบ Merge Cell ในไฟล์)'
            : existing.has(sourceKey(row.importType, row.docNo, row.lineKey)) ? `รายการ ${row.docNo} มีอยู่แล้ว`
              : !row.productName ? 'ไม่พบชื่อสินค้า'
                : matches.length > 1 ? `พบสินค้า ${row.productName} มากกว่า 1 รายการ ต้องแก้ Product Master`
                  : !product ? `ไม่พบสินค้า ${row.productName}`
                    : !String(product.metal_group ?? '').match(/ทองแดง|ทองเหลือง|copper|brass/i) ? `สินค้า ${row.productName} ไม่อยู่ในกลุ่ม Cost Pool`
                      : !Number.isFinite(row.availableQty) || row.availableQty <= 0 ? 'จำนวนรอขายต้องมากกว่า 0'
                        : !Number.isFinite(row.unitCost) || row.unitCost <= 0 ? 'ราคาต้นทุนต้องมากกว่า 0'
                          : !Number.isFinite(row.availableValue) || row.availableValue < 0 ? 'มูลค่ารอขายไม่ถูกต้อง'
                            : !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ? 'วันที่ไม่ถูกต้อง' : undefined
    return { ...row, error, productId: product?.id, status: error ? 'error' : 'ready' }
  })
}

async function commit(context: Awaited<ReturnType<typeof getCurrentAuthContext>>, input: { branchCode: string; importType: ImportType; rows: Row[]; warehouseCode: string }) {
  const allowed = getBranchCodeIntersection(context, input.branchCode)
  if (allowed && !allowed.includes(input.branchCode)) throw new AuthContextError('ไม่มีสิทธิ์นำเข้า Cost Pool ของสาขานี้', 403)
  const rows = await resolve(input.rows, input.branchCode, input.warehouseCode)
  const errors = rows.filter((row) => row.status === 'error')
  if (errors.length) throw new Error(`ตรวจสอบไม่ผ่าน ${errors.length} แถว: ${errors.slice(0, 5).map((row) => row.error).join(', ')}`)
  const branch = await prisma.branches.findFirst({ select: { id: true }, where: { active: true, code: input.branchCode } })
  const warehouse = await prisma.warehouses.findFirst({ select: { branch_id: true, id: true }, where: { active: true, code: input.warehouseCode } })
  if (!branch || !warehouse || warehouse.branch_id !== branch.id) throw new Error('ไม่พบสาขาหรือคลังที่เลือก')
  const actor = currentActor(context)
  const sourceType = input.importType === 'purchase_bill' ? 'Opening_Purchase' : input.importType === 'opening_po' ? 'Opening_PO' : 'Opening_Regrade'
  return prisma.$transaction(async (tx) => {
    const sourceKeys = rows.map((row) => sourceKey(row.importType, row.docNo, row.lineKey))
    const existing = await tx.stock_cost_pool_entries.findMany({ select: { source_ref_id: true }, where: { source_ref_id: { in: sourceKeys } } })
    if (existing.length) throw new Error(`พบรายการ Cost Pool ที่นำเข้าแล้ว ${existing.length} รายการ`)
    const createdAt = new Date()
    await tx.stock_cost_pool_entries.createMany({ data: rows.map((row) => ({
      allocated_qty: 0,
      branch_id: branch.id,
      created_at: createdAt,
      created_by: actor,
      date: normalizeDate(row.date),
      notes: `Opening Cost Pool · ${importTypeLabels[row.importType]} · ${row.partyName || '-'}`,
      original_qty: row.availableQty,
      original_value: row.availableValue || row.availableQty * row.unitCost,
      product_id: row.productId!,
      released_qty: 0,
      source_line_id: row.lineKey,
      source_ref_id: sourceKey(row.importType, row.docNo, row.lineKey),
      source_ref_no: row.docNo,
      source_ref_type: 'OPENING_COST_POOL',
      source_type: sourceType,
      status: 'Available',
      unit_cost: row.unitCost,
      updated_at: createdAt,
      updated_by: actor,
      warehouse_id: warehouse.id,
    })) })
    await tx.app_audit_logs.create({ data: { action: `opening_cost_pool_${input.importType}_import`, actor_auth_user_id: context.authUser.id, actor_app_user_id: context.appUser?.id ?? null, actor_display_name: context.appUser?.displayName, actor_username: context.appUser?.username, entity_label: 'cost_pool', event_key: `opening-cost-pool-${input.importType}:${randomUUID()}`, http_method: 'POST', metadata: { branchCode: input.branchCode, inputRows: rows.length, warehouseCode: input.warehouseCode }, request_path: '/api/finance-accounting/opening-balance/cost-pool', target_type: 'opening_cost_pool_import' } })
    return { inputRows: rows.length }
  })
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.opening_balance.manage')
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const branchCode = text(form.get('branchCode'))
      const importType = importTypeSchema.parse(text(form.get('importType')))
      const warehouseCode = text(form.get('warehouseCode'))
      const allowed = getBranchCodeIntersection(context, branchCode)
      if (allowed && !allowed.includes(branchCode)) throw new AuthContextError('ไม่มีสิทธิ์ตรวจสอบ Cost Pool ของสาขานี้', 403)
      const file = form.get('file')
      if (!(file instanceof File)) throw new Error('เลือกไฟล์ Excel Cost Pool ก่อนตรวจสอบ')
      if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('รองรับเฉพาะไฟล์ .xlsx')
      if (file.size > MAX_FILE_SIZE) throw new Error('ไฟล์ Excel ต้องไม่เกิน 10 MB')
      const rows = parseWorkbook(await XLSX.read(Buffer.from(await file.arrayBuffer())), importType)
      const resolved = await resolve(rows, branchCode, warehouseCode)
      const ready = resolved.filter((row) => row.status === 'ready')
      return NextResponse.json({ branchCode, importType, rows: resolved.map(({ productId: _productId, ...row }) => row), summary: { errorRows: resolved.length - ready.length, inputRows: resolved.length, readyRows: ready.length, totalValue: ready.reduce((sum, row) => sum + row.availableValue, 0), warehouseCode } })
    }
    const input = z.object({ action: z.literal('commit'), branchCode: z.string().trim().min(1).max(40), importType: importTypeSchema, rows: z.array(z.object({ availableQty: z.number().finite().positive(), availableValue: z.number().finite().nonnegative(), category: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), docNo: z.string(), importType: importTypeSchema, lineKey: z.string(), partyName: z.string(), productName: z.string(), quantity: z.number().finite().nonnegative(), unitCost: z.number().finite().positive() })).min(1).max(MAX_ROWS), warehouseCode: z.string().trim().min(1).max(80) }).parse(await request.json())
    if (input.rows.some((row) => row.importType !== input.importType)) throw new Error('ประเภทข้อมูลใน Preview ไม่ตรงกับประเภทที่จะยืนยัน')
    return NextResponse.json(await commit(context, input), { status: 201 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'นำเข้า Cost Pool Opening ไม่สำเร็จ', 400)
  }
}
