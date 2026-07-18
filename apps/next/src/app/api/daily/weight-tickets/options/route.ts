import { NextResponse } from 'next/server'
import { requireBusinessCode } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { branchScopeIds } from '@/lib/server/weight-tickets'
import {
  listActiveBranches,
  listActiveBranchesByCodes,
  listActiveCustomerBranchOptionsByBranchCodes,
  listActiveImpurities,
  listActiveSupplierBranchOptionsByBranchCodes,
} from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'daily.weight_tickets.view')

    const scopedBranchIds = branchScopeIds(context)
    const branches = scopedBranchIds.length ? await listActiveBranchesByCodes(scopedBranchIds) : await listActiveBranches()
    const branchCodes = branches.map((branch) => branch.code)
    const [suppliers, customers, impurities] = await Promise.all([
      listActiveSupplierBranchOptionsByBranchCodes(branchCodes),
      listActiveCustomerBranchOptionsByBranchCodes(branchCodes),
      listActiveImpurities(),
    ])

    return NextResponse.json({
      branches: branches.map((branch) => {
        const code = requireBusinessCode(branch.code, `สาขา ${branch.id.toString()}`)
        return { code, id: code, name: branch.name }
      }),
      suppliers: suppliers.map((supplier) => ({
        branchIds: supplier.branchIds,
        code: requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`),
        id: requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`),
        name: supplier.name,
      })),
      customers: customers.map((customer) => ({
        branchIds: customer.branchIds,
        code: requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`),
        id: requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`),
        name: customer.name,
      })),
      impurities: impurities.map((impurity) => ({
        id: impurity.id.toString(),
        label: impurity.name,
      })),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดข้อมูลอ้างอิงสำหรับใบรับ-ส่งของไม่ได้', 500)
  }
}
