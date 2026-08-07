import type { Prisma } from '../../../../generated/prisma/client'
import type { WeightTicketFormValues } from '@/lib/weight-tickets'
import {
  createActiveWtoPendingOut,
  resolveWtoWarehousesForLines,
  validateWtoStockAvailability,
  type WtoPreservedCostSnapshot,
} from '@/lib/server/stock-holds'

type TxClient = Prisma.TransactionClient
type PartyReference = {
  id: bigint
  name: string
} | null
type WarehouseMap = Awaited<ReturnType<typeof resolveWtoWarehousesForLines>>
type CreatedWeightTicketLine = Parameters<typeof createActiveWtoPendingOut>[1]['lines'][number]

export async function lockWeightTicketStockBuckets(tx: TxClient, input: {
  branchId: bigint
  lineRows: Array<{ product_id: bigint; warehouse_id: bigint | null }>
}) {
  const keys = [...new Set(input.lineRows
    .filter((line) => line.warehouse_id != null)
    .map((line) => `stock.${input.branchId.toString()}.${line.warehouse_id!.toString()}.${line.product_id.toString()}`))]
    .sort()
  for (const key of keys) await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${key}))`
}

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
  excludeWeightTicketId?: bigint
  lineRows: Array<{
    net_weight: Prisma.Decimal | number
    product_id: bigint
    product_name: string
    warehouse_id: bigint | null
  }>
  type: WeightTicketFormValues['type']
}) {
  if (input.type !== 'WTO') return
  await validateWtoStockAvailability(tx, {
    branchId: input.branchId,
    excludeWeightTicketId: input.excludeWeightTicketId,
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
