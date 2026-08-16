export type WeightTicketChangeType = 'created' | 'updated' | 'deleted_lines' | 'confirmed' | 'cancelled'
export type WeightTicketHeaderField = 'branchId' | 'partyId' | 'remark' | 'vehicleImageNames' | 'vehicleNo' | 'godownName'

export type WeightTicketChangeEvent = {
  branchId: string
  changeType: WeightTicketChangeType
  documentNo: string
  updatedAt: string | null
  lineIds?: string[]
  deletedLineIds?: string[]
  changedHeaderFields?: WeightTicketHeaderField[]
  imageChanged?: boolean
}

export function mergeWeightTicketChangeEvents(
  current: WeightTicketChangeEvent | null,
  next: WeightTicketChangeEvent,
): WeightTicketChangeEvent {
  if (!current) return next
  return {
    ...next,
    lineIds: Array.from(new Set([...(current.lineIds ?? []), ...(next.lineIds ?? [])])),
    deletedLineIds: Array.from(new Set([...(current.deletedLineIds ?? []), ...(next.deletedLineIds ?? [])])),
    changedHeaderFields: Array.from(new Set([...(current.changedHeaderFields ?? []), ...(next.changedHeaderFields ?? [])])),
    imageChanged: current.imageChanged === true || next.imageChanged === true,
  }
}

export function isWeightTicketChangeEvent(value: unknown): value is WeightTicketChangeEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<WeightTicketChangeEvent>
  return typeof event.branchId === 'string'
    && event.branchId.length > 0
    && event.branchId.length <= 100
    && typeof event.documentNo === 'string'
    && event.documentNo.length > 0
    && event.documentNo.length <= 100
    && (event.changeType === 'created'
      || event.changeType === 'updated'
      || event.changeType === 'deleted_lines'
      || event.changeType === 'confirmed'
      || event.changeType === 'cancelled')
    && (event.updatedAt === null
      || (typeof event.updatedAt === 'string' && event.updatedAt.length <= 64 && !Number.isNaN(Date.parse(event.updatedAt))))
    && (event.lineIds === undefined || (Array.isArray(event.lineIds) && event.lineIds.every((lineId) => typeof lineId === 'string' && lineId.length > 0 && lineId.length <= 80)))
    && (event.deletedLineIds === undefined || (Array.isArray(event.deletedLineIds) && event.deletedLineIds.every((lineId) => typeof lineId === 'string' && lineId.length > 0 && lineId.length <= 80)))
    && (event.changedHeaderFields === undefined || (Array.isArray(event.changedHeaderFields) && event.changedHeaderFields.every((field) => (
      field === 'branchId'
      || field === 'partyId'
      || field === 'remark'
      || field === 'vehicleImageNames'
      || field === 'vehicleNo'
      || field === 'godownName'
    ))))
    && (event.changeType !== 'deleted_lines'
      || (Array.isArray(event.deletedLineIds) && event.deletedLineIds.length > 0 && (event.lineIds === undefined || event.lineIds.length === 0)))
    && (event.imageChanged === undefined || typeof event.imageChanged === 'boolean')
}

export function weightTicketRealtimeChannel(branchId: string) {
  return `weight-ticket-updates:${encodeURIComponent(branchId)}`
}
