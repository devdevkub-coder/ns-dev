import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const editRouteSource = readFileSync(
  resolve(process.cwd(), 'src/app/api/daily/weight-tickets/[id]/route.ts'),
  'utf8',
)

const stockHoldsSource = readFileSync(
  resolve(process.cwd(), 'src/lib/server/stock-holds.ts'),
  'utf8',
)

const pendingOutEventsSource = readFileSync(
  resolve(process.cwd(), 'src/lib/server/weight-ticket-pending-out-events.ts'),
  'utf8',
)

const weightTicketWriteHandlersSource = readFileSync(
  resolve(process.cwd(), 'src/lib/server/weight-ticket-write/handlers.ts'),
  'utf8',
)

const weightTicketsSource = readFileSync(
  resolve(process.cwd(), 'src/lib/server/weight-tickets.ts'),
  'utf8',
)

describe('weight-ticket transaction query contract', () => {
  it('keeps pool-backed usage reads parallel and transaction usage reads serial', () => {
    const poolStart = weightTicketsSource.indexOf('export async function getWeightTicketUsageCountsByTicketIds(')
    const transactionStart = weightTicketsSource.indexOf('export async function getWeightTicketUsageCountsByTicketIdsInTransaction(')
    const transactionEnd = weightTicketsSource.indexOf('export async function getWeightTicketUsageCounts(', transactionStart)

    expect(poolStart).toBeGreaterThan(-1)
    expect(transactionStart).toBeGreaterThan(poolStart)
    expect(transactionEnd).toBeGreaterThan(transactionStart)

    const poolSource = weightTicketsSource.slice(poolStart, transactionStart)
    const transactionSource = weightTicketsSource.slice(transactionStart, transactionEnd)

    expect(poolSource).toContain('await Promise.all([')
    expect(transactionSource).not.toContain('Promise.all')
  })

  it('routes locked WTI/WTO usage checks through the transaction-specific helper', () => {
    expect(editRouteSource).toContain('getWeightTicketUsageCountsInTransaction')
    expect(editRouteSource).not.toMatch(/getWeightTicketUsageCounts\(tx\s*,/)
  })

  it('serializes all query reads used by transaction-backed WTO stock and pending-out flows', () => {
    const stockHoldTxFunctionMarkers = [
      'export async function resolveWtoWarehousesForLines',
      'async function loadSaleableBuckets',
      'async function allocateWtoPendingOutBuckets',
      'async function loadAverageCostByBucketKey',
      'export async function validateWtoStockAvailability',
      'export async function createActiveWtoPendingOut',
      'export async function snapshotActiveWtoPendingOutCosts',
      'export async function releaseActiveWtoPendingOut',
      'export async function consumeActiveWtoPendingOut',
      'export async function reopenConsumedWtoPendingOutForSalesBill',
      'export async function releaseConsumedWtoPendingOutForSalesBill',
      'export async function closeActiveWtoPendingOutForSalesBillReturn',
    ]
    const pendingOutEventTxFunctionMarkers = [
      'export async function appendWtoPendingOutEventsFromHolds',
      'async function appendWtoPendingOutEventsForHoldRefs',
      'export async function appendWtoPendingOutEventsFromHoldIds',
      'export async function appendWtoPendingOutEventsForSalesBill',
      'export async function appendWtoPendingOutEventsForHoldKeys',
      'export async function getWeightTicketPendingOutEvents',
    ]
    const weightTicketWriteTxFunctionMarkers = [
      'export async function resolveWeightTicketWarehousesForWrite',
      'export async function validateWeightTicketStockForWrite',
      'export async function applyWeightTicketCreateSideEffects',
      'export async function applyWeightTicketEditSideEffects',
    ]

    const sliceFunctionSources = (source: string, markers: string[]) => markers.map((marker, index) => {
      const start = source.indexOf(marker)
      const nextMarker = markers[index + 1]
      const end = nextMarker == null ? source.length : source.indexOf(nextMarker, start)

      expect(start, `missing transaction function: ${marker}`).toBeGreaterThan(-1)
      expect(end, `invalid transaction function boundary: ${marker}`).toBeGreaterThan(start)
      return source.slice(start, end)
    })

    const txFunctionSources = [
      ...sliceFunctionSources(stockHoldsSource, stockHoldTxFunctionMarkers),
      ...sliceFunctionSources(pendingOutEventsSource, pendingOutEventTxFunctionMarkers),
      ...sliceFunctionSources(weightTicketWriteHandlersSource, weightTicketWriteTxFunctionMarkers),
    ]

    expect(txFunctionSources).toHaveLength(
      stockHoldTxFunctionMarkers.length
        + pendingOutEventTxFunctionMarkers.length
        + weightTicketWriteTxFunctionMarkers.length,
    )
    for (const source of txFunctionSources) {
      expect(source).not.toContain('Promise.all')
    }
  })

  it('keeps parallel history helpers pool-only', () => {
    expect(weightTicketsSource).toContain('getWeightTicketDownstreamAllocations(prismaClient: PrismaClient')
    expect(weightTicketsSource).toContain('getWeightTicketTimeline(prismaClient: PrismaClient')
  })
})
