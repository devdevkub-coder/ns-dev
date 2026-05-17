import { prisma } from '@/lib/server/prisma'
import { errorJson, masterDataJson, masterDataListJson, normalizeCode, parseMasterDataForm, toIso, toNumber } from '@/lib/server/master-data'

export const runtime = 'nodejs'

function mapProduct(row: Awaited<ReturnType<typeof prisma.products.findMany>>[number]) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active ?? true,
    type: row.type,
    unit: row.unit,
    metalGroup: row.metal_group,
    itemStatus: row.item_status,
    grade: row.grade,
    stdPrice: toNumber(row.std_price),
    stdCost: toNumber(row.std_cost),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

export async function GET() {
  try {
    const rows = await prisma.products.findMany({ orderBy: [{ code: 'asc' }, { name: 'asc' }] })
    return masterDataListJson(rows.map(mapProduct))
  } catch (caught) {
    return errorJson(caught, 'โหลดข้อมูลสินค้าไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const values = parseMasterDataForm(await request.json())
    const code = normalizeCode(values.code, values.id || '')
    const row = await prisma.products.upsert({
      where: { id: values.id || code },
      create: {
        id: values.id || code,
        code,
        name: values.name,
        type: values.type || null,
        unit: values.unit || 'kg',
        metal_group: values.metalGroup || null,
        item_status: values.itemStatus || 'RM',
        grade: values.grade || null,
        std_price: values.stdPrice,
        std_cost: values.stdCost,
        active: values.active,
      },
      update: {
        code,
        name: values.name,
        type: values.type || null,
        unit: values.unit || 'kg',
        metal_group: values.metalGroup || null,
        item_status: values.itemStatus || 'RM',
        grade: values.grade || null,
        std_price: values.stdPrice,
        std_cost: values.stdCost,
        active: values.active,
      },
    })
    return masterDataJson(mapProduct(row))
  } catch (caught) {
    return errorJson(caught, 'บันทึกข้อมูลสินค้าไม่ได้')
  }
}
