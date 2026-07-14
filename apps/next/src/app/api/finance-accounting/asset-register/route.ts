import { NextResponse, type NextRequest } from 'next/server'
import { Prisma } from '../../../../../generated/prisma/client'
import { parseInternalBigIntId } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { applyWorksheetTableLayout, XLSX } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

const VIEW_PERMISSION = 'finance.financials.view'
const MANAGE_PERMISSION = 'finance.financials.manage'
const CATEGORIES = ['Land', 'Building', 'Machinery', 'Vehicle', 'Equipment', 'Lease Asset', 'Other']
const STATUSES = ['Active', 'Inactive', 'Fully Depreciated', 'Sold', 'Disposed', 'Lost']
const ACQUISITION_TYPES = ['Purchased', 'Leased', 'Transferred', 'Opening', 'Other']
const DEPRECIATION_METHODS = ['Straight Line', 'No Depreciation', 'Manual']

type AssetRow = Prisma.assetsGetPayload<{
  include: {
    branches: { select: { code: true; id: true; name: true } }
    depreciations: true
    suppliers: { select: { code: true; id: true; name: true } }
  }
}>

function asText(value: unknown, fallback = '') {
  return String(value ?? fallback).trim()
}

function asMoney(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  const number = Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(number) ? number : fallback
}

function asInt(value: unknown, fallback = 0) {
  const number = Number(String(value ?? '').replace(/,/g, '').trim())
  return Number.isInteger(number) ? number : fallback
}

function nullableText(value: unknown) {
  const text = asText(value)
  return text || null
}

function idValue(value: unknown) {
  const parsed = parseInternalBigIntId(value == null ? null : String(value))
  return parsed
}

function monthlyDep(asset: Pick<AssetRow, 'depreciation_method' | 'net_asset_cost' | 'salvage_value' | 'useful_life_months'>) {
  const method = asset.depreciation_method || 'Straight Line'
  if (method === 'No Depreciation' || method === 'Manual') return 0
  const usefulLife = asset.useful_life_months || 0
  if (usefulLife <= 0) return 0
  return Math.max(0, (toNumber(asset.net_asset_cost) - toNumber(asset.salvage_value)) / usefulLife)
}

function activeDepreciations(asset: AssetRow) {
  return asset.depreciations.filter((dep) => dep.status !== 'reversed')
}

function mapAsset(asset: AssetRow) {
  const accumDep = activeDepreciations(asset).reduce((sum, dep) => sum + toNumber(dep.amount), 0)
  const netAssetCost = toNumber(asset.net_asset_cost) || (toNumber(asset.original_cost) - toNumber(asset.vat_amount))
  const nbv = Math.max(toNumber(asset.salvage_value), netAssetCost - accumDep)
  return {
    acquisitionType: asset.acquisition_type || 'Purchased',
    accumDep,
    assetStatus: asset.asset_status || 'Active',
    branchId: asset.branch_id ? String(asset.branch_id) : '',
    branchName: asset.branches?.name || '-',
    category: asset.category || 'Other',
    chassisNo: asset.chassis_no || '',
    code: asset.code,
    department: asset.department || '',
    depreciationMethod: asset.depreciation_method || 'Straight Line',
    engineNo: asset.engine_no || '',
    id: String(asset.id),
    insurancePolicyNo: asset.insurance_policy_no || '',
    licensePlate: asset.license_plate || '',
    location: asset.location || '',
    monthlyDep: monthlyDep(asset),
    name: asset.name,
    nbv,
    netAssetCost,
    notes: asset.notes || '',
    originalCost: toNumber(asset.original_cost),
    purchaseDate: toDateOnly(asset.purchase_date),
    responsiblePerson: asset.responsible_person || '',
    salvageValue: toNumber(asset.salvage_value),
    serialNo: asset.serial_no || '',
    supplierId: asset.supplier_id ? String(asset.supplier_id) : '',
    supplierName: asset.suppliers?.name || '',
    usefulLifeMonths: asset.useful_life_months || 0,
    vatAmount: toNumber(asset.vat_amount),
    warrantyExpireDate: toDateOnly(asset.warranty_expire_date),
  }
}

function assetInput(body: Record<string, unknown>) {
  const originalCost = asMoney(body.originalCost)
  const vatAmount = asMoney(body.vatAmount)
  const netAssetCost = asMoney(body.netAssetCost, Math.max(0, originalCost - vatAmount))
  const code = asText(body.code).toUpperCase()
  const name = asText(body.name)
  if (!code) throw new Error('รหัสทรัพย์สินจำเป็น')
  if (!name) throw new Error('ชื่อทรัพย์สินจำเป็น')
  if (originalCost <= 0) throw new Error('ราคาทุนต้องมากกว่า 0')
  if (vatAmount > originalCost) throw new Error('VAT ต้องไม่เกินราคาทุน')
  if (netAssetCost <= 0) throw new Error('Net Asset Cost ต้องมากกว่า 0')
  const salvageValue = asMoney(body.salvageValue)
  if (salvageValue > netAssetCost) throw new Error('มูลค่าซากต้องไม่เกิน Net Asset Cost')
  const method = DEPRECIATION_METHODS.includes(asText(body.depreciationMethod)) ? asText(body.depreciationMethod) : 'Straight Line'
  const usefulLifeMonths = asInt(body.usefulLifeMonths, 60)
  if (method === 'Straight Line' && usefulLifeMonths <= 0) throw new Error('อายุใช้งานต้องมากกว่า 0')
  const purchaseDate = normalizeDate(asText(body.purchaseDate) || new Date().toISOString().slice(0, 10))
  return {
    id: idValue(body.id),
    acquisition_type: ACQUISITION_TYPES.includes(asText(body.acquisitionType)) ? asText(body.acquisitionType) : 'Purchased',
    asset_status: STATUSES.includes(asText(body.assetStatus)) ? asText(body.assetStatus) : 'Active',
    branch_id: idValue(body.branchId),
    category: asText(body.category) || 'Other',
    chassis_no: nullableText(body.chassisNo),
    code,
    department: nullableText(body.department),
    depreciation_method: method,
    engine_no: nullableText(body.engineNo),
    insurance_policy_no: nullableText(body.insurancePolicyNo),
    license_plate: nullableText(body.licensePlate),
    location: nullableText(body.location),
    name,
    net_asset_cost: netAssetCost,
    notes: nullableText(body.notes),
    original_cost: originalCost,
    purchase_date: purchaseDate,
    responsible_person: nullableText(body.responsiblePerson),
    salvage_value: salvageValue,
    serial_no: nullableText(body.serialNo),
    supplier_id: idValue(body.supplierId),
    useful_life_months: usefulLifeMonths,
    vat_amount: vatAmount,
    warranty_expire_date: asText(body.warrantyExpireDate) ? normalizeDate(asText(body.warrantyExpireDate)) : null,
  }
}

async function payload(search = new URLSearchParams()) {
  const q = (search.get('q') || '').trim().toLowerCase()
  const category = search.get('category') || 'all'
  const status = search.get('status') || 'all'
  const [assets, branches, suppliers, dbCategories, dbDepartments] = await Promise.all([
    prisma.assets.findMany({
      include: {
        branches: { select: { code: true, id: true, name: true } },
        depreciations: true,
        suppliers: { select: { code: true, id: true, name: true } },
      },
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
      take: 5000,
    }),
    prisma.branches.findMany({ orderBy: { code: 'asc' }, select: { code: true, id: true, name: true }, where: { active: true } }),
    prisma.suppliers.findMany({ orderBy: { code: 'asc' }, select: { code: true, id: true, name: true }, where: { active: true }, take: 5000 }),
    prisma.asset_categories.findMany({ orderBy: { code: 'asc' }, select: { name: true }, where: { active: true } }),
    prisma.departments.findMany({ orderBy: { code: 'asc' }, select: { name: true }, where: { active: true } }),
  ])
  let rows = assets.map(mapAsset)
  if (q) rows = rows.filter((row) => [row.code, row.name, row.location, row.branchName].join(' ').toLowerCase().includes(q))
  if (category !== 'all') rows = rows.filter((row) => row.category === category)
  if (status !== 'all') rows = rows.filter((row) => row.assetStatus === status)
  const categories = Array.from(new Set(assets.map((asset) => asset.category || 'Other'))).sort()
  const statuses = Array.from(new Set(assets.map((asset) => asset.asset_status || 'Active'))).sort()
  const byCategory = categories.map((item) => {
    const categoryRows = rows.filter((row) => row.category === item)
    return {
      category: item,
      count: categoryRows.length,
      cost: categoryRows.reduce((sum, row) => sum + row.netAssetCost, 0),
      monthlyDep: categoryRows.reduce((sum, row) => sum + row.monthlyDep, 0),
      nbv: categoryRows.reduce((sum, row) => sum + row.nbv, 0),
    }
  })
  return {
    filters: { categories, statuses },
    options: {
      acquisitionTypes: ACQUISITION_TYPES,
      assetStatuses: STATUSES,
      branches: branches.map((row) => ({ code: row.code, id: String(row.id), name: row.name })),
      categories: dbCategories.length > 0 ? dbCategories.map((c) => c.name) : CATEGORIES,
      departments: dbDepartments.map((d) => d.name),
      depreciationMethods: DEPRECIATION_METHODS,
      suppliers: suppliers.map((row) => ({ code: row.code, id: String(row.id), name: row.name })),
    },
    rows,
    summary: {
      accumDep: rows.reduce((sum, row) => sum + row.accumDep, 0),
      count: rows.length,
      monthlyDep: rows.reduce((sum, row) => sum + row.monthlyDep, 0),
      nbv: rows.reduce((sum, row) => sum + row.nbv, 0),
      netAssetCost: rows.reduce((sum, row) => sum + row.netAssetCost, 0),
    },
    byCategory,
  }
}

function csv(rows: Record<string, unknown>[]) {
  const headers = rows[0] ? Object.keys(rows[0]) : ['code', 'name', 'category', 'purchaseDate', 'originalCost', 'vatAmount', 'netAssetCost', 'usefulLifeMonths']
  return [headers.join(','), ...rows.map((row) => headers.map((header) => JSON.stringify(row[header] ?? '')).join(','))].join('\n')
}

async function xlsx(rows: Record<string, unknown>[]) {
  const headers = rows[0] ? Object.keys(rows[0]) : ['code', 'name', 'category', 'purchaseDate', 'originalCost', 'vatAmount', 'netAssetCost', 'usefulLifeMonths']
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers })
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'ทะเบียนทรัพย์สิน')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, VIEW_PERMISSION)
    const search = request.nextUrl.searchParams
    if (search.get('template') === 'csv') {
      return new NextResponse(csv([{ code: 'FA-001', name: 'ตัวอย่างทรัพย์สิน', category: 'Machinery', purchaseDate: '2026-01-31', originalCost: 100000, vatAmount: 7000, netAssetCost: 93000, usefulLifeMonths: 60 }]), {
        headers: { 'content-disposition': 'attachment; filename="asset-register-template.csv"', 'content-type': 'text/csv; charset=utf-8' },
      })
    }
    const body = await payload(search)
    if (search.get('format') === 'xlsx') {
      const workbook = await xlsx(body.rows)
      const responseBody = new ArrayBuffer(workbook.byteLength)
      new Uint8Array(responseBody).set(workbook)
      return new NextResponse(responseBody, {
        headers: {
          'content-disposition': 'attachment; filename="asset-register.xlsx"',
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      })
    }
    return NextResponse.json(body)
  } catch (caught) {
    console.error('API GET Asset Register Error:', caught)
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดทะเบียนทรัพย์สินไม่ได้', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, MANAGE_PERMISSION)
    const actor = currentActor(context)
    const body = await request.json()
    if (body.action === 'previewImport') {
      const seen = new Set<string>()
      const rows = Array.isArray(body.rows) ? body.rows : []
      const existing = new Set((await prisma.assets.findMany({ select: { code: true } })).map((asset) => asset.code.toUpperCase()))
      return NextResponse.json({
        rows: rows.map((row: Record<string, unknown>, index: number) => {
          const errors: string[] = []
          let code = asText(row.code).toUpperCase()
          let name = asText(row.name)
          try {
            const parsed = assetInput(row)
            code = parsed.code
            name = parsed.name
          } catch (caught) {
            errors.push(caught instanceof Error ? caught.message : 'ข้อมูลไม่ถูกต้อง')
          }
          if (seen.has(code)) errors.push('รหัสซ้ำในไฟล์')
          if (existing.has(code)) errors.push('รหัสซ้ำกับระบบ')
          seen.add(code)
          return { code, errors, index: index + 1, mode: existing.has(code) ? 'duplicate' : 'create', name }
        }),
      })
    }
    const rows = body.action === 'commitImport' && Array.isArray(body.rows) ? body.rows : [body]
    const createdOrUpdated = await prisma.$transaction(async (tx) => {
      const result = []
      for (const row of rows) {
        const input = assetInput(row)
        const duplicate = await tx.assets.findFirst({ select: { id: true }, where: { code: input.code, ...(input.id ? { id: { not: input.id } } : {}) } })
        if (duplicate) throw new Error(`รหัสทรัพย์สินซ้ำ: ${input.code}`)
        const data = { ...input, id: undefined, created_by: actor }
        const asset = input.id
          ? await tx.assets.update({ data: { ...data, created_by: undefined }, where: { id: input.id } })
          : await tx.assets.create({ data })
        result.push(asset.id)
      }
      return result
    })
    return NextResponse.json({ ok: true, affected: createdOrUpdated.length, payload: await payload() })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกทะเบียนทรัพย์สินไม่ได้', 400)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, MANAGE_PERMISSION)
    const body = await request.json()
    const id = idValue(body.id)
    if (body.action !== 'deactivate' || !id) return NextResponse.json({ error: 'invalid action' }, { status: 400 })
    await prisma.assets.update({ data: { asset_status: 'Inactive', notes: nullableText(body.reason) ?? undefined }, where: { id } })
    return NextResponse.json({ ok: true, payload: await payload() })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ปิดใช้งานทรัพย์สินไม่ได้', 400)
  }
}
