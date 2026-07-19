const bankTransferPrefix = /^เงินโอน\s*\(Bank Transfer\)\s*\/\s*/iu

export function formatPaymentApprovalDestinationLabel(label: string | null | undefined) {
  const normalized = String(label ?? '').trim()
  if (!normalized) return '-'

  const destination = normalized.replace(bankTransferPrefix, '').trim()
  return destination || normalized
}

export function paymentApprovalSourcePresentation(source: {
  sourceDocNo: string
  sourceLabel: string
  sourceType: 'advance_payment' | 'purchase_bill'
}) {
  const sourceDocNo = source.sourceDocNo.trim()
  const desktopSublabel = source.sourceType === 'advance_payment' ? '' : source.sourceLabel.trim()

  return {
    desktopSublabel,
    mobileReference: [sourceDocNo, desktopSublabel ? `(${desktopSublabel})` : ''].filter(Boolean).join(' '),
  }
}
