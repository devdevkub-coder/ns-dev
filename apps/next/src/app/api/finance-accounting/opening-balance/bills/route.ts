import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate } from '@/lib/server/daily'
import { PURCHASE_BILL_STATUS } from '@/lib/purchase-bill-status'
import { prisma } from '@/lib/server/prisma'
import { SALES_BILL_STATUS } from '@/lib/server/sales-bill-history'
import { XLSX, type WorkBook } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_ROWS = 10_000
const rowSchema = z.object({ docNo: z.string().trim().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), partyName: z.string().trim().min(1), productName: z.string().trim().min(1), productType: z.string().trim().optional(), quantity: z.number().finite().gt(0), unitPrice: z.number().finite().nonnegative(), lineAmount: z.number().finite().nonnegative(), vatAmount: z.number().finite().nonnegative(), totalAmount: z.number().finite().nonnegative(), location: z.string().trim().optional(), contractNo: z.string().trim().optional() })
const commitSchema = z.object({ action: z.literal('commit'), branchCode: z.string().trim().min(1).max(40), importType: z.enum(['purchase', 'sales']), rows: z.array(rowSchema).min(1).max(MAX_ROWS) })
type Row = z.infer<typeof rowSchema>
type ResolvedRow = Row & { error?: string; productCode: string; productId?: bigint; partyId?: bigint; status: 'error' | 'ready'; warning?: string }

function text(value: unknown) { return String(value ?? '').trim() }
function norm(value: unknown) { return text(value).replace(/\s+/g, ' ').toLowerCase() }
function number(value: unknown) { const parsed = typeof value === 'number' ? value : Number(text(value).replace(/,/g, '')); return Number.isFinite(parsed) ? parsed : NaN }
function date(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString().slice(0, 10)
  const raw = text(value); const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!match) return raw.slice(0, 10)
  const [, month, day, year] = match; const normalizedYear = Number(year) > 2400 ? Number(year) - 543 : Number(year)
  return `${normalizedYear.toString().padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}
function column(headers: unknown[], labels: string[]) { return headers.findIndex((header) => labels.some((label) => norm(header) === norm(label))) }

function parseWorkbook(workbook: WorkBook, importType: 'purchase' | 'sales') {
  const partyLabels = importType === 'purchase' ? ['ผู้ขาย', 'Supplier'] : ['ผู้ซื้อ', 'Customer']
  const sheet = workbook.SheetNames.map((name) => workbook.Sheets[name]).find((candidate) => { const h = candidate.rows[0] ?? []; return column(h, ['เลขที่เอกสาร', 'เลขที่', 'เลขที่บิล', 'เลขที่บิลขาย']) >= 0 && column(h, ['วันที่', 'วันที่ออก']) >= 0 && column(h, partyLabels) >= 0 && column(h, ['สินค้า', 'ชื่อสินค้า']) >= 0 && column(h, ['รวมทั้งสิ้น', 'ยอดรวม']) >= 0 })
  if (!sheet) throw new Error('ไม่พบชีตบิลซื้อ/บิลขายที่มีหัวตารางครบถ้วน')
  const h = sheet.rows[0] ?? []
  const i = { docNo: column(h, ['เลขที่เอกสาร', 'เลขที่', 'เลขที่บิล', 'เลขที่บิลขาย']), date: column(h, ['วันที่', 'วันที่ออก']), party: column(h, partyLabels), product: column(h, ['สินค้า', 'ชื่อสินค้า']), type: column(h, ['ประเภท', 'ประเภทสินค้า']), qty: column(h, ['นน.สุทธิ', 'จำนวนกก.', 'จำนวน', 'ปริมาณ']), price: column(h, ['ราคาซื้อ', 'ราคา/บาท', 'ราคา']), amount: column(h, ['รวม', 'มูลค่า']), vat: column(h, ['ภาษีมูลค่าเพิ่ม', 'ภาษีมูลค่าพิ่ม', 'ภาษี']), total: column(h, ['รวมทั้งสิ้น', 'ยอดรวม']), location: column(h, ['สถานที่ส่ง', 'สถานที่']), contract: column(h, ['contract', 'เลขที่สัญญา']) }
  const required = ['docNo', 'date', 'party', 'product', 'qty', 'price', 'amount', 'vat', 'total'] as const
  const missing = required.filter((key) => i[key] < 0); if (missing.length) throw new Error(`ขาดคอลัมน์ที่จำเป็น: ${missing.join(', ')}`)
  return sheet.rows
    .slice(1)
    .filter((row) => row.some((value) => text(value) !== ''))
    .slice(0, MAX_ROWS)
    .map((row) => rowSchema.parse({
      contractNo: i.contract >= 0 ? text(row[i.contract]) : '',
      date: date(row[i.date]),
      docNo: text(row[i.docNo]),
      lineAmount: number(row[i.amount]),
      location: i.location >= 0 ? text(row[i.location]) : '',
      partyName: text(row[i.party]),
      productName: text(row[i.product]),
      productType: i.type >= 0 ? text(row[i.type]) : '',
      quantity: number(row[i.qty]),
      totalAmount: number(row[i.total]),
      unitPrice: number(row[i.price]),
      vatAmount: number(row[i.vat]),
    }));
}

async function resolve(rows: Row[], branchCode: string, importType: 'purchase' | 'sales'): Promise<ResolvedRow[]> {
  const [products, parties, branch] = await Promise.all([prisma.products.findMany({ select: { code: true, id: true, name: true, type: true }, where: { active: true } }), importType === 'purchase' ? prisma.suppliers.findMany({ select: { id: true, name: true }, where: { active: true } }) : prisma.customers.findMany({ select: { id: true, name: true }, where: { active: true } }), prisma.branches.findFirst({ select: { id: true }, where: { active: true, code: branchCode } })])
  const productsByKey = new Map(products.map((product) => [`${norm(product.name)}|${norm(product.type)}`, product])); const partiesByName = new Map(parties.map((party) => [norm(party.name), party])); const docNos = [...new Set(rows.map((row) => row.docNo))]
  const existing = new Set((importType === 'purchase' ? await prisma.purchase_bills.findMany({ select: { doc_no: true }, where: { doc_no: { in: docNos } } }) : await prisma.sales_bills.findMany({ select: { doc_no: true }, where: { doc_no: { in: docNos } } })).map((row) => row.doc_no))
  return rows.map((row) => { const product = productsByKey.get(`${norm(row.productName)}|${norm(row.productType)}`); const party = partiesByName.get(norm(row.partyName)); const error = !branch ? `ไม่พบสาขา ${branchCode}` : existing.has(row.docNo) ? `เลขที่เอกสาร ${row.docNo} มีอยู่แล้ว` : !party ? `ไม่พบ${importType === 'purchase' ? 'ผู้ขาย' : 'ผู้ซื้อ'} ${row.partyName}` : !product ? `ไม่พบสินค้าที่ตรงทั้งชื่อและประเภท ${row.productName}` : undefined; return { ...row, error, partyId: party?.id, productCode: product?.code ?? '', productId: product?.id, status: error ? 'error' : 'ready', warning: Math.abs(row.lineAmount - row.quantity * row.unitPrice) > 0.05 ? 'ยอดรวมบรรทัดไม่เท่ากับ จำนวน × ราคา' : undefined } })
}

async function commit(context: Awaited<ReturnType<typeof getCurrentAuthContext>>, input: z.infer<typeof commitSchema>) {
  const allowed = getBranchCodeIntersection(context, input.branchCode); if (allowed && !allowed.includes(input.branchCode)) throw new AuthContextError('ไม่มีสิทธิ์นำเข้าบิลของสาขานี้', 403)
  const rows = await resolve(input.rows, input.branchCode, input.importType); const errors = rows.filter((row) => row.status === 'error'); if (errors.length) throw new Error(`ตรวจสอบไม่ผ่าน ${errors.length} แถว: ${errors.slice(0, 5).map((row) => row.error).join(', ')}`)
  const branch = await prisma.branches.findFirst({ select: { id: true }, where: { active: true, code: input.branchCode } }); if (!branch) throw new Error(`ไม่พบสาขา ${input.branchCode}`)
  const groups = [...new Set(rows.map((row) => row.docNo))].map((docNo) => rows.filter((row) => row.docNo === docNo)); const actor = currentActor(context); const createdAt = new Date()
  return prisma.$transaction(async (tx) => { for (const billRows of groups) { const first = billRows[0]; const subtotal = billRows.reduce((sum, row) => sum + row.lineAmount, 0); const vatAmount = billRows.reduce((sum, row) => sum + row.vatAmount, 0); const totalAmount = billRows.reduce((sum, row) => sum + row.totalAmount, 0); if (input.importType === 'purchase') { const bill = await tx.purchase_bills.create({ data: { branch_id: branch.id, created_by: actor, date: normalizeDate(first.date), doc_no: first.docNo, has_vat: vatAmount > 0, is_opening: true, note: 'Opening Balance Import', notes: 'Opening Balance Import', payable_balance: totalAmount, purchase_source: 'OPENING_IMPORT', status: PURCHASE_BILL_STATUS.UNPAID, subtotal, supplier_id: first.partyId, total_amount: totalAmount, transaction_mode: 'TRADING', updated_at: createdAt, updated_by: actor, vat_amount: vatAmount }, select: { id: true } }); await tx.purchase_bill_items.createMany({ data: billRows.map((row, index) => ({ amount: row.lineAmount, created_at: createdAt, display_name: row.productName, item_status: 'active', line_no: index + 1, price: row.unitPrice, product_code: row.productCode, product_id: row.productId, product_name: row.productName, purchase_bill_id: bill.id, qty: row.quantity, unit: 'kg' })) }) } else { const bill = await tx.sales_bills.create({ data: { branch_id: branch.id, created_at: createdAt, created_by: actor, customer_id: first.partyId, date: normalizeDate(first.date), doc_no: first.docNo, has_vat: vatAmount > 0, is_opening: true, items: billRows.map((row) => ({ amount: row.lineAmount, name: row.productName, price: row.unitPrice, qty: row.quantity, type: row.productType })), note: 'Opening Balance Import', notes: 'Opening Balance Import', receivable_balance: totalAmount, status: SALES_BILL_STATUS.UNRECEIVED, subtotal, total_amount: totalAmount, transaction_mode: 'TRADING', updated_at: createdAt, updated_by: actor, vat_amount: vatAmount }, select: { id: true } }); await tx.sales_bill_lines.createMany({ data: billRows.map((row, index) => ({ created_at: createdAt, created_by: actor, line_amount: row.lineAmount, line_no: index + 1, net_weight: row.quantity, product_code_snapshot: row.productCode, product_id: row.productId, product_name_snapshot: row.productName, qty: row.quantity, unit_price: row.unitPrice, updated_at: createdAt, updated_by: actor, vat_amount: row.vatAmount, sales_bill_id: bill.id })) }) } } await tx.app_audit_logs.create({ data: { action: `opening_balance_${input.importType}_bill_import`, actor_auth_user_id: context.authUser.id, actor_app_user_id: context.appUser?.id ?? null, actor_display_name: context.appUser?.displayName, actor_username: context.appUser?.username, entity_label: input.importType, event_key: `opening-balance-${input.importType}-bill-import:${randomUUID()}`, http_method: 'POST', metadata: { billCount: groups.length, inputRows: input.rows.length, branchCode: input.branchCode }, request_path: '/api/finance-accounting/opening-balance/bills', target_type: `${input.importType}_bill_opening_import` } }); return { billCount: groups.length, inputRows: input.rows.length } })
}

export async function POST(request: Request) { try { const context = await getCurrentAuthContext(); requirePermission(context, 'finance.opening_balance.manage'); const contentType = request.headers.get('content-type') ?? ''; if (contentType.includes('multipart/form-data')) { const form = await request.formData(); const branchCode = text(form.get('branchCode')); const importType = z.enum(['purchase', 'sales']).parse(text(form.get('importType'))); const file = form.get('file'); if (!(file instanceof File)) throw new Error('เลือกไฟล์ Excel ก่อนตรวจสอบ'); if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('รองรับเฉพาะไฟล์ .xlsx'); if (file.size > MAX_FILE_SIZE) throw new Error('ไฟล์ Excel ต้องไม่เกิน 10 MB'); const rows = parseWorkbook(await XLSX.read(Buffer.from(await file.arrayBuffer())), importType); const resolved = await resolve(rows, branchCode, importType); const ready = resolved.filter((row) => row.status === 'ready'); return NextResponse.json({ branchCode, importType, rows: resolved.map(({ partyId: _partyId, productId: _productId, ...row }) => row), summary: { billCount: new Set(rows.map((row) => row.docNo)).size, errorRows: resolved.length - ready.length, inputRows: resolved.length, readyRows: ready.length, totalValue: ready.reduce((sum, row) => sum + row.totalAmount, 0) } }) } const input = commitSchema.parse(await request.json()); return NextResponse.json(await commit(context, input), { status: 201 }) } catch (caught) { if (caught instanceof AuthContextError) return authContextErrorResponse(caught); return apiErrorResponse(caught, 'นำเข้าบิล Opening Balance ไม่สำเร็จ', 400) } }
