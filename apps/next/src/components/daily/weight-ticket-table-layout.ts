import type { ResizableColumnDefinition } from '@/components/ui/useResizableColumns'

export type WeightTicketColumnKey = 'action' | 'branch' | 'containerDeductionWeight' | 'createdAt' | 'documentNo' | 'netWeight' | 'partyName' | 'status' | 'updatedAt' | 'vehicleNo'

export const WEIGHT_TICKET_COLUMN_STORAGE_KEY = 'daily.weight-ticket-list.v2'

export const weightTicketColumns: Array<ResizableColumnDefinition<WeightTicketColumnKey>> = [
  { key: 'documentNo', defaultWidth: 145, minWidth: 120 },
  { key: 'createdAt', defaultWidth: 135, minWidth: 130 },
  { key: 'partyName', defaultWidth: 200, minWidth: 150 },
  { key: 'branch', defaultWidth: 120, minWidth: 110 },
  { key: 'vehicleNo', defaultWidth: 110, minWidth: 110 },
  { key: 'netWeight', defaultWidth: 135, minWidth: 120 },
  { key: 'containerDeductionWeight', defaultWidth: 150, minWidth: 130 },
  { key: 'status', defaultWidth: 130, minWidth: 130 },
  { key: 'updatedAt', defaultWidth: 145, minWidth: 130 },
  { key: 'action', defaultWidth: 72, minWidth: 64, maxWidth: 88 },
]

export const WEIGHT_TICKET_TABLE_COLUMN_COUNT = weightTicketColumns.length
