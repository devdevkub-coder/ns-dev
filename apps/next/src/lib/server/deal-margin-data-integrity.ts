export type DealMarginDataIntegrityDetails = {
  allocationNos: string[]
  salesDocNo: string | null
  salesLineNo: number
}

export class DealMarginDataIntegrityError extends Error {
  readonly code = 'DEAL_MARGIN_DATA_INTEGRITY'

  constructor(message: string, readonly details: DealMarginDataIntegrityDetails) {
    super(message)
    this.name = 'DealMarginDataIntegrityError'
  }
}
