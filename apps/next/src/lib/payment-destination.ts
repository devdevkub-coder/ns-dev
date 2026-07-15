export type PaymentDestination = {
  accountNo: string | null | undefined
  bankName: string | null | undefined
  paymentMethod: string | null | undefined
}

export type PaymentRecipient = {
  partyId: string | null | undefined
  partyName: string | null | undefined
}

export type PaymentSourceRecipient = PaymentRecipient & {
  legacyPartyId?: bigint | number | string | null
}

export function normalizePaymentDestinationText(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('en-US')
}

export function normalizePaymentAccountNo(value: string | null | undefined) {
  return normalizePaymentDestinationText(value).replace(/[\s./\\_‐‑‒–—―-]+/gu, '')
}

export function normalizePaymentMethod(value: string | null | undefined) {
  const normalized = normalizePaymentDestinationText(value)
  return normalized === 'โอนเงิน' ? 'เงินโอน' : normalized
}

export function paymentDestinationKey(destination: PaymentDestination) {
  return [
    normalizePaymentMethod(destination.paymentMethod),
    normalizePaymentDestinationText(destination.bankName),
    normalizePaymentAccountNo(destination.accountNo),
  ].join('\u001f')
}

export function assertCompatiblePaymentDestinations(
  destinations: PaymentDestination[],
  voucherPaymentMethod: string,
  voucherPaymentMethodType: string | null | undefined,
) {
  const paymentMethods = new Set(destinations.map((destination) => (
    normalizePaymentMethod(destination.paymentMethod)
  )))
  if (paymentMethods.size !== 1 || paymentMethods.has('')) {
    throw new Error('Payment Voucher เดียวกันต้องเลือก PMA ที่มีช่องทางรับเงินเดียวกัน')
  }
  if (!paymentMethods.has(normalizePaymentMethod(voucherPaymentMethod))) {
    throw new Error('วิธีจ่ายของ Payment Voucher ต้องตรงกับช่องทางรับเงินที่อนุมัติไว้')
  }
  if (normalizePaymentDestinationText(voucherPaymentMethodType) !== 'cash' && destinations.some((destination) => (
    !normalizePaymentDestinationText(destination.bankName)
    || !/^\d+$/u.test(normalizePaymentAccountNo(destination.accountNo))
  ))) {
    throw new Error('PMA ช่องทางโอนเงินต้องมีธนาคารและเลขบัญชีตัวเลขที่อนุมัติไว้')
  }
  if (new Set(destinations.map(paymentDestinationKey)).size !== 1) {
    throw new Error('Payment Voucher เดียวกันต้องเลือก PMA ที่มีธนาคารและเลขบัญชีปลายทางเดียวกัน')
  }
}

export function assertCompatiblePaymentRecipients(recipients: PaymentRecipient[]) {
  const partyIds = recipients.map((recipient) => normalizePaymentDestinationText(recipient.partyId))
  const distinctPartyIds = new Set(partyIds.filter(Boolean))
  if (distinctPartyIds.size > 1) {
    throw new Error('Payment Voucher เดียวกันต้องเลือก PMA ของผู้รับเงินเดียวกัน')
  }
  if (recipients.length > 0 && partyIds.every(Boolean)) return

  const partyNames = recipients.map((recipient) => normalizePaymentDestinationText(recipient.partyName))
  if (partyNames.some((name) => !name) || new Set(partyNames).size !== 1) {
    throw new Error('Payment Voucher เดียวกันต้องเลือก PMA ของผู้รับเงินเดียวกัน')
  }
}

export function canonicalizePaymentRecipientForSource(
  approvalRecipient: PaymentRecipient,
  sourceRecipient: PaymentSourceRecipient,
): PaymentRecipient {
  const approvalPartyId = normalizePaymentDestinationText(approvalRecipient.partyId)
  const legacyPartyId = normalizePaymentDestinationText(
    sourceRecipient.legacyPartyId == null ? null : String(sourceRecipient.legacyPartyId),
  )
  const normalizedNumericId = (value: string) => /^\d+$/u.test(value)
    ? value.replace(/^0+(?=\d)/u, '')
    : null
  if (
    normalizePaymentDestinationText(sourceRecipient.partyId)
    && normalizedNumericId(approvalPartyId) != null
    && normalizedNumericId(approvalPartyId) === normalizedNumericId(legacyPartyId)
  ) {
    return { ...approvalRecipient, partyId: sourceRecipient.partyId }
  }
  return approvalRecipient
}

export function assertPaymentRecipientMatchesSource(
  approvalRecipient: PaymentRecipient,
  sourceRecipient: PaymentRecipient,
) {
  const approvalPartyId = normalizePaymentDestinationText(approvalRecipient.partyId)
  const sourcePartyId = normalizePaymentDestinationText(sourceRecipient.partyId)
  if (approvalPartyId && sourcePartyId) {
    if (approvalPartyId === sourcePartyId) return
    throw new Error('ผู้รับเงินใน PMA ไม่ตรงกับผู้รับเงินของเอกสารต้นทาง')
  }

  const approvalPartyName = normalizePaymentDestinationText(approvalRecipient.partyName)
  const sourcePartyName = normalizePaymentDestinationText(sourceRecipient.partyName)
  if (approvalPartyName && approvalPartyName === sourcePartyName) return
  throw new Error('ผู้รับเงินใน PMA ไม่ตรงกับผู้รับเงินของเอกสารต้นทาง')
}

export function assertPaymentVoucherCreateOnly(voucherId: string | null | undefined) {
  if (voucherId) {
    throw new Error('ประวัติ PMT เป็นข้อมูลอ่านอย่างเดียว หากต้องการเปลี่ยนรายการให้ยกเลิกแล้วทำจ่ายใหม่')
  }
}

export function assertPaymentVoucherServerGeneratedDocNo(docNo: string | null | undefined) {
  if (normalizePaymentDestinationText(docNo)) {
    throw new Error('เลขที่ PMT ต้องออกโดยระบบเท่านั้น')
  }
}
