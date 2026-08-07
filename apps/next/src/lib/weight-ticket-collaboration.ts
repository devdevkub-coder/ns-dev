import type { WeightTicketRecord } from './weight-tickets'

export function mergeWeightTicketCollaborationBaseline({
  baselineTicket,
  dirtyLineIds,
  dirtyHeaderFields,
  latestTicket,
}: {
  baselineTicket: WeightTicketRecord | null
  dirtyLineIds: ReadonlySet<string>
  dirtyHeaderFields: ReadonlySet<'branchId' | 'partyId' | 'remark' | 'vehicleImageNames' | 'vehicleNo' | 'godownName'>
  latestTicket: WeightTicketRecord
}): WeightTicketRecord {
  if (!baselineTicket) return latestTicket

  const mergedBaselineLines = [
    ...baselineTicket.lines.filter((line) => dirtyLineIds.has(line.id)),
    ...latestTicket.lines.filter((line) => !dirtyLineIds.has(line.id)),
  ].sort((left, right) => (left.lineNo ?? 0) - (right.lineNo ?? 0))

  return {
    ...latestTicket,
    ...(dirtyHeaderFields.has('branchId') ? { branchId: baselineTicket.branchId } : {}),
    ...(dirtyHeaderFields.has('partyId') ? { partyId: baselineTicket.partyId } : {}),
    ...(dirtyHeaderFields.has('remark') ? { remark: baselineTicket.remark } : {}),
    ...(dirtyHeaderFields.has('vehicleImageNames') ? { vehicleImageNames: baselineTicket.vehicleImageNames } : {}),
    ...(dirtyHeaderFields.has('vehicleNo') ? { vehicleNo: baselineTicket.vehicleNo } : {}),
    ...(dirtyHeaderFields.has('godownName') ? { godownName: baselineTicket.godownName } : {}),
    lines: mergedBaselineLines,
  }
}
