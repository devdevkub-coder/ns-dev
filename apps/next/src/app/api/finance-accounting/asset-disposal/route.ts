import { NextResponse, type NextRequest } from 'next/server'
import { parseInternalBigIntId } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const VIEW_PERMISSION = 'finance.financials.view'
const MANAGE_PERMISSION = 'finance.financials.manage'
const DISPOSAL_TYPES = ['Sale', 'Scrap', 'Write Off', 'Lost', 'Other']

type DecimalLike = { toNumber: () => number } | number | null | undefined
type DisposalNoClient = {
  asset_disposals: {
    count: (args: { where: { disposal_no: { startsWith: string } } }) => Promise<number>
  }
}

function bigIntId(value: unknown) {
  return parseInternalBigIntId(value == null ? null : String(value))
}

function nbv(asset: { depreciations: { amount: DecimalLike; status: string | null }[]; net_asset_cost: DecimalLike; original_cost: DecimalLike; salvage_value: DecimalLike; vat_amount: DecimalLike }) {
  const accumDep = asset.depreciations.filter((dep) => dep.status !== 'reversed').reduce((sum, dep) => sum + toNumber(dep.amount), 0)
  const netAssetCost = toNumber(asset.net_asset_cost) || (toNumber(asset.original_cost) - toNumber(asset.vat_amount))
  return Math.max(toNumber(asset.salvage_value), netAssetCost - accumDep)
}

function monthlyDep(asset: { depreciation_method: string | null; net_asset_cost: DecimalLike; salvage_value: DecimalLike; useful_life_months: number | null }) {
  const method = asset.depreciation_method || 'Straight Line'
  if (method === 'No Depreciation' || method === 'Manual') return 0
  const usefulLife = asset.useful_life_months || 0
  if (usefulLife <= 0) return 0
  return Math.max(0, (toNumber(asset.net_asset_cost) - toNumber(asset.salvage_value)) / usefulLife)
}

function disposalStatus(type: string) {
  if (type === 'Sale') return 'Sold'
  if (type === 'Lost') return 'Lost'
  return 'Disposed'
}

async function nextDisposalNo(tx: DisposalNoClient = prisma) {
  const now = new Date()
  const prefix = `ADP${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const count = await tx.asset_disposals.count({ where: { disposal_no: { startsWith: prefix } } })
  return `${prefix}-${String(count + 1).padStart(4, '0')}`
}

async function payload() {
  const [assets, disposals, customers] = await Promise.all([
    prisma.assets.findMany({
      include: { depreciations: true },
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
      take: 5000,
    }),
    prisma.asset_disposals.findMany({
      include: {
        assets: { select: { code: true, name: true } },
        customers: { select: { code: true, name: true } },
      },
      orderBy: [{ disposal_date: 'desc' }, { id: 'desc' }],
      take: 5000,
    }),
    prisma.customers.findMany({ orderBy: { code: 'asc' }, select: { code: true, id: true, name: true }, where: { active: true }, take: 5000 }),
  ])
  const assetOptions = assets
    .filter((asset) => !['Sold', 'Disposed', 'Lost', 'Inactive'].includes(asset.asset_status || ''))
    .map((asset) => ({
      assetStatus: asset.asset_status || 'Active',
      code: asset.code,
      id: String(asset.id),
      label: `${asset.code} - ${asset.name}`,
      name: asset.name,
      nbv: nbv(asset),
      purchaseDate: toDateOnly(asset.purchase_date),
    }))
  const rows = disposals.map((row) => ({
    assetCode: row.assets.code,
    assetName: row.assets.name,
    customerCode: row.customers?.code || '',
    customerName: row.customers?.name || '',
    date: toDateOnly(row.disposal_date),
    disposalNo: row.disposal_no,
    disposalType: row.disposal_type,
    gainLoss: toNumber(row.gain_loss),
    id: String(row.id),
    nbv: toNumber(row.book_value_at_disposal),
    notes: row.notes || '',
    reason: row.reason || '',
    receiptRefNo: row.receipt_ref_no || '',
    reversalReason: row.reversal_reason || '',
    reversedAt: row.reversed_at ? row.reversed_at.toISOString() : '',
    sellingPrice: toNumber(row.selling_price),
    status: row.status,
  }))
  return {
    assetOptions,
    customerOptions: customers.map((row) => ({ code: row.code, id: String(row.id), name: row.name })),
    designState: {
      glPosting: 'deferred_dev_scope_no_gl_journal',
      reversal: 'enabled_status_reversal',
      writeBehavior: 'enabled_asset_status_lifecycle',
    },
    disposalTypes: DISPOSAL_TYPES,
    rows,
    summary: {
      activeAssets: assetOptions.length,
      disposedRows: rows.filter((row) => row.status !== 'reversed').length,
      gainLoss: rows.filter((row) => row.status !== 'reversed').reduce((sum, row) => sum + row.gainLoss, 0),
      proceeds: rows.filter((row) => row.status !== 'reversed').reduce((sum, row) => sum + row.sellingPrice, 0),
      reversedRows: rows.filter((row) => row.status === 'reversed').length,
    },
  }
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, VIEW_PERMISSION)
    return NextResponse.json(await payload())
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดข้อมูลจำหน่ายทรัพย์สินไม่ได้', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, MANAGE_PERMISSION)
    const actor = currentActor(context)
    const body = await request.json()
    const assetId = bigIntId(body.assetId)
    if (!assetId) return NextResponse.json({ error: 'เลือกทรัพย์สิน' }, { status: 400 })
    const disposalType = DISPOSAL_TYPES.includes(String(body.disposalType || '')) ? String(body.disposalType) : 'Other'
    const disposalDate = normalizeDate(String(body.disposalDate || new Date().toISOString().slice(0, 10)))
    const sellingPrice = Math.max(0, Number(body.sellingPrice || 0))
    const customerId = bigIntId(body.customerId)
    const result = await prisma.$transaction(async (tx) => {
      const asset = await tx.assets.findUnique({ include: { depreciations: true }, where: { id: assetId } })
      if (!asset) throw new Error('ไม่พบทรัพย์สิน')
      if (['Sold', 'Disposed', 'Lost'].includes(asset.asset_status || '')) throw new Error('ทรัพย์สินนี้ถูกจำหน่ายแล้ว')
      
      const dDate = new Date(disposalDate)
      const dYear = dDate.getUTCFullYear()
      const dMonth = dDate.getUTCMonth() + 1
      const dDay = dDate.getUTCDate()
      
      const alreadyDeped = asset.depreciations.some(
        (dep) => dep.period_year === dYear && dep.period_month === dMonth && dep.status !== 'reversed'
      )
      
      let depAmount = 0
      const accumBefore = asset.depreciations.filter((dep) => dep.status !== 'reversed').reduce((sum, dep) => sum + toNumber(dep.amount), 0)
      const netAssetCost = toNumber(asset.net_asset_cost) || (toNumber(asset.original_cost) - toNumber(asset.vat_amount))
      const salvageValue = toNumber(asset.salvage_value)
      
      if (!alreadyDeped) {
        const totalDaysInMonth = new Date(Date.UTC(dYear, dMonth, 0)).getUTCDate()
        let startDay = 1
        if (asset.purchase_date) {
          const pDate = new Date(asset.purchase_date)
          if (pDate.getUTCFullYear() === dYear && pDate.getUTCMonth() + 1 === dMonth) {
            startDay = pDate.getUTCDate()
          }
        }
        const activeDays = Math.max(0, dDay - startDay + 1)
        const baseDep = (monthlyDep(asset) / totalDaysInMonth) * activeDays
        const nbvBefore = Math.max(salvageValue, netAssetCost - accumBefore)
        depAmount = Math.min(baseDep, Math.max(0, nbvBefore - salvageValue))
        
        if (depAmount > 0) {
          await tx.depreciations.create({
            data: {
              accumulated: accumBefore + depAmount,
              amount: depAmount,
              asset_id: assetId,
              date: dDate,
              nbv: netAssetCost - (accumBefore + depAmount),
              period_month: dMonth,
              period_year: dYear,
              posted_by: actor,
              status: 'posted',
            },
          })
        }
      }
      
      const currentAccum = accumBefore + depAmount
      const bookValue = Math.max(salvageValue, netAssetCost - currentAccum)
      
      const disposal = await tx.asset_disposals.create({
        data: {
          approved_at: new Date(),
          approved_by: actor,
          asset_id: assetId,
          book_value_at_disposal: bookValue,
          created_by: actor,
          customer_id: customerId,
          disposal_date: disposalDate,
          disposal_no: await nextDisposalNo(tx),
          disposal_type: disposalType,
          gain_loss: sellingPrice - bookValue,
          notes: String(body.notes || '').trim() || null,
          reason: String(body.reason || '').trim() || null,
          receipt_ref_no: String(body.receiptRefNo || '').trim() || null,
          selling_price: sellingPrice,
          status: 'approved',
        },
      })
      await tx.assets.update({ data: { asset_status: disposalStatus(disposalType) }, where: { id: assetId } })
      return disposal
    })
    return NextResponse.json({ id: String(result.id), ok: true, payload: await payload() })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกจำหน่ายทรัพย์สินไม่ได้', 400)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, MANAGE_PERMISSION)
    const body = await request.json()
    const id = bigIntId(body.id)
    if (body.action !== 'reverse' || !id) return NextResponse.json({ error: 'invalid action' }, { status: 400 })
    const reason = String(body.reason || '').trim()
    if (!reason) return NextResponse.json({ error: 'กรอกเหตุผลการ Reverse' }, { status: 400 })
    const actor = currentActor(context)
    await prisma.$transaction(async (tx) => {
      const row = await tx.asset_disposals.findUnique({ where: { id } })
      if (!row) throw new Error('ไม่พบรายการจำหน่าย')
      if (row.status === 'reversed') throw new Error('รายการนี้ Reverse แล้ว')
      await tx.asset_disposals.update({
        data: { reversal_reason: reason, reversed_at: new Date(), reversed_by: actor, status: 'reversed', updated_by: actor },
        where: { id },
      })
      await tx.assets.update({ data: { asset_status: 'Active' }, where: { id: row.asset_id } })
    })
    return NextResponse.json({ ok: true, payload: await payload() })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'Reverse จำหน่ายทรัพย์สินไม่ได้', 400)
  }
}
