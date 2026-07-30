import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '../../../../../generated/prisma/client'
import { parseInternalBigIntId } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { listActiveSuppliers, listAllAccounts, type AccountReferenceRecord } from '@/lib/server/reference-master-cache'
import { normalizeStockReferenceInput, stockReferenceData } from '@/lib/server/stock'
import { XLSX, type WorkBook } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

const openingStockItemSchema = z.object({
  applied: z.boolean().default(false), appliedAt: z.string().max(80).nullable().optional(), appliedRefId: z.string().max(80).nullable().optional(), appliedApRefId: z.string().max(80).nullable().optional(),
  id: z.string().trim().min(1).max(80), itemStatus: z.enum(['RM', 'WIP', 'FG']).default('RM'), linkedBillNo: z.string().trim().max(80).nullable().optional(),
  lotNo: z.string().trim().min(1).max(80).default('OPENING'), note: z.string().trim().max(500).nullable().optional(), paid: z.boolean().default(true),
  productId: z.string().trim().min(1), qty: z.coerce.number().finite().gt(0), supplierId: z.string().trim().nullable().optional(), unitCost: z.coerce.number().finite().gt(0),
  warehouseId: z.string().trim().min(1), branchId: z.string().trim().min(1),
})
const openingBalanceWriteSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), cutoffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), stockItems: z.array(openingStockItemSchema).max(5000) }),
  z.object({ action: z.literal('apply'), item: openingStockItemSchema }),
  z.object({ action: z.literal('unapply'), itemId: z.string().trim().min(1).max(80) }),
])
type OpeningBalanceData = Record<string, unknown> & { cutoffDate: string; goLiveDate: string; locked: boolean; stockItems: Array<z.infer<typeof openingStockItemSchema>> }
const defaultOpeningBalanceData: OpeningBalanceData = { cutoffDate: '2026-04-30', goLiveDate: '2026-05-01', locked: false, stockItems: [] }

const openingImportRowSchema = z.object({
  productName: z.string().trim().min(1),
  productType: z.string().trim().min(1),
  warehouseCode: z.string().trim().min(1),
  quantity: z.number().finite().gt(0),
  unitCost: z.number().finite().gt(0),
  sourceTotal: z.number().finite().nonnegative(),
  productCode: z.string().trim().optional(),
})

function importText(value: unknown) { return String(value ?? '').trim() }
function importNumber(value: unknown) { const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, '').trim()); return Number.isFinite(parsed) ? parsed : NaN }
function importKey(value: unknown) { return importText(value).replace(/\s+/g, ' ').toLowerCase() }
function importColumn(headers: unknown[], labels: string[]) { return headers.findIndex((header) => labels.some((label) => importKey(header) === importKey(label))) }

function parseOpeningImportWorkbook(workbook: WorkBook) {
  const sheet = workbook.SheetNames.map((name) => workbook.Sheets[name]).find((candidate) => {
    const headers = candidate.rows[0] ?? []
    return importColumn(headers, ['สินค้า', 'ชื่อสินค้า']) >= 0 && importColumn(headers, ['คลัง', 'คลังสินค้า']) >= 0
  })
  if (!sheet) throw new Error('ไม่พบ sheet ที่มีหัวตาราง สินค้า และ คลัง')
  const headers = sheet.rows[0] ?? []
  const indexes = {
    productName: importColumn(headers, ['สินค้า', 'ชื่อสินค้า']), productType: importColumn(headers, ['ประเภท', 'ประเภทสินค้า']),
    warehouseCode: importColumn(headers, ['คลัง', 'คลังสินค้า']), quantity: importColumn(headers, ['จำนวน', 'ปริมาณ', 'ยอดคงเหลือ']),
    unitCost: importColumn(headers, ['ราคาเฉลี่ย', 'ราคาต่อหน่วย', 'ต้นทุนต่อหน่วย']), sourceTotal: importColumn(headers, ['มูลค่ารวม', 'มูลค่า']), productCode: importColumn(headers, ['รหัสสินค้า', 'code']),
  }
  const required = Object.entries(indexes).filter(([key, index]) => key !== 'productCode' && index < 0).map(([key]) => key)
  if (required.length) throw new Error(`ขาดคอลัมน์ที่จำเป็น: ${required.join(', ')}`)
  return sheet.rows.slice(1).filter((row) => row.some((value) => importText(value))).map((row) => ({
    productCode: indexes.productCode >= 0 ? importText(row[indexes.productCode]) : '', productName: importText(row[indexes.productName]), productType: importText(row[indexes.productType]),
    warehouseCode: importText(row[indexes.warehouseCode]).toUpperCase(), quantity: importNumber(row[indexes.quantity]), sourceTotal: importNumber(row[indexes.sourceTotal]), unitCost: importNumber(row[indexes.unitCost]),
  }))
}

async function resolveOpeningImport(rows: Array<Record<string, unknown>>, branchCode: string) {
  const branch = await prisma.branches.findFirst({ select: { id: true, code: true }, where: { active: true, code: branchCode } })
  if (!branch) throw new Error(`ไม่พบสาขา ${branchCode}`)
  const parsedRows = rows.map((row) => openingImportRowSchema.safeParse(row))
  const invalidRows = parsedRows.map((parsed, index) => parsed.success ? null : `แถว ${index + 2}: จำนวน/ราคา/มูลค่าไม่ถูกต้อง`).filter(Boolean) as string[]
  if (invalidRows.length) return { branch, errors: invalidRows, items: [] as Array<z.infer<typeof openingStockItemSchema>>, warnings: [] as string[] }
  const values = parsedRows.flatMap((parsed) => parsed.success ? [parsed.data] : [])
  const products = await prisma.products.findMany({ select: { code: true, id: true, name: true, type: true }, where: { active: true, name: { in: [...new Set(values.map((row) => row.productName))] } } })
  const warehouses = await prisma.warehouses.findMany({ select: { branch_id: true, code: true, id: true, type: true }, where: { active: true, branch_id: branch.id, code: { in: [...new Set(values.map((row) => row.warehouseCode))] } } })
  const items: Array<z.infer<typeof openingStockItemSchema>> = []
  const errors: string[] = []
  const warnings: string[] = []
  values.forEach((row, index) => {
    const matches = products.filter((product) => importKey(product.name) === importKey(row.productName) && importKey(product.type) === importKey(row.productType))
    const product = row.productCode ? matches.find((candidate) => candidate.code.toUpperCase() === row.productCode?.toUpperCase()) : matches.length === 1 ? matches[0] : null
    const warehouse = warehouses.find((candidate) => candidate.code.toUpperCase() === row.warehouseCode.toUpperCase())
    if (!product) errors.push(`แถว ${index + 2}: ไม่พบหรือพบสินค้าซ้ำ ${row.productName} / ${row.productType}`)
    if (!warehouse) errors.push(`แถว ${index + 2}: ไม่พบคลัง ${row.warehouseCode} ในสาขา ${branchCode}`)
    if (!product || !warehouse) return
    const calculatedValue = row.quantity * row.unitCost
    if (Math.abs(calculatedValue - row.sourceTotal) > 0.05) warnings.push(`แถว ${index + 2}: ระบบจะใช้มูลค่า ${calculatedValue.toLocaleString('th-TH')} จากจำนวน × ราคา`)
    items.push({ applied: false, branchId: branch.id.toString(), id: `OB-IMP-${randomUUID().slice(0, 12).toUpperCase()}`, itemStatus: warehouse.type === 'FG' ? 'FG' : warehouse.type === 'WIP' ? 'WIP' : 'RM', lotNo: 'OPENING', paid: true, productId: product.id.toString(), qty: row.quantity, unitCost: row.unitCost, warehouseId: warehouse.id.toString() })
  })
  return { branch, errors, items, warnings }
}
function openingBalanceData(value: Prisma.JsonValue | null | undefined): OpeningBalanceData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaultOpeningBalanceData
  const source = value as Record<string, unknown>
  const stockItems = Array.isArray(source.stockItems) ? source.stockItems.flatMap((item) => { const parsed = openingStockItemSchema.safeParse(item); return parsed.success ? [parsed.data] : [] }) : []
  return { ...source, cutoffDate: typeof source.cutoffDate === 'string' ? source.cutoffDate : defaultOpeningBalanceData.cutoffDate, goLiveDate: typeof source.goLiveDate === 'string' ? source.goLiveDate : defaultOpeningBalanceData.goLiveDate, locked: source.locked === true, stockItems }
}
function stockSummary(items: OpeningBalanceData['stockItems']) {
  return items.reduce((summary, item) => { const value = item.qty * item.unitCost; summary.qty += item.qty; summary.value += value; if (item.paid) summary.paidValue += value; else summary.unpaidValue += value; return summary }, { paidValue: 0, qty: 0, unpaidValue: 0, value: 0 })
}
function toJsonData(data: OpeningBalanceData): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue }

const openingStockMarker = (itemId: string) => `OPENING_STOCK_ITEM:${itemId}`

async function syncOpeningStockAp(tx: Prisma.TransactionClient, item: z.infer<typeof openingStockItemSchema>, actor: string, cutoffDate: string, branchId: bigint, warehouseId: bigint, productId: bigint) {
  const marker = openingStockMarker(item.id)
  const existing = await tx.purchase_bills.findFirst({ where: { notes: { contains: marker }, purchase_source: 'OPENING_STOCK' }, select: { id: true, doc_no: true } })
  if (item.paid) {
    if (existing) await tx.purchase_bills.delete({ where: { id: existing.id } })
    return null
  }
  if (!item.supplierId) throw new Error('รายการที่ยังไม่จ่ายต้องเลือก Supplier ก่อน Apply')
  const supplierId = parseInternalBigIntId(item.supplierId)
  const supplier = await tx.suppliers.findFirst({ where: { active: true, OR: [{ code: item.supplierId }, ...(supplierId == null ? [] : [{ id: supplierId }])] }, select: { address: true, code: true, id: true, name: true, phone: true, tax_id: true } })
  if (!supplier) throw new Error('Supplier ไม่ถูกต้องหรือถูกปิดใช้งาน')
  const product = await tx.products.findUnique({ where: { id: productId }, select: { code: true, name: true, unit: true } })
  if (!product) throw new Error('สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน')
  const amount = item.qty * item.unitCost
  const docNo = item.linkedBillNo?.trim() || `STK-OPN-${item.id.slice(-12)}`
  const notes = `Auto จาก Stock Opening: ${marker}`
  const billData = {
    branch_id: branchId, created_by: actor, date: normalizeDate(cutoffDate), doc_no: docNo, has_vat: false,
    note: `${notes} · ${product.name} (${item.qty} × ${item.unitCost})`, notes, paid_amount: 0, payable_balance: amount,
    purchase_source: 'OPENING_STOCK', purchase_type: 'เครดิต', status: 'unpaid', subtotal: amount, supplier_id: supplier.id,
    supplier_name_snapshot: supplier.name, supplier_tax_id_snapshot: supplier.tax_id, supplier_address_snapshot: supplier.address,
    supplier_phone_snapshot: supplier.phone, total_amount: amount, transaction_mode: 'TRADING', updated_at: new Date(), updated_by: actor,
    warehouse_id: warehouseId,
  }
  const bill = existing
    ? await tx.purchase_bills.update({ data: billData, where: { id: existing.id }, select: { id: true, doc_no: true } })
    : await tx.purchase_bills.create({ data: billData, select: { id: true, doc_no: true } })
  const line = await tx.purchase_bill_items.findFirst({ where: { purchase_bill_id: bill.id, line_no: 1, item_status: 'active' }, select: { id: true } })
  const lineData = { amount, display_name: product.name, gross_weight: item.qty, lot_no: item.lotNo, note: item.note ?? null, price: item.unitCost, product_code: product.code, product_id: productId, product_name: product.name, qty: item.qty, unit: product.unit ?? 'kg', updated_at: new Date() }
  if (line) await tx.purchase_bill_items.update({ data: lineData, where: { id: line.id } })
  else await tx.purchase_bill_items.create({ data: { ...lineData, line_no: 1, purchase_bill_id: bill.id } })
  return bill
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.financials.view')

    const [row, accounts, stock, suppliers] = await Promise.all([
      prisma.opening_balance.findFirst({ orderBy: { id: 'asc' } }),
      listAllAccounts(),
      stockReferenceData({ includeCustomers: false }),
      listActiveSuppliers(),
    ])
    const opening = openingBalanceData(row?.data)
    const summary = stockSummary(opening.stockItems)
    return NextResponse.json({
      accounts: accounts.map((account: AccountReferenceRecord) => ({
        branchCode: account.branchCode ?? '',
        branchName: account.branchName ?? '',
        code: account.accountNo ?? '',
        currency: account.currency ?? 'THB',
        name: account.name,
        odLimit: account.odLimit == null ? 0 : Number(account.odLimit),
        openingBalance: account.openingBalance == null ? 0 : Number(account.openingBalance),
        type: account.type,
      })),
      designState: {
        applyWrite: 'stock_enabled_accounting_other_sections_pending',
        saveWrite: 'stock_enabled_accounting_other_sections_pending',
        targetModel: 'opening_balance.data.stockItems + stock_ledger',
      },
      stock: {
        cutoffDate: opening.cutoffDate, goLiveDate: opening.goLiveDate, locked: opening.locked, items: opening.stockItems,
        references: { branches: stock.branches, products: stock.products, suppliers: suppliers.map((supplier) => ({ code: supplier.code, id: supplier.id.toString(), name: supplier.name })), warehouses: stock.warehouses },
        summary,
      },
      row: {
        data: row?.data ?? null,
        id: row?.id?.toString() ?? '',
        updatedAt: row?.updated_at?.toISOString() || '',
        updatedBy: row?.updated_by || '',
      },
      summary: {
        apCost: 0,
        apExpense: 0,
        ar: 0,
        netOther: 0,
        stock: summary.value,
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Opening Balance ไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.financials.view')
    if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      requirePermission(context, 'finance.opening_balance.manage')
      const form = await request.formData()
      const branchCode = importText(form.get('branchCode'))
      const cutoffDate = importText(form.get('cutoffDate'))
      const file = form.get('file')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) throw new Error('วันที่ตัดยอดต้องเป็นรูปแบบ YYYY-MM-DD')
      if (!(file instanceof File)) throw new Error('เลือกไฟล์ Excel ก่อนตรวจสอบ')
      if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('รองรับเฉพาะไฟล์ .xlsx')
      if (file.size > 10 * 1024 * 1024) throw new Error('ไฟล์ Excel ต้องไม่เกิน 10 MB')
      const rows = parseOpeningImportWorkbook(await XLSX.read(Buffer.from(await file.arrayBuffer())))
      const resolved = await resolveOpeningImport(rows, branchCode)
      return NextResponse.json({ cutoffDate, errors: resolved.errors, items: resolved.items, summary: { errorRows: resolved.errors.length, itemRows: resolved.items.length, totalQty: resolved.items.reduce((sum, item) => sum + item.qty, 0), totalValue: resolved.items.reduce((sum, item) => sum + item.qty * item.unitCost, 0), warnings: resolved.warnings } })
    }
    const values = openingBalanceWriteSchema.parse(await request.json())
    const existing = await prisma.opening_balance.findFirst({ orderBy: { id: 'asc' } })
    const opening = openingBalanceData(existing?.data)
    if (opening.locked) return NextResponse.json({ error: 'Opening Balance ถูกล็อกแล้ว ไม่สามารถแก้ไขได้' }, { status: 409 })
    const actor = currentActor(context); const now = new Date()
    if (values.action === 'save') {
      const appliedById = new Map(opening.stockItems.filter((item) => item.applied).map((item) => [item.id, item]))
      for (const item of values.stockItems) { const applied = appliedById.get(item.id); if (applied) { const same = JSON.stringify({ ...item, applied: true, appliedRefId: applied.appliedRefId, appliedAt: applied.appliedAt }) === JSON.stringify({ ...applied, applied: true }); if (!same) return NextResponse.json({ error: `รายการ ${item.id} ถูก Apply แล้ว ต้องกด Unapply ก่อนแก้ไข` }, { status: 409 }) } }
      const incomingIds = new Set(values.stockItems.map((item) => item.id))
      const nextItems = [...values.stockItems.map((item) => appliedById.get(item.id) ?? item), ...opening.stockItems.filter((item) => item.applied && !incomingIds.has(item.id))]
      const nextData = { ...opening, cutoffDate: values.cutoffDate ?? opening.cutoffDate, stockItems: nextItems }
      const saved = existing ? await prisma.opening_balance.update({ data: { data: toJsonData(nextData), updated_at: now, updated_by: actor }, where: { id: existing.id } }) : await prisma.opening_balance.create({ data: { data: toJsonData(nextData), updated_at: now, updated_by: actor } })
      return NextResponse.json({ id: saved.id.toString(), stock: nextItems, summary: stockSummary(nextItems) })
    }
    if (values.action === 'unapply') {
      const item = opening.stockItems.find((candidate) => candidate.id === values.itemId)
      if (!item) return NextResponse.json({ error: 'ไม่พบรายการยกยอดสต็อก' }, { status: 404 })
      await prisma.$transaction(async (tx) => { await tx.stock_ledger.deleteMany({ where: { ref_type: 'OPENING', ref_id: item.id } }); await tx.purchase_bills.deleteMany({ where: { notes: { contains: openingStockMarker(item.id) }, purchase_source: 'OPENING_STOCK' } }); const nextItems = opening.stockItems.map((candidate) => candidate.id === item.id ? { ...candidate, applied: false, appliedAt: null, appliedRefId: null, appliedApRefId: null } : candidate); const nextData = { ...opening, stockItems: nextItems }; if (existing) await tx.opening_balance.update({ data: { data: toJsonData(nextData), updated_at: now, updated_by: actor }, where: { id: existing.id } }) })
      return NextResponse.json({ ok: true })
    }
    const references = await normalizeStockReferenceInput({ branchId: values.item.branchId, productId: values.item.productId, warehouseId: values.item.warehouseId })
    if (!references.branchId || !references.warehouseId || !references.productId) return NextResponse.json({ error: 'สินค้า สาขา หรือคลังไม่ถูกต้อง/ถูกปิดใช้งาน' }, { status: 400 })
    const branchId = references.branchId; const warehouseId = references.warehouseId; const productId = references.productId
    const nextItem = { ...values.item, applied: true, appliedAt: now.toISOString() }
    const saved = await prisma.$transaction(async (tx) => {
      const currentLedger = await tx.stock_ledger.findFirst({ where: { ref_type: 'OPENING', ref_id: values.item.id }, orderBy: { id: 'desc' } })
      const ledgerData = { branch_id: branchId, created_by: actor, date: normalizeDate(opening.cutoffDate), is_opening: true, lot_no: values.item.lotNo, movement_type: 'OPENING_STOCK_IN', note: values.item.note ?? null, notes: values.item.note ?? null, output_category: values.item.itemStatus, paid: values.item.paid, product_id: productId, qty_in: values.item.qty, qty_out: 0, ref_id: values.item.id, ref_no: `OPN-STK-${values.item.id.slice(-12)}`, ref_type: 'OPENING', unit_cost: values.item.unitCost, value_in: values.item.qty * values.item.unitCost, value_out: 0, warehouse_id: warehouseId }
      const ledger = currentLedger ? await tx.stock_ledger.update({ data: { ...ledgerData, updated_at: now, updated_by: actor, version: { increment: 1 } }, where: { id: currentLedger.id } }) : await tx.stock_ledger.create({ data: ledgerData })
      const ap = await syncOpeningStockAp(tx, values.item, actor, opening.cutoffDate, branchId, warehouseId, productId)
      const nextItems = opening.stockItems.some((candidate) => candidate.id === values.item.id) ? opening.stockItems.map((candidate) => candidate.id === values.item.id ? { ...nextItem, appliedRefId: ledger.id.toString(), appliedApRefId: ap?.id.toString() ?? null } : candidate) : [...opening.stockItems, { ...nextItem, appliedRefId: ledger.id.toString(), appliedApRefId: ap?.id.toString() ?? null }]
      const nextData = { ...opening, stockItems: nextItems }
      const row = existing ? await tx.opening_balance.update({ data: { data: toJsonData(nextData), updated_at: now, updated_by: actor }, where: { id: existing.id } }) : await tx.opening_balance.create({ data: { data: toJsonData(nextData), updated_at: now, updated_by: actor } })
      return { id: row.id.toString(), item: nextItems.find((candidate) => candidate.id === values.item.id) }
    })
    return NextResponse.json({ ok: true, ...saved })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึก Opening Stock ไม่ได้', 400)
  }
}
