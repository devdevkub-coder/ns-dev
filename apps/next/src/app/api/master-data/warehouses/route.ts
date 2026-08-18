import { requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, masterDataListJson, normalizeCode, parseMasterDataForm, toIso } from '@/lib/server/master-data'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { invalidateWarehouseReferenceCache, listWarehouseMasterRecords, type WarehouseMasterRecord } from '@/lib/server/reference-master-cache'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type WarehouseRow = Prisma.warehousesGetPayload<{ include: { branches: true } }>
const warehouseTypes = new Set(['RM', 'WIP', 'FG', 'SCRAP'])

function mapWarehouse(row: WarehouseMasterRecord | WarehouseRow) {
  const cachedRecord = 'branchCode' in row
  const outwardId = requireBusinessCode(row.code, `คลัง ${row.id}`)
  const branchCode = cachedRecord ? row.branchCode : row.branches?.code ?? null
  const branchName = cachedRecord ? row.branchName : row.branches?.name ?? null
  const createdAt = cachedRecord ? row.createdAt : toIso(row.created_at)
  const updatedAt = cachedRecord ? row.updatedAt : toIso(row.updated_at)
  return {
    id: outwardId,
    code: outwardId,
    name: row.name,
    active: row.active === true,
    type: row.type ?? null,
    inCharge: cachedRecord ? row.inCharge : row.in_charge ?? null,
    phone: cachedRecord ? row.phone : row.phone ?? null,
    supportedProcesses: cachedRecord ? row.supportedProcesses : row.supported_processes ?? [],
    targetSortKg: cachedRecord
      ? (row.targetSortKg == null ? null : Number(row.targetSortKg))
      : (row.target_sort_kg == null ? null : Number(row.target_sort_kg)),
    targetBaleCount: cachedRecord ? row.targetBaleCount : row.target_bale_count ?? null,
    maxCapacityKg: cachedRecord
      ? (row.maxCapacityKg == null ? null : Number(row.maxCapacityKg))
      : (row.max_capacity_kg == null ? null : Number(row.max_capacity_kg)),
    email: null,
    note: null,
    symbol: null,
    rateToThb: null,
    parentId: null,
    channelType: null,
    bankName: null,
    accountNo: null,
    currency: null,
    openingBalance: null,
    odLimit: null,
    ...(branchCode ? { branchId: branchCode, branchName } : { branchId: null, branchName: null }),
    address: null,
    commissionPct: null,
    baseSalary: null,
    createdAt,
    updatedAt,
  }
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.view')

    const url = new URL(request.url)
    const kind = url.searchParams.get('kind')
    const rows = await listWarehouseMasterRecords()
    const isWhCode = (code: string) => /^WH-\d+$/i.test(code)
    const filtered = kind === 'godown'
      ? rows.filter((row) => isWhCode(row.code))
      : kind === 'stock'
        ? rows.filter((row) => row.type != null) // คลังเดิม (มี type) ซึ่งตอนนี้คือ WH-01..04
        : rows
    return masterDataListJson(filtered.map(mapWarehouse))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'โหลดข้อมูลคลังไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const values = parseMasterDataForm(await request.json())
    if (values.branchId) {
      const branch = await findActiveBranchReferenceByCodeOrId(values.branchId)
      if (!branch) return errorJson(new Error('เลือกสาขา'), 'สาขาที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
    }
    if (values.type && !warehouseTypes.has(values.type)) return errorJson(new Error('เลือกประเภทคลัง'), 'เลือกประเภทคลัง')
    const branch = values.branchId ? await findActiveBranchReferenceByCodeOrId(values.branchId) : null
    const existing = values.id
      ? await prisma.warehouses.findFirst({
        select: { branches: { select: { code: true } }, id: true },
        where: {
          OR: [
            { code: values.id.toUpperCase() },
            ...(values.id.match(/^\d+$/) ? [{ id: BigInt(values.id) }] : []),
          ],
        },
      })
      : null
    const code = normalizeCode(values.code, values.id || '')
    const row = await prisma.warehouses.upsert({
      where: existing ? { id: existing.id } : { code },
      create: {
        active: values.active,
        branch_id: branch?.id ?? null,
        code,
        in_charge: values.inCharge,
        max_capacity_kg: values.maxCapacityKg,
        name: values.name,
        phone: values.phone,
        supported_processes: values.supportedProcesses,
        target_bale_count: values.targetBaleCount,
        target_sort_kg: values.targetSortKg,
        type: values.type,
      },
      update: {
        active: values.active,
        branch_id: branch?.id ?? null,
        code,
        in_charge: values.inCharge,
        max_capacity_kg: values.maxCapacityKg,
        name: values.name,
        phone: values.phone,
        supported_processes: values.supportedProcesses,
        target_bale_count: values.targetBaleCount,
        target_sort_kg: values.targetSortKg,
        type: values.type,
        updated_at: new Date(),
      },
      include: { branches: true },
    })
    await invalidateWarehouseReferenceCache([branch?.code ?? '', existing?.branches?.code ?? ''])
    return masterDataJson(mapWarehouse(row))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'บันทึกข้อมูลคลังไม่ได้')
  }
}
