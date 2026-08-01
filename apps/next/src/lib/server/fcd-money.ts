import { Prisma } from '../../../generated/prisma/client'

type DecimalInput = Prisma.Decimal | number | string

const MONEY_SCALE = 2
const FX_RATE_SCALE = 3
const ROUNDING_MODE = Prisma.Decimal.ROUND_HALF_UP

function decimal(value: DecimalInput, label: string) {
  try {
    const result = new Prisma.Decimal(value)
    if (!result.isFinite()) throw new Error('not finite')
    return result
  } catch {
    throw new Error(`${label}ต้องเป็นตัวเลขที่ถูกต้อง`)
  }
}

function requireScale(value: Prisma.Decimal, scale: number, label: string) {
  if ((value.decimalPlaces() ?? 0) > scale) {
    throw new Error(`${label}ใช้ทศนิยมได้ไม่เกิน ${scale} ตำแหน่ง`)
  }
  return value
}

export function fcdMoneyAmount(value: DecimalInput) {
  return decimal(value, 'ยอดเงิน').toDecimalPlaces(MONEY_SCALE, ROUNDING_MODE)
}

export function requireFcdInputMoneyAmount(value: DecimalInput) {
  return requireScale(decimal(value, 'ยอดเงิน'), MONEY_SCALE, 'ยอดเงิน')
}

export function fcdFxRate(value: DecimalInput) {
  const rate = requireScale(decimal(value, 'อัตราแลกเปลี่ยน'), FX_RATE_SCALE, 'อัตราแลกเปลี่ยน')
  if (rate.lte(0)) throw new Error('อัตราแลกเปลี่ยนต้องมากกว่า 0')
  return rate
}

export function calculateSettlementBookAmount(nativeAmount: DecimalInput, rate: DecimalInput) {
  return fcdMoneyAmount(requireFcdInputMoneyAmount(nativeAmount).mul(fcdFxRate(rate)))
}

export function calculateFcdWeightedCarryingRate(
  current: { carryingThb: DecimalInput; nativeAmount: DecimalInput },
  incoming: { carryingThb: DecimalInput; nativeAmount: DecimalInput },
) {
  const currentNative = requireFcdInputMoneyAmount(current.nativeAmount)
  const incomingNative = requireFcdInputMoneyAmount(incoming.nativeAmount)
  const denominator = currentNative.plus(incomingNative)
  if (denominator.lte(0)) throw new Error('ยอดคงเหลือ FCD ต้องมากกว่า 0 เพื่อคำนวณ carrying rate')

  const numerator = fcdMoneyAmount(current.carryingThb).plus(fcdMoneyAmount(incoming.carryingThb))
  return numerator.div(denominator).toDecimalPlaces(FX_RATE_SCALE, ROUNDING_MODE)
}
