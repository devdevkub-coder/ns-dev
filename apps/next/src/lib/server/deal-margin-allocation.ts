import { DealMarginDataIntegrityError } from './deal-margin-data-integrity'

export { DealMarginDataIntegrityError } from './deal-margin-data-integrity'

export type DealMarginAllocationInput = {
  allocationNo: string
  billKey: string | null
  salesDocNo: string | null
  date: string | null
  channel: string | null
  salesLineNo: number | null
  matchedCost: number
  matchedQty: number
}

export type DealMarginAllocation = {
  allocationNo: string
  matchedCost: number
  matchedQty: number
  salesDocNo: string | null
  salesLineNo: number
}

export type UnlinkedDealMarginAllocation = {
  allocationNo: string
  billKey: string | null
  salesDocNo: string | null
  date: string | null
  channel: string | null
  matchedCost: number
  matchedQty: number
}

export function indexDealMarginAllocations(allocations: DealMarginAllocationInput[]) {
  const allocationByLine = new Map<string, DealMarginAllocation>()
  const unlinkedAllocations: UnlinkedDealMarginAllocation[] = []

  for (const allocation of allocations) {
    if (allocation.salesLineNo == null) {
      unlinkedAllocations.push({
        allocationNo: allocation.allocationNo,
        billKey: allocation.billKey,
        salesDocNo: allocation.salesDocNo,
        date: allocation.date,
        channel: allocation.channel,
        matchedCost: allocation.matchedCost,
        matchedQty: allocation.matchedQty,
      })
      continue
    }
    if (!allocation.billKey) {
      unlinkedAllocations.push({
        allocationNo: allocation.allocationNo,
        billKey: null,
        salesDocNo: allocation.salesDocNo,
        date: allocation.date,
        channel: allocation.channel,
        matchedCost: allocation.matchedCost,
        matchedQty: allocation.matchedQty,
      })
      continue
    }

    const key = `${allocation.billKey}:${allocation.salesLineNo}`
    const existing = allocationByLine.get(key)
    if (existing) {
      const salesDocNo = existing.salesDocNo ?? allocation.salesDocNo
      throw new DealMarginDataIntegrityError(
        `พบ Allocation ซ้ำใน Sales Bill ${salesDocNo ?? '-'}, Sales Line ${allocation.salesLineNo}`,
        {
          allocationNos: [existing.allocationNo, allocation.allocationNo],
          salesDocNo,
          salesLineNo: allocation.salesLineNo,
        },
      )
    }

    allocationByLine.set(key, {
      allocationNo: allocation.allocationNo,
      matchedCost: allocation.matchedCost,
      matchedQty: allocation.matchedQty,
      salesDocNo: allocation.salesDocNo,
      salesLineNo: allocation.salesLineNo,
    })
  }

  return { allocationByLine, unlinkedAllocations }
}
