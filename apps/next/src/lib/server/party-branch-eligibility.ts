import { prisma } from '@/lib/server/prisma'
import type { Prisma } from '../../../generated/prisma/client'

export class PartyBranchEligibilityError extends Error {
  field: 'customerId' | 'supplierId'

  constructor(field: 'customerId' | 'supplierId', message: string) {
    super(message)
    this.name = 'PartyBranchEligibilityError'
    this.field = field
  }
}

export function customerBranchEligibilityWhere(branchId: bigint): Prisma.customersWhereInput {
  return {
    customer_branches: {
      some: {
        active: true,
        branch_id: branchId,
      },
    },
  }
}

export function supplierBranchEligibilityWhere(branchId: bigint): Prisma.suppliersWhereInput {
  return {
    supplier_branches: {
      some: {
        active: true,
        branch_id: branchId,
      },
    },
  }
}

export async function assertCustomerEligibleForBranch(input: {
  branchId: bigint
  customerId: bigint
}) {
  if (!(await isCustomerEligibleForBranch(input))) {
    throw new PartyBranchEligibilityError('customerId', 'ลูกค้าไม่ได้ถูกกำหนดให้ใช้งานกับสาขานี้')
  }
}

export async function isCustomerEligibleForBranch(input: {
  branchId: bigint
  customerId: bigint
}) {
  const count = await prisma.customer_branches.count({
    where: {
      active: true,
      branch_id: input.branchId,
      customer_id: input.customerId,
    },
  })
  return count > 0
}

export async function assertSupplierEligibleForBranch(input: {
  branchId: bigint
  supplierId: bigint
}) {
  if (!(await isSupplierEligibleForBranch(input))) {
    throw new PartyBranchEligibilityError('supplierId', 'ผู้ขายไม่ได้ถูกกำหนดให้ใช้งานกับสาขานี้')
  }
}

export async function isSupplierEligibleForBranch(input: {
  branchId: bigint
  supplierId: bigint
}) {
  const count = await prisma.supplier_branches.count({
    where: {
      active: true,
      branch_id: input.branchId,
      supplier_id: input.supplierId,
    },
  })
  return count > 0
}
