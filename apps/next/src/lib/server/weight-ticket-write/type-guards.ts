import { isOtherProductImpurityId, type WeightTicketFormValues } from '@/lib/weight-tickets'
import { WeightTicketWriteValidationError } from '@/lib/server/weight-ticket-write/shared'
import { assertWtiSupplier } from '@/lib/server/weight-ticket-write/wti'
import { assertNoLegacyOtherProductImpurity, assertWtoCustomer, assertWtoImpurityRules } from '@/lib/server/weight-ticket-write/wto'

export { WeightTicketWriteValidationError } from '@/lib/server/weight-ticket-write/shared'

type PartyReference = {
  id: bigint
  name: string
} | null

export async function assertWeightTicketPartyForType(input: {
  branchId: bigint
  customer: PartyReference
  supplier: PartyReference
  type: WeightTicketFormValues['type']
}) {
  if (input.type === 'WTI') {
    await assertWtiSupplier({ branchId: input.branchId, supplier: input.supplier })
    return
  }

  await assertWtoCustomer({ branchId: input.branchId, customer: input.customer })
}

export function assertWeightTicketImpurityRules(input: {
  impurityById: Map<bigint, { name: string }>
  parsedImpurityIds: Array<bigint | null>
  values: WeightTicketFormValues
}) {
  if (input.values.type === 'WTO') assertWtoImpurityRules({ values: input.values })

  const missingImpurityIndex = input.values.lines.findIndex((line, index) => {
    const impurityId = input.parsedImpurityIds[index]
    return Boolean(line.impurityId) && !isOtherProductImpurityId(line.impurityId) && (impurityId == null || !input.impurityById.has(impurityId))
  })
  if (missingImpurityIndex >= 0) {
    throw new WeightTicketWriteValidationError(
      `รายการที่ ${missingImpurityIndex + 1}: สิ่งเจือปนไม่ถูกต้องหรือถูกปิดใช้งาน`,
      { [`lines.${missingImpurityIndex}.impurityId`]: ['สิ่งเจือปนไม่ถูกต้องหรือถูกปิดใช้งาน'] },
    )
  }

  assertNoLegacyOtherProductImpurity(input)
}
