import type { WeightTicketRecord } from './weight-tickets'

export function mergeWeightTicketCollaborationBaseline({
  baselineTicket,
  dirtyLineIds,
  latestTicket,
  preserveHeader,
}: {
  baselineTicket: WeightTicketRecord | null
  dirtyLineIds: ReadonlySet<string>
  latestTicket: WeightTicketRecord
  preserveHeader: boolean
}): WeightTicketRecord {
  if (!baselineTicket) return latestTicket

  const mergedBaselineLines = [
    ...baselineTicket.lines.filter((line) => dirtyLineIds.has(line.id)),
    ...latestTicket.lines.filter((line) => !dirtyLineIds.has(line.id)),
  ].sort((left, right) => (left.lineNo ?? 0) - (right.lineNo ?? 0))

  return {
    ...latestTicket,
    ...(preserveHeader ? {
      branchId: baselineTicket.branchId,
      partyId: baselineTicket.partyId,
      remark: baselineTicket.remark,
      vehicleImageNames: baselineTicket.vehicleImageNames,
      vehicleNo: baselineTicket.vehicleNo,
      godownName: baselineTicket.godownName,
    } : {}),
    lines: mergedBaselineLines,
  }
}
