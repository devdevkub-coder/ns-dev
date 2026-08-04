import { SUPPLIER_PAGE_PERMISSIONS } from '@/lib/supplier-page-permissions'
import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson } from '@/lib/server/master-data'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, SUPPLIER_PAGE_PERMISSIONS.view)

    const [salespersons, branches, bankNames, paymentMethods] = await Promise.all([
      prisma.salespersons.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { active: true, code: true, id: true, name: true },
      }),
      prisma.branches.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { active: true, code: true, id: true, name: true },
      }),
      prisma.bank_names.findMany({
        orderBy: [{ name: 'asc' }],
        select: { active: true, code: true, name: true, symbol: true },
      }),
      prisma.payment_methods.findMany({
        orderBy: [{ code: 'asc' }],
        select: { active: true, code: true, name: true, type: true },
      }),
    ])

    return Response.json({
      salespersons: salespersons.map((row) => ({
        active: row.active === true,
        code: row.code,
        id: row.code,
        name: row.name,
      })),
      branches: branches.map((row) => ({
        active: row.active === true,
        code: row.code,
        id: row.code,
        name: row.name,
      })),
      bankNames: bankNames.map((row) => ({
        active: row.active === true,
        code: row.code,
        id: row.code,
        name: row.name,
        symbol: row.symbol,
      })),
      paymentMethods: paymentMethods.map((row) => ({
        active: row.active === true,
        code: row.code,
        id: row.code,
        name: row.name,
        type: row.type,
        typeLabel: row.type === 'cash' ? 'เงินสด' : 'ธนาคาร',
      })),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'โหลดข้อมูลอ้างอิงหน้าผู้ขายไม่ได้', 500)
  }
}
