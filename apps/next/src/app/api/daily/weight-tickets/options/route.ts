import { NextResponse } from 'next/server'
import { requireBusinessCode } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { branchScopeIds } from '@/lib/server/weight-tickets'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'daily.weight_tickets.view')

    const scopedBranchIds = branchScopeIds(context)
    const [branches, suppliers, customers, impurities] = await Promise.all([
      prisma.branches.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { code: true, id: true, name: true },
        where: {
          active: true,
          ...(scopedBranchIds.length ? { code: { in: scopedBranchIds } } : {}),
        },
      }),
      prisma.suppliers.findMany({
        orderBy: [{ name: 'asc' }, { code: 'asc' }],
        select: { code: true, id: true, name: true },
        where: { active: true },
      }),
      prisma.customers.findMany({
        orderBy: [{ name: 'asc' }, { code: 'asc' }],
        select: { code: true, id: true, name: true },
        where: { active: true },
      }),
      prisma.impurities.findMany({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: { active: true, id: true, name: true },
        where: { active: true },
      }),
    ])

    return NextResponse.json({
      branches: branches.map((branch) => {
        const code = requireBusinessCode(branch.code, `สาขา ${branch.id}`)
        return { code, id: code, name: branch.name }
      }),
      suppliers: suppliers.map((supplier) => {
        const code = requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`)
        return { code, id: code, name: supplier.name }
      }),
      customers: customers.map((customer) => {
        const code = requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`)
        return { code, id: code, name: customer.name }
      }),
      impurities: impurities.map((impurity) => ({
        id: impurity.id.toString(),
        label: impurity.name,
      })),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดข้อมูลอ้างอิงสำหรับใบรับ-ส่งของไม่ได้', 500)
  }
}
