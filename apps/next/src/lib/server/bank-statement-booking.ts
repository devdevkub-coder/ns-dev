import { Prisma } from '../../../generated/prisma/client'

type DecimalInput = Prisma.Decimal | number | string

type FunctionalBankStatementMovementInput = {
  amountIn: DecimalInput
  amountOut: DecimalInput
  functionalCurrencyCode: string
  idempotencyKey: string
  sourceEventKey: string
  sourceEventType: string
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`ต้องระบุ${label}`)
  return normalized
}

function currencyCode(value: string) {
  const normalized = requiredText(value, 'สกุลเงิน functional').toUpperCase()
  if (!/^[A-Z0-9]{3,6}$/.test(normalized)) throw new Error('รหัสสกุลเงิน functional ไม่ถูกต้อง')
  return normalized
}

function money(value: DecimalInput) {
  let result: Prisma.Decimal
  try {
    result = new Prisma.Decimal(value)
  } catch {
    throw new Error('ยอดเงินต้องเป็นตัวเลขที่ถูกต้อง')
  }
  if (!result.isFinite() || result.lt(0)) throw new Error('ยอดเงินต้องไม่ติดลบ')
  if ((result.decimalPlaces() ?? 0) > 2) throw new Error('ยอดเงินใช้ทศนิยมได้ไม่เกิน 2 ตำแหน่ง')
  return result
}

/**
 * Creates one canonical Bank Statement movement for a functional-currency
 * event. Foreign FCD events use their dedicated writer because native and
 * book amounts differ.
 */
export function functionalBankStatementMovement(input: FunctionalBankStatementMovementInput) {
  const amountIn = money(input.amountIn)
  const amountOut = money(input.amountOut)
  if ((amountIn.gt(0) && amountOut.gt(0)) || (amountIn.eq(0) && amountOut.eq(0))) {
    throw new Error('ต้องมีเงินเข้า หรือ เงินออกเพียงด้านเดียว')
  }

  return {
    amount_in: amountIn,
    amount_out: amountOut,
    book_amount_in: amountIn,
    book_amount_out: amountOut,
    book_fx_rate: null,
    idempotency_key: requiredText(input.idempotencyKey, 'idempotency key'),
    movement_currency_code: currencyCode(input.functionalCurrencyCode),
    native_amount_in: amountIn,
    native_amount_out: amountOut,
    source_event_key: requiredText(input.sourceEventKey, 'source event key'),
    source_event_type: requiredText(input.sourceEventType, 'source event type'),
  }
}

type FunctionalBankStatementInflowReversalInput = {
  bookAmountIn: DecimalInput | null
  bookFxRate: DecimalInput | null
  idempotencyKey: string
  movementCurrencyCode: string | null
  nativeAmountIn: DecimalInput | null
  sourceEventKey: string
  sourceEventType: string
}

/** Reverses a persisted functional-currency inflow without consulting rate/master data. */
export function reverseFunctionalBankStatementInflow(input: FunctionalBankStatementInflowReversalInput) {
  if (input.nativeAmountIn === null || input.bookAmountIn === null || input.movementCurrencyCode === null) {
    throw new Error('Bank Statement เดิมไม่มี native/book currency facts สำหรับยกเลิก')
  }
  const nativeAmountOut = money(input.nativeAmountIn)
  const bookAmountOut = money(input.bookAmountIn)
  if (nativeAmountOut.lte(0) || bookAmountOut.lte(0)) {
    throw new Error('Bank Statement เดิมต้องมียอดเงินเข้ามากกว่า 0 สำหรับยกเลิก')
  }

  return {
    amount_in: new Prisma.Decimal(0),
    amount_out: bookAmountOut,
    book_amount_in: new Prisma.Decimal(0),
    book_amount_out: bookAmountOut,
    book_fx_rate: input.bookFxRate,
    idempotency_key: requiredText(input.idempotencyKey, 'idempotency key'),
    movement_currency_code: currencyCode(input.movementCurrencyCode),
    native_amount_in: new Prisma.Decimal(0),
    native_amount_out: nativeAmountOut,
    source_event_key: requiredText(input.sourceEventKey, 'source event key'),
    source_event_type: requiredText(input.sourceEventType, 'source event type'),
  }
}
