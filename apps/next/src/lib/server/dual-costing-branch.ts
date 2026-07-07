import { prisma } from '@/lib/server/prisma'

export const DUAL_COSTING_BRANCH_NAME = 'สมุทรสาคร'

export async function getDualCostingBranch() {
  const branch = await prisma.branches.findFirst({
    select: { id: true, name: true },
    where: {
      active: { not: false },
      name: DUAL_COSTING_BRANCH_NAME,
    },
  })

  if (!branch) {
    throw new Error(`ไม่พบสาขา ${DUAL_COSTING_BRANCH_NAME} สำหรับ Dual Costing`)
  }

  return branch
}
