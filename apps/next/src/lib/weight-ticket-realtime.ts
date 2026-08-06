export type WeightTicketChangeType = 'created' | 'updated' | 'confirmed' | 'cancelled'

export type WeightTicketChangeEvent = {
  changeType: WeightTicketChangeType
  documentNo: string
  updatedAt: string | null
}
