export function receiptLineOutwardId(ticketDocNo: string, lineNo: number) {
  return `${ticketDocNo}:${lineNo}`
}

export function receiptSummaryOutwardId(ticketDocNo: string, productCode: string, lineCount: number | null | undefined) {
  return `${ticketDocNo}:${productCode}:${lineCount ?? 0}`
}
