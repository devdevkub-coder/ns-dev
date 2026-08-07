export type WeightTicketChangeType = 'created' | 'updated' | 'confirmed' | 'cancelled'

export type WeightTicketChangeEvent = {
  branchId: string
  changeType: WeightTicketChangeType
  documentNo: string
  updatedAt: string | null
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
      || event.changeType === 'confirmed'
      || event.changeType === 'cancelled')
    && (event.updatedAt === null
      || (typeof event.updatedAt === 'string' && event.updatedAt.length <= 64 && !Number.isNaN(Date.parse(event.updatedAt))))
}

export function weightTicketRealtimeChannel(branchId: string) {
  return `weight-ticket-updates:${encodeURIComponent(branchId)}`
}
