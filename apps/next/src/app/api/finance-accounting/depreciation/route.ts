import { randomUUID } from 'node:crypto'
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
  const monthVal = body?.periodMonth ?? search.get('periodMonth') ?? search.get('month') ?? now.getMonth() + 1
  const periodYear = Number(body?.periodYear ?? search.get('periodYear') ?? search.get('year') ?? now.getFullYear())
  if (!Number.isInteger(periodYear) || periodYear < 2000 || periodYear > 2100) throw new Error('ปีงวดไม่ถูกต้อง')
  if (monthVal === 'all' || monthVal === 'All' || monthVal === '') {
    return { periodMonth: 'all' as const, periodYear }
  }
  const periodMonth = Number(monthVal)
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
    .map((asset) => {
      const run = assetRunRow(asset, periodYear, periodMonth)
      return {
        ...run,
        category: asset.category || 'Other',
        department: asset.department || '',
      }
    })
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
  const isAllMonths = periodMonth === 'all'
  const [preview, deps] = await Promise.all([
    isAllMonths ? { rows: [], periodDate: '', periodKey: `${periodYear}` } : previewRun(periodYear, periodMonth),
    prisma.depreciations.findMany({
      include: { assets: { select: { code: true, name: true, category: true, department: true } } },
      where: {
        period_year: periodYear,
        ...(isAllMonths ? {} : { period_month: periodMonth }),
      },
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
      category: dep.assets?.category || 'Other',
      department: dep.assets?.department || '',
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
  const periodRuns = isAllMonths
    ? rows.filter((row) => row.status !== 'reversed')
    : rows.filter((row) => row.periodMonth === periodMonth && row.status !== 'reversed')
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
      category: row.category,
      department: row.department,
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
    if (periodMonth === 'all') {
      return NextResponse.json({ error: 'ไม่สามารถประมวลผลรายปีได้' }, { status: 400 })
    }
    const preview = await previewRun(periodYear, periodMonth)
    if (body.action === 'preview') return NextResponse.json(preview)
    if (body.action !== 'commit') return NextResponse.json({ error: 'invalid action' }, { status: 400 })
    const actor = currentActor(context)
    const date = periodDate(periodYear, periodMonth)
    const created = await prisma.$transaction(async (tx) => {
      const rows = []
      for (const row of preview.rows) {
        const assetId = parseInternalBigIntId(row.assetId)
        if (!assetId) throw new Error(`ไม่พบรหัสทรัพย์สินที่ถูกต้องใน preview ค่าเสื่อม: ${row.assetId}`)
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
        if (row.willFullyDepreciate) {
          await tx.assets.update({ data: { asset_status: 'Fully Depreciated' }, where: { id: assetId } })
          await tx.app_audit_logs.create({ data: { action: 'asset_status_changed', actor_auth_user_id: context.authUser.id, actor_app_user_id: context.appUser?.id ?? null, actor_display_name: context.appUser?.displayName, actor_username: context.appUser?.username, entity_id: assetId.toString(), entity_label: row.assetId, event_key: `asset-status-fully-depreciated:${randomUUID()}`, metadata: { assetId: assetId.toString(), status: 'Fully Depreciated' }, target_type: 'asset' } })
        }
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

    const dep = await prisma.depreciations.findUnique({
      where: { id },
      include: { assets: { select: { asset_status: true } } }
    })
    if (!dep) return NextResponse.json({ error: 'ไม่พบรายการค่าเสื่อม' }, { status: 404 })
    if (dep.status === 'reversed') return NextResponse.json({ error: 'รายการนี้ถูกกลับรายการไปแล้ว' }, { status: 400 })

    // ตรวจสอบการกลับรายการตามลำดับเวลา (Sequence Lock)
    if (dep.period_year && dep.period_month && dep.asset_id) {
      const newerDep = await prisma.depreciations.findFirst({
        where: {
          asset_id: dep.asset_id,
          status: 'posted',
          OR: [
            { period_year: { gt: dep.period_year } },
            {
              period_year: dep.period_year,
              period_month: { gt: dep.period_month }
            }
          ]
        }
      })
      if (newerDep) {
        return NextResponse.json({
          error: 'ไม่สามารถยกเลิกได้ เนื่องจากมีรายการคำนวณในงวดถัดไปแล้ว กรุณายกเลิกงวดล่าสุดก่อน'
        }, { status: 400 })
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.depreciations.update({
        data: {
          reversed_at: new Date(),
          reversed_by: actor,
          reversal_reason: reason,
          status: 'reversed',
          updated_by: actor
        },
        where: { id }
      })

      // หากสินทรัพย์มีสถานะเป็น Fully Depreciated ให้เปลี่ยนกลับมาเป็น Active
      if (dep.assets && dep.assets.asset_status === 'Fully Depreciated' && dep.asset_id) {
        await tx.assets.update({
          where: { id: dep.asset_id },
          data: { asset_status: 'Active' }
        })
        await tx.app_audit_logs.create({ data: { action: 'asset_status_changed', actor_auth_user_id: context.authUser.id, actor_app_user_id: context.appUser?.id ?? null, actor_display_name: context.appUser?.displayName, actor_username: context.appUser?.username, entity_id: dep.asset_id.toString(), event_key: `asset-status-active:${randomUUID()}`, metadata: { assetId: dep.asset_id.toString(), status: 'Active', reason }, target_type: 'asset' } })
      }
    })

    const params = dep.period_month && dep.period_year ? new URLSearchParams({ month: String(dep.period_month), year: String(dep.period_year) }) : new URLSearchParams()
    return NextResponse.json({ ok: true, payload: await payload(params) })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'Reverse ค่าเสื่อมราคาไม่ได้', 400)
  }
}
