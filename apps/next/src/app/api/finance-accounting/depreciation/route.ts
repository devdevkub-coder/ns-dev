import { NextResponse, type NextRequest } from 'next/server'
import type { Prisma } from '../../../../../generated/prisma/client'
import { parseInternalBigIntId } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const VIEW_PERMISSION = 'finance.financials.view'
const MANAGE_PERMISSION = 'finance.financials.manage'

function bigIntId(value: unknown) {
  return parseInternalBigIntId(value == null ? null : String(value))
}

type DepAsset = Prisma.assetsGetPayload<{ include: { depreciations: true } }>

function periodDate(periodYear: number, periodMonth: number) {
  return new Date(Date.UTC(periodYear, periodMonth, 0))
}

function periodKey(periodYear: number, periodMonth: number) {
  return `${periodYear}-${String(periodMonth).padStart(2, '0')}`
}

function parsePeriod(search: URLSearchParams, body?: Record<string, unknown>) {
  const now = new Date()
  const periodYear = Number(body?.periodYear ?? search.get('periodYear') ?? search.get('year') ?? now.getFullYear())
  const periodMonth = Number(body?.periodMonth ?? search.get('periodMonth') ?? search.get('month') ?? now.getMonth() + 1)
  if (!Number.isInteger(periodYear) || periodYear < 2000 || periodYear > 2100) throw new Error('ปีงวดไม่ถูกต้อง')
  if (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) throw new Error('เดือนงวดไม่ถูกต้อง')
  return { periodMonth, periodYear }
}

function monthlyDep(asset: Pick<DepAsset, 'depreciation_method' | 'net_asset_cost' | 'salvage_value' | 'useful_life_months'>) {
  if (asset.depreciation_method === 'No Depreciation' || asset.depreciation_method === 'Manual') return 0
  const usefulLife = asset.useful_life_months || 0
  if (usefulLife <= 0) return 0
  return Math.max(0, (toNumber(asset.net_asset_cost) - toNumber(asset.salvage_value)) / usefulLife)
}

function activeDeps(asset: DepAsset) {
  return asset.depreciations.filter((dep) => dep.status !== 'reversed')
}

function assetRunRow(asset: DepAsset, periodYear: number, periodMonth: number) {
  const accumBefore = activeDeps(asset).reduce((sum, dep) => sum + toNumber(dep.amount), 0)
  const netAssetCost = toNumber(asset.net_asset_cost)
  const salvageValue = toNumber(asset.salvage_value)
  const nbvBefore = Math.max(salvageValue, netAssetCost - accumBefore)
  
  let baseDep = monthlyDep(asset)
  
  if (asset.purchase_date) {
    const pDate = new Date(asset.purchase_date)
    const purchaseYear = pDate.getUTCFullYear()
    const purchaseMonth = pDate.getUTCMonth() + 1
    
    if (purchaseYear === periodYear && purchaseMonth === periodMonth) {
      // เดือนแรกที่ซื้อ -> คำนวณเศษจำนวนวันแบบ Pro-rata
      const purchaseDay = pDate.getUTCDate()
      const totalDaysInMonth = new Date(Date.UTC(periodYear, periodMonth, 0)).getUTCDate()
      const activeDays = Math.max(0, totalDaysInMonth - purchaseDay + 1)
      baseDep = (baseDep / totalDaysInMonth) * activeDays
    } else if (purchaseYear > periodYear || (purchaseYear === periodYear && purchaseMonth > periodMonth)) {
      // ซื้อในอนาคตเทียบกับงวดที่เลือก -> ไม่มีค่าเสื่อมงวดนี้
      baseDep = 0
    }
  }

  const depreciationAmount = Math.min(baseDep, Math.max(0, nbvBefore - salvageValue))
  const accumAfter = accumBefore + depreciationAmount
  const nbvAfter = Math.max(salvageValue, netAssetCost - accumAfter)
  return {
    accumAfter,
    accumBefore,
    assetCode: asset.code,
    assetId: String(asset.id),
    assetName: asset.name,
    depreciationAmount,
    monthlyDep: monthlyDep(asset),
    nbvAfter,
    nbvBefore,
    netAssetCost,
    salvageValue,
    willFullyDepreciate: nbvAfter <= salvageValue,
  }
}

async function previewRun(periodYear: number, periodMonth: number) {
  const assets = await prisma.assets.findMany({
    include: { depreciations: true },
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
    where: {
      asset_status: { notIn: ['Inactive', 'Sold', 'Disposed', 'Lost', 'Fully Depreciated'] },
      depreciation_method: { notIn: ['No Depreciation', 'Manual'] },
      purchase_date: { lte: periodDate(periodYear, periodMonth) },
    },
    take: 5000,
  })
  const alreadyRun = new Set(
    (
      await prisma.depreciations.findMany({
        select: { asset_id: true },
        where: { period_month: periodMonth, period_year: periodYear, status: { not: 'reversed' } },
      })
    ).map((dep) => String(dep.asset_id || '')),
  )
  const rows = assets
    .filter((asset) => !alreadyRun.has(String(asset.id)))
    .map((asset) => assetRunRow(asset, periodYear, periodMonth))
    .filter((row) => row.depreciationAmount > 0)
  return {
    periodDate: toDateOnly(periodDate(periodYear, periodMonth)),
    periodKey: periodKey(periodYear, periodMonth),
    rows,
    summary: {
      count: rows.length,
      totalDepreciation: rows.reduce((sum, row) => sum + row.depreciationAmount, 0),
      willFullyDepreciate: rows.filter((row) => row.willFullyDepreciate).length,
    },
  }
}

async function payload(search = new URLSearchParams()) {
  const { periodMonth, periodYear } = parsePeriod(search)
  const [preview, deps] = await Promise.all([
    previewRun(periodYear, periodMonth),
    prisma.depreciations.findMany({
      include: { assets: { select: { code: true, name: true } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 5000,
    }),
  ])
  const rows = deps.map((dep, index) => {
    const date = toDateOnly(dep.date)
    const rowPeriod = dep.period_year && dep.period_month ? periodKey(dep.period_year, dep.period_month) : date.slice(0, 7)
    return {
      accumAfter: toNumber(dep.accumulated),
      accumBefore: toNumber(dep.accumulated) - toNumber(dep.amount),
      assetCode: dep.assets?.code || '-',
      assetName: dep.assets?.name || '-',
      date,
      depreciationAmount: toNumber(dep.amount),
      id: String(dep.id),
      nbvAfter: toNumber(dep.nbv),
      nbvBefore: toNumber(dep.nbv) + toNumber(dep.amount),
      period: rowPeriod,
      periodMonth: dep.period_month,
      periodYear: dep.period_year,
      refNo: `DEP-${rowPeriod.replace('-', '')}-${String(index + 1).padStart(4, '0')}`,
      reversalReason: dep.reversal_reason || '',
      reversedAt: dep.reversed_at ? dep.reversed_at.toISOString() : '',
      status: dep.status || 'posted',
    }
  })
  const periodRuns = rows.filter((row) => row.periodMonth === periodMonth && row.periodYear === periodYear && row.status !== 'reversed')
  return {
    designState: {
      glPosting: 'deferred_dev_scope_no_gl_journal',
      reverseWrite: 'enabled_status_reversal',
      runWrite: 'enabled_preview_then_commit',
    },
    pendingAssets: preview.rows.map((row) => ({
      accumDep: row.accumBefore,
      assetStatus: 'Active',
      code: row.assetCode,
      id: row.assetId,
      monthlyDep: row.monthlyDep,
      name: row.assetName,
      nbv: row.nbvBefore,
      netAssetCost: row.netAssetCost,
    })),
    period: { date: preview.periodDate, key: preview.periodKey, month: periodMonth, postedRuns: periodRuns.length, pendingAssets: preview.rows.length, year: periodYear },
    rows,
    summary: {
      pendingAssets: preview.rows.length,
      postedRuns: rows.filter((row) => row.status !== 'reversed').length,
      reversedRuns: rows.filter((row) => row.status === 'reversed').length,
      totalDepreciation: rows.filter((row) => row.status !== 'reversed').reduce((sum, row) => sum + row.depreciationAmount, 0),
    },
  }
}

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, VIEW_PERMISSION)
    return NextResponse.json(await payload(request.nextUrl.searchParams))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดค่าเสื่อมราคาไม่ได้', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, MANAGE_PERMISSION)
    const body = await request.json()
    const { periodMonth, periodYear } = parsePeriod(new URLSearchParams(), body)
    const preview = await previewRun(periodYear, periodMonth)
    if (body.action === 'preview') return NextResponse.json(preview)
    if (body.action !== 'commit') return NextResponse.json({ error: 'invalid action' }, { status: 400 })
    const actor = currentActor(context)
    const date = periodDate(periodYear, periodMonth)
    const created = await prisma.$transaction(async (tx) => {
      const rows = []
      for (const row of preview.rows) {
        const assetId = parseInternalBigIntId(row.assetId)
        if (!assetId) continue
        const dep = await tx.depreciations.create({
          data: {
            accumulated: row.accumAfter,
            amount: row.depreciationAmount,
            asset_id: assetId,
            date,
            nbv: row.nbvAfter,
            period_month: periodMonth,
            period_year: periodYear,
            posted_by: actor,
            status: 'posted',
          },
        })
        if (row.willFullyDepreciate) await tx.assets.update({ data: { asset_status: 'Fully Depreciated' }, where: { id: assetId } })
        rows.push(dep)
      }
      return rows
    })
    return NextResponse.json({ created: created.length, payload: await payload(new URLSearchParams({ month: String(periodMonth), year: String(periodYear) })) })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'Run ค่าเสื่อมราคาไม่ได้', 400)
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
    const dep = await prisma.depreciations.findUnique({ select: { period_month: true, period_year: true }, where: { id } })
    if (!dep) return NextResponse.json({ error: 'ไม่พบรายการค่าเสื่อม' }, { status: 404 })
    await prisma.depreciations.update({ data: { reversed_at: new Date(), reversed_by: actor, reversal_reason: reason, status: 'reversed', updated_by: actor }, where: { id } })
    const params = dep.period_month && dep.period_year ? new URLSearchParams({ month: String(dep.period_month), year: String(dep.period_year) }) : new URLSearchParams()
    return NextResponse.json({ ok: true, payload: await payload(params) })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'Reverse ค่าเสื่อมราคาไม่ได้', 400)
  }
}
