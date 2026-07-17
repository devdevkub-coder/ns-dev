import { requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, masterDataListJson, normalizeCode, parseMasterDataForm, toIso } from '@/lib/server/master-data'
import { invalidateBranchReferenceCache, listBranchMasterRecords, type BranchMasterRecord } from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

type BranchWriteRow = {
  active: boolean | null
  address: string | null
  code: string
  created_at: Date | null
  id: bigint
  name: string
  phone: string | null
  updated_at: Date | null
}

function mapBranch(row: BranchMasterRecord | BranchWriteRow) {
  const cachedRecord = 'createdAt' in row
  const outwardId = requireBusinessCode(row.code, `สาขา ${row.id}`)
  return {
    id: outwardId,
    code: outwardId,
    name: row.name,
    active: row.active === true,
    type: null,
    phone: row.phone,
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
    branchId: outwardId,
    branchName: row.name,
    address: row.address,
    commissionPct: null,
    baseSalary: null,
    createdAt: cachedRecord ? row.createdAt : toIso(row.created_at),
    updatedAt: cachedRecord ? row.updatedAt : toIso(row.updated_at),
  }
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.view')

    const rows = await listBranchMasterRecords()
    return masterDataListJson(rows.map(mapBranch))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'โหลดข้อมูลสาขาไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const values = parseMasterDataForm(await request.json())
    const existing = values.id
      ? await prisma.branches.findFirst({
        select: { id: true },
        where: {
          OR: [
            { code: values.id.toUpperCase() },
            ...(values.id.match(/^\d+$/) ? [{ id: BigInt(values.id) }] : []),
          ],
        },
      })
      : null
    const code = normalizeCode(values.code, values.id || '')
    const row = await prisma.branches.upsert({
      where: existing ? { id: existing.id } : { code },
      create: { code, name: values.name, phone: values.phone || null, address: values.address || null, active: values.active },
      update: { code, name: values.name, phone: values.phone || null, address: values.address || null, active: values.active },
    })
    await invalidateBranchReferenceCache()
    return masterDataJson(mapBranch(row))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'บันทึกข้อมูลสาขาไม่ได้')
  }
}
