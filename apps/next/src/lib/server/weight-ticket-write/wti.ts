import { assertSupplierEligibleForBranch, PartyBranchEligibilityError } from '@/lib/server/party-branch-eligibility'
import { WeightTicketWriteValidationError } from '@/lib/server/weight-ticket-write/shared'

type SupplierReference = {
  id: bigint
  name: string
} | null

export async function assertWtiSupplier(input: {
  branchId: bigint
  supplier: SupplierReference
}) {
  if (!input.supplier) {
    throw new WeightTicketWriteValidationError('ผู้ขายไม่ถูกต้องหรือถูกปิดใช้งาน', { partyId: ['เลือกผู้ขาย'] })
  }
  try {
    await assertSupplierEligibleForBranch({ branchId: input.branchId, supplierId: input.supplier.id })
  } catch (caught) {
    if (caught instanceof PartyBranchEligibilityError) {
      throw new WeightTicketWriteValidationError(caught.message, { partyId: [caught.message] })
    }
    throw caught
  }
}
