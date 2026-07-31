import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { SALES_BILL_STATUS } from '@/lib/server/sales-bill-history'
import { XLSX, type WorkBook } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_ROWS = 5000
const rowSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), docNo: z.string().trim().min(1), partyName: z.string().trim().min(1), totalAmount: z.number().finite().nonnegative(), outstandingAmount: z.number().finite().nonnegative(), vatAmount: z.number().finite().nonnegative() })
const commitSchema = z.object({ action: z.literal('commit'), branchCode: z.string().trim().min(1).max(40), importType: z.enum(['receivable', 'payable']), rows: z.array(rowSchema).min(1).max(MAX_ROWS) })
type Row = z.infer<typeof rowSchema>
type ResolvedRow = Row & { error?: string; partyId?: bigint; status: 'error' | 'ready' }

function text(value: unknown) { return String(value ?? '').trim() }
function norm(value: unknown) { return text(value).replace(/\s+/g, ' ').toLowerCase() }
function number(value: unknown) { const parsed = typeof value === 'number' ? value : Number(text(value).replace(/,/g, '')); return Number.isFinite(parsed) ? parsed : NaN }
function date(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString().slice(0, 10)
  const raw = text(value); const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); if (!slash) return raw.slice(0, 10)
  const [, first, second, year] = slash; const normalizedYear = Number(year) > 2400 ? Number(year) - 543 : Number(year)
  return `${normalizedYear.toString().padStart(4, '0')}-${first.padStart(2, '0')}-${second.padStart(2, '0')}`
}
function column(headers: unknown[], labels: string[]) { return headers.findIndex((header) => labels.some((label) => norm(header) === norm(label))) }

function parseWorkbook(workbook: WorkBook, importType: 'receivable' | 'payable') {
  const partyLabels = importType === 'receivable' ? ['ลูกค้า', 'ผู้ซื้อ', 'Customer'] : ['ผู้ขาย', 'Supplier']
  const outstandingLabels = importType === 'receivable' ? ['ยอดค้างรับยกไป', 'ยอดค้างรับ', 'ลูกหนี้คงเหลือ'] : ['ค้างจ่าย', 'ยอดค้างจ่าย', 'เจ้าหนี้คงเหลือ']
  const sheet = workbook.SheetNames.map((name) => workbook.Sheets[name]).find((candidate) => { const h = candidate.rows[0] ?? []; return column(h, ['เลขที่', 'เลขที่เอกสาร', 'เลขที่บิล']) >= 0 && column(h, ['วันที่', 'วันที่ออก']) >= 0 && column(h, partyLabels) >= 0 && column(h, ['รวมทั้งสิ้น', 'ยอดรวม']) >= 0 && column(h, outstandingLabels) >= 0 })
  if (!sheet) throw new Error(`ไม่พบชีต${importType === 'receivable' ? 'ลูกหนี้' : 'เจ้าหนี้'} ที่มีหัวตารางครบถ้วน`)
  const h = sheet.rows[0] ?? []
  const i = { docNo: column(h, ['เลขที่', 'เลขที่เอกสาร', 'เลขที่บิล']), date: column(h, ['วันที่', 'วันที่ออก']), party: column(h, partyLabels), total: column(h, ['รวมทั้งสิ้น', 'ยอดรวม']), outstanding: column(h, outstandingLabels), vat: column(h, ['ภาษีมูลค่าเพิ่ม', 'ภาษีมูลค่าพิ่ม', 'ภาษี']) }
  return sheet.rows.slice(1).filter((row) => row.some((value) => text(value) !== '')).slice(0, MAX_ROWS).map((row) => rowSchema.parse({ date: date(row[i.date]), docNo: text(row[i.docNo]), partyName: text(row[i.party]), totalAmount: number(row[i.total]), outstandingAmount: number(row[i.outstanding]), vatAmount: i.vat >= 0 ? number(row[i.vat]) : 0 }))
}

async function resolve(rows: Row[], branchCode: string, importType: 'receivable' | 'payable'): Promise<ResolvedRow[]> {
  const [parties, branch] = await Promise.all([importType === 'receivable' ? prisma.customers.findMany({ select: { id: true, name: true }, where: { active: true } }) : prisma.suppliers.findMany({ select: { id: true, name: true }, where: { active: true } }), prisma.branches.findFirst({ select: { id: true }, where: { active: true, code: branchCode } })])
  const partiesByName = new Map(parties.map((party) => [norm(party.name), party])); const docNos = [...new Set(rows.map((row) => row.docNo))]
  const existing = new Set((importType === 'receivable' ? await prisma.sales_bills.findMany({ select: { doc_no: true }, where: { doc_no: { in: docNos } } }) : await prisma.purchase_bills.findMany({ select: { doc_no: true }, where: { doc_no: { in: docNos } } })).map((row) => row.doc_no))
  return rows.map((row) => { const party = partiesByName.get(norm(row.partyName)); const error = !branch ? `ไม่พบสาขา ${branchCode}` : existing.has(row.docNo) ? `เลขที่เอกสาร ${row.docNo} มีอยู่แล้ว` : !party ? `ไม่พบ${importType === 'receivable' ? 'ลูกค้า' : 'ผู้ขาย'} ${row.partyName}` : row.outstandingAmount > row.totalAmount + 0.01 ? 'ยอดค้างมากกว่ายอดรวม' : undefined; return { ...row, error, partyId: party?.id, status: error ? 'error' : 'ready' } })
}

async function commit(context: Awaited<ReturnType<typeof getCurrentAuthContext>>, input: z.infer<typeof commitSchema>) {
  const allowed = getBranchCodeIntersection(context, input.branchCode); if (allowed && !allowed.includes(input.branchCode)) throw new AuthContextError('ไม่มีสิทธิ์นำเข้ายอดของสาขานี้', 403)
  const rows = await resolve(input.rows, input.branchCode, input.importType); const errors = rows.filter((row) => row.status === 'error'); if (errors.length) throw new Error(`ตรวจสอบไม่ผ่าน ${errors.length} แถว: ${errors.slice(0, 5).map((row) => row.error).join(', ')}`)
  const branch = await prisma.branches.findFirst({ select: { id: true }, where: { active: true, code: input.branchCode } }); if (!branch) throw new Error(`ไม่พบสาขา ${input.branchCode}`)
  const actor = currentActor(context); const createdAt = new Date()
  return prisma.$transaction(async (tx) => { for (const row of rows) { const paid = Math.max(0, row.totalAmount - row.outstandingAmount); const salesBillStatus = row.outstandingAmount <= 0.01 ? SALES_BILL_STATUS.RECEIVED : paid > 0.01 ? SALES_BILL_STATUS.PARTIAL : SALES_BILL_STATUS.UNRECEIVED; const purchaseBillStatus = row.outstandingAmount <= 0.01 ? 'paid' : paid > 0.01 ? 'partial' : 'unpaid'; if (input.importType === 'receivable') await tx.sales_bills.create({ data: { branch_id: branch.id, created_at: createdAt, created_by: actor, customer_id: row.partyId, date: normalizeDate(row.date), doc_no: row.docNo, has_vat: row.vatAmount > 0, is_opening: true, items: [], note: 'Opening Balance AR Import', notes: 'Opening Balance AR Import', paid_amount: paid, receivable_balance: row.outstandingAmount, status: salesBillStatus, total_amount: row.totalAmount, updated_at: createdAt, updated_by: actor, vat_amount: row.vatAmount }, select: { id: true } }); else await tx.purchase_bills.create({ data: { branch_id: branch.id, created_at: createdAt, created_by: actor, date: normalizeDate(row.date), doc_no: row.docNo, has_vat: row.vatAmount > 0, is_opening: true, note: 'Opening Balance AP Import', notes: 'Opening Balance AP Import', paid_amount: paid, payable_balance: row.outstandingAmount, purchase_source: 'OPENING_BALANCE', status: purchaseBillStatus, subtotal: row.totalAmount - row.vatAmount, supplier_id: row.partyId, total_amount: row.totalAmount, transaction_mode: 'TRADING', updated_at: createdAt, updated_by: actor, vat_amount: row.vatAmount }, select: { id: true } }) } await tx.app_audit_logs.create({ data: { action: `opening_balance_${input.importType}_balance_import`, actor_auth_user_id: context.authUser.id, actor_app_user_id: context.appUser?.id ?? null, actor_display_name: context.appUser?.displayName, actor_username: context.appUser?.username, entity_label: input.importType, event_key: `opening-balance-${input.importType}-balance-import:${randomUUID()}`, http_method: 'POST', metadata: { inputRows: input.rows.length, branchCode: input.branchCode }, request_path: '/api/finance-accounting/opening-balance/balances', target_type: `${input.importType}_opening_balance_import` } }); return { inputRows: input.rows.length } })
}

export async function POST(request: Request) { try { const context = await getCurrentAuthContext(); requirePermission(context, 'finance.opening_balance.manage'); const contentType = request.headers.get('content-type') ?? ''; if (contentType.includes('multipart/form-data')) { const form = await request.formData(); const branchCode = text(form.get('branchCode')); const importType = z.enum(['receivable', 'payable']).parse(text(form.get('importType'))); const file = form.get('file'); if (!(file instanceof File)) throw new Error('เลือกไฟล์ Excel ก่อนตรวจสอบ'); if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('รองรับเฉพาะไฟล์ .xlsx'); if (file.size > MAX_FILE_SIZE) throw new Error('ไฟล์ Excel ต้องไม่เกิน 10 MB'); const rows = parseWorkbook(await XLSX.read(Buffer.from(await file.arrayBuffer())), importType); const resolved = await resolve(rows, branchCode, importType); const ready = resolved.filter((row) => row.status === 'ready'); return NextResponse.json({ branchCode, importType, rows: resolved, summary: { errorRows: resolved.length - ready.length, inputRows: resolved.length, readyRows: ready.length, totalValue: ready.reduce((sum, row) => sum + row.outstandingAmount, 0) } }) } const input = commitSchema.parse(await request.json()); return NextResponse.json(await commit(context, input), { status: 201 }) } catch (caught) { if (caught instanceof AuthContextError) return authContextErrorResponse(caught); return apiErrorResponse(caught, 'นำเข้ายอดลูกหนี้/เจ้าหนี้ Opening Balance ไม่สำเร็จ', 400) } }
