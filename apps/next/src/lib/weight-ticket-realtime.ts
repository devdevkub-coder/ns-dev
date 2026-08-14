export type WeightTicketChangeType = 'created' | 'updated' | 'deleted_lines' | 'confirmed' | 'cancelled'

export type WeightTicketChangeEvent = {
  branchId: string
  changeType: WeightTicketChangeType
  documentNo: string
  updatedAt: string | null
  lineIds?: string[]
  imageChanged?: boolean
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
    && (event.imageChanged === undefined || typeof event.imageChanged === 'boolean')
}

export function weightTicketRealtimeChannel(branchId: string) {
  return `weight-ticket-updates:${encodeURIComponent(branchId)}`
}
