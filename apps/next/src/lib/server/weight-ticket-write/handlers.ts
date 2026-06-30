import type { Prisma } from '../../../../generated/prisma/client'
import type { WeightTicketFormValues } from '@/lib/weight-tickets'
import {
  createActiveWtoPendingOut,
  resolveWtoWarehousesForLines,
  validateWtoStockAvailability,
  type WtoPreservedCostSnapshot,
} from '@/lib/server/stock-holds'
import { buildWeightTicketLineRows } from '@/lib/server/weight-tickets'

type TxClient = Prisma.TransactionClient
type PartyReference = {
  id: bigint
  name: string
} | null
type WarehouseMap = Awaited<ReturnType<typeof resolveWtoWarehousesForLines>>
type CreatedWeightTicketLine = Parameters<typeof createActiveWtoPendingOut>[1]['lines'][number]
type WeightTicketLineRows = ReturnType<typeof buildWeightTicketLineRows>

export function weightTicketPartySnapshot(input: {
  customer: PartyReference
  supplier: PartyReference
  type: WeightTicketFormValues['type']
}) {
  return input.type === 'WTI'
    ? {
      customerId: null,
      partyName: input.supplier?.name ?? '',
      supplierId: input.supplier?.id ?? null,
    }
    : {
      customerId: input.customer?.id ?? null,
      partyName: input.customer?.name ?? '',
      supplierId: null,
    }
}

export async function resolveWeightTicketWarehousesForWrite(tx: TxClient, input: {
  branchId: bigint
  lines: WeightTicketFormValues['lines']
  type: WeightTicketFormValues['type']
}): Promise<WarehouseMap> {
  if (input.type !== 'WTO') return new Map()
  return resolveWtoWarehousesForLines(tx, { branchId: input.branchId, lines: input.lines })
}

export async function validateWeightTicketStockForWrite(tx: TxClient, input: {
  branchId: bigint
  lineRows: WeightTicketLineRows
  type: WeightTicketFormValues['type']
}) {
  if (input.type !== 'WTO') return
  await validateWtoStockAvailability(tx, {
    branchId: input.branchId,
    lines: input.lineRows.map((line, index) => ({
      index,
      netWeight: Number(line.net_weight),
      productId: line.product_id,
      productName: line.product_name,
      warehouseId: line.warehouse_id,
    })),
  })
}

export async function applyWeightTicketCreateSideEffects(tx: TxClient, input: {
  actor: string
  branchId: bigint
  createdLines: CreatedWeightTicketLine[]
  documentNo: string
  type: WeightTicketFormValues['type']
  weightTicketId: bigint
}) {
  if (input.type !== 'WTO') return []
  return createActiveWtoPendingOut(tx, {
    actor: input.actor,
    branchId: input.branchId,
    documentNo: input.documentNo,
    lines: input.createdLines,
    weightTicketId: input.weightTicketId,
  })
}

export async function applyWeightTicketEditSideEffects(tx: TxClient, input: {
  actor: string
  branchId: bigint
  createdLines: CreatedWeightTicketLine[]
  documentNo: string
  preservedCostSnapshots: WtoPreservedCostSnapshot[]
  shouldSnapshotCost: boolean
  type: WeightTicketFormValues['type']
  weightTicketId: bigint
}) {
  if (input.type !== 'WTO') return []
  return createActiveWtoPendingOut(tx, {
    actor: input.actor,
    branchId: input.branchId,
    documentNo: input.documentNo,
    lines: input.createdLines,
    preservedCostSnapshots: input.preservedCostSnapshots,
    snapshotCost: input.shouldSnapshotCost,
    snapshotSource: 'WTO_EDIT_INCREASE',
    weightTicketId: input.weightTicketId,
  })
}
