import { Prisma } from '../../../generated/prisma/client'
import { BANK_STATEMENT_SOURCE_EVENT_TYPE } from '@/lib/server/bank-statement-cash-flow'
import { documentBranchCode, normalizeDate } from '@/lib/server/daily'
import { lockFcdAccountCurrency } from '@/lib/server/fcd-balance-lock'
import { fcdFxRate, fcdMoneyAmount } from '@/lib/server/fcd-money'
import { findFcdRateSnapshot } from '@/lib/server/fcd-rate-snapshot'

type DecimalInput = Prisma.Decimal | number | string

export type FcdRevaluationPostingInput = {
  accountCode: string
  actor: string
  branchId: bigint
  closingFxRate: DecimalInput
  currencyCode: string
  idempotencyKey: string
  periodEnd: string
  rateOverrideReason?: string | null
  rateType: string
}

function normalizedCode(value: string, label: string) {
  const code = value.trim().toUpperCase()
  if (!code) throw new Error(`${label}ไม่ถูกต้อง`)
  return code
}

export function calculateFcdRevaluationAmounts(input: {
  carryingThbBefore: DecimalInput
  closingFxRate: DecimalInput
  nativeBalance: DecimalInput
}) {
  const nativeBalance = new Prisma.Decimal(input.nativeBalance)
  const carryingThbBefore = fcdMoneyAmount(input.carryingThbBefore)
  const closingFxRate = fcdFxRate(input.closingFxRate)
  if (!nativeBalance.isFinite() || nativeBalance.lte(0)) throw new Error('ยอดคงเหลือ native ของ FCD ต้องมากกว่า 0')
  if (carryingThbBefore.lt(0)) throw new Error('carrying THB ของ FCD ต้องไม่ติดลบสำหรับการตีมูลค่า')
  const revaluedThbAmount = fcdMoneyAmount(nativeBalance.mul(closingFxRate))
  return {
    closingFxRate,
    revaluedThbAmount,
    unrealizedFxDifference: revaluedThbAmount.minus(carryingThbBefore),
  }
}

async function nextFcdRevaluationDocNo(tx: Prisma.TransactionClient, periodEnd: string, branchCode: string) {
  const normalizedBranchCode = documentBranchCode(branchCode)
  if (!normalizedBranchCode) throw new Error('ไม่พบรหัสสาขาสำหรับออกเลขเอกสารตีมูลค่า FCD')
  const compactDate = periodEnd.slice(2, 4) + periodEnd.slice(5, 7)
  const prefix = `FRV${normalizedBranchCode}${compactDate}-`
  await tx.$executeRaw`
    select pg_advisory_xact_lock(hashtext('fcd-revaluation-doc'), hashtext(${prefix}))
  `
  const last = await tx.fcd_revaluation_batches.findFirst({
    orderBy: { doc_no: 'desc' },
    select: { doc_no: true },
    where: { doc_no: { startsWith: prefix } },
  })
  const sequence = Number(last?.doc_no.slice(prefix.length) ?? '0')
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error('เลขเอกสารตีมูลค่า FCD เดิมไม่ถูกต้อง')
  return `${prefix}${String(sequence + 1).padStart(4, '0')}`
}

/**
 * Posts one account+currency month-end valuation. Native balance remains unchanged;
 * only carrying THB is adjusted through an append-only FCD ledger event.
 */
export async function postFcdRevaluation(tx: Prisma.TransactionClient, input: FcdRevaluationPostingInput) {
  const accountCode = normalizedCode(input.accountCode, 'บัญชี FCD')
  const currencyCode = normalizedCode(input.currencyCode, 'สกุลเงิน FCD')
  const rateType = input.rateType.trim()
  const idempotencyKey = input.idempotencyKey.trim()
  if (!rateType) throw new Error('ต้องระบุประเภทอัตราแลกเปลี่ยนสำหรับการตีมูลค่า FCD')
  if (!idempotencyKey) throw new Error('ต้องระบุ idempotency key สำหรับการตีมูลค่า FCD')

  const [branch, policy, account] = await Promise.all([
    tx.branches.findUnique({ select: { code: true }, where: { id: input.branchId } }),
    tx.finance_currency_policies.findMany({ select: { functional_currency_code: true }, take: 2 }),
    tx.accounts.findFirst({
      include: { account_currency_balances: { select: { currency_code: true }, where: { active: true, currency_code: currencyCode } } },
      where: { active: true, code: accountCode, is_fcd: true },
    }),
  ])
  if (!branch?.code) throw new Error('ไม่พบรหัสสาขาสำหรับการตีมูลค่า FCD')
  if (policy.length !== 1 || !policy[0]?.functional_currency_code) throw new Error('การตั้งค่าสกุลเงินหลักของบริษัทไม่ถูกต้อง')
  if (currencyCode === policy[0].functional_currency_code) throw new Error('การตีมูลค่า FCD ต้องใช้สกุลเงินที่ไม่ใช่สกุลเงินหลักของบริษัท')
  if (!account || account.account_currency_balances.length !== 1) throw new Error(`บัญชี FCD ไม่รองรับ ${currencyCode} จาก Account Master`)

  await lockFcdAccountCurrency(tx, account.id, currencyCode)
  const existing = await tx.fcd_revaluation_lines.findFirst({
    select: { batch_id: true },
    where: { account_id: account.id, currency_code: currencyCode, period_end: normalizeDate(input.periodEnd), posted: true },
  })
  if (existing) throw new Error('บัญชี FCD และสกุลเงินนี้ถูกตีมูลค่าสำหรับงวดดังกล่าวแล้ว')
  const laterMovement = await tx.fcd_ledger_entries.findFirst({
    select: { id: true },
    where: {
      account_id: account.id,
      currency_code: currencyCode,
      entry_date: { gt: normalizeDate(input.periodEnd) },
    },
  })
  if (laterMovement) {
    throw new Error('ต้องตีมูลค่า FCD ก่อนมีรายการเคลื่อนไหวของงวดถัดไป เพื่อคง carrying rate ให้ถูกต้อง')
  }
  const totals = await tx.fcd_ledger_entries.aggregate({
    _sum: { carrying_thb_in: true, carrying_thb_out: true, native_amount_in: true, native_amount_out: true },
    where: { account_id: account.id, currency_code: currencyCode, entry_date: { lte: normalizeDate(input.periodEnd) } },
  })
  const nativeBalance = new Prisma.Decimal(totals._sum.native_amount_in ?? 0).minus(totals._sum.native_amount_out ?? 0)
  const carryingThbBefore = new Prisma.Decimal(totals._sum.carrying_thb_in ?? 0).minus(totals._sum.carrying_thb_out ?? 0)
  const amounts = calculateFcdRevaluationAmounts({ carryingThbBefore, closingFxRate: input.closingFxRate, nativeBalance })

  const exactRate = await findFcdRateSnapshot(tx, {
    fromCurrency: currencyCode,
    rateDate: input.periodEnd,
    rateType,
    toCurrency: policy[0].functional_currency_code,
  })
  const rateWasSuggested = exactRate.kind === 'suggested' && fcdFxRate(exactRate.rate).eq(amounts.closingFxRate)
  if (!rateWasSuggested && !input.rateOverrideReason?.trim()) {
    throw new Error('กรุณาระบุเหตุผลเมื่อกรอกหรือแก้ไขอัตราตีมูลค่า FCD')
  }
  const existingIdempotency = await tx.fcd_revaluation_batches.findUnique({
    select: { doc_no: true },
    where: { idempotency_key: idempotencyKey },
  })
  if (existingIdempotency) throw new Error(`รายการตีมูลค่า FCD นี้ถูกบันทึกแล้ว: ${existingIdempotency.doc_no}`)

  const docNo = await nextFcdRevaluationDocNo(tx, input.periodEnd, branch.code)
  const ledgerEventKey = `fcd-revaluation:${docNo}:1`
  const batch = await tx.fcd_revaluation_batches.create({
    data: {
      branch_id: input.branchId,
      created_by: input.actor,
      doc_no: docNo,
      idempotency_key: idempotencyKey,
      period_end: normalizeDate(input.periodEnd),
      posted_at: new Date(),
      posted_by: input.actor,
      rate_reference: rateWasSuggested && exactRate.kind === 'suggested' ? exactRate.rateId.toString() : input.rateOverrideReason?.trim() ?? null,
      rate_source: rateWasSuggested && exactRate.kind === 'suggested' ? exactRate.source : 'manual',
      status: 'posted',
      updated_by: input.actor,
    },
  })
  const difference = amounts.unrealizedFxDifference
  const ledger = difference.eq(0)
    ? null
    : await tx.fcd_ledger_entries.create({
      data: {
        account_id: account.id,
        branch_id: input.branchId,
        carrying_thb_in: difference.gt(0) ? difference : 0,
        carrying_thb_out: difference.lt(0) ? difference.abs() : 0,
        created_by: input.actor,
        currency_code: currencyCode,
        entry_date: normalizeDate(input.periodEnd),
        fx_rate: amounts.closingFxRate,
        fx_rate_id: rateWasSuggested && exactRate.kind === 'suggested' ? exactRate.rateId : null,
        idempotency_key: `${idempotencyKey}:ledger`,
        native_amount_in: 0,
        native_amount_out: 0,
        source_event_key: ledgerEventKey,
        source_event_type: BANK_STATEMENT_SOURCE_EVENT_TYPE.FCD_REVALUATION,
      },
    })
  await tx.fcd_revaluation_lines.create({
    data: {
      account_id: account.id,
      batch_id: batch.id,
      carrying_thb_before: carryingThbBefore,
      closing_fx_rate: amounts.closingFxRate,
      currency_code: currencyCode,
      fcd_ledger_entry_id: ledger?.id ?? null,
      fx_rate_id: rateWasSuggested && exactRate.kind === 'suggested' ? exactRate.rateId : null,
      native_balance: nativeBalance,
      period_end: normalizeDate(input.periodEnd),
      posted: true,
      revalued_thb_amount: amounts.revaluedThbAmount,
      unrealized_fx_difference: difference,
    },
  })
  await tx.fcd_status_logs.create({
    data: {
      action: 'posted',
      created_by: input.actor,
      entity_id: batch.id,
      entity_type: 'fcd_revaluation',
      event_key: `fcd-revaluation.posted.${docNo}`,
      meta: {
        accountCode,
        carryingThbBefore: carryingThbBefore.toFixed(2),
        currencyCode,
        nativeBalance: nativeBalance.toFixed(2),
        revaluedThbAmount: amounts.revaluedThbAmount.toFixed(2),
        unrealizedFxDifference: difference.toFixed(2),
      },
      to_status: 'active',
    },
  })
  return { docNo, unrealizedFxDifference: difference }
}

/** Reverses a posted FCD revaluation by appending the opposite carrying-THB event. */
export async function reverseFcdRevaluation(tx: Prisma.TransactionClient, input: {
  actor: string
  idempotencyKey: string
  originalDocNo: string
  reversalDate: string
}) {
  const originalDocNo = input.originalDocNo.trim().toUpperCase()
  const idempotencyKey = input.idempotencyKey.trim()
  if (!originalDocNo) throw new Error('ต้องระบุเลขที่เอกสารตีมูลค่า FCD ที่ต้องการยกเลิก')
  if (!idempotencyKey) throw new Error('ต้องระบุ idempotency key สำหรับการยกเลิกตีมูลค่า FCD')

  const original = await tx.fcd_revaluation_batches.findUnique({ where: { doc_no: originalDocNo } })
  if (!original || original.status !== 'posted') throw new Error('ไม่พบรายการตีมูลค่า FCD ที่ post แล้วสำหรับการยกเลิก')
  const existingReversal = await tx.fcd_revaluation_batches.findFirst({
    select: { doc_no: true },
    where: { reversal_of_id: original.id },
  })
  if (existingReversal) throw new Error(`รายการตีมูลค่า FCD นี้ถูกยกเลิกแล้ว: ${existingReversal.doc_no}`)
  const lines = await tx.fcd_revaluation_lines.findMany({
    orderBy: [{ id: 'asc' }],
    where: { batch_id: original.id, posted: true },
  })
  if (lines.length === 0) throw new Error('รายการตีมูลค่า FCD ต้นทางไม่มีบรรทัดที่ post แล้ว')
  if (!original.branch_id) throw new Error('รายการตีมูลค่า FCD ต้นทางไม่มีสาขา')
  const branch = await tx.branches.findUnique({ select: { code: true }, where: { id: original.branch_id } })
  if (!branch?.code) throw new Error('ไม่พบรหัสสาขาของรายการตีมูลค่า FCD ต้นทาง')
  const docNo = await nextFcdRevaluationDocNo(tx, input.reversalDate, branch.code)
  const reversal = await tx.fcd_revaluation_batches.create({
    data: {
      branch_id: original.branch_id,
      created_by: input.actor,
      doc_no: docNo,
      idempotency_key: idempotencyKey,
      period_end: normalizeDate(input.reversalDate),
      posted_at: new Date(),
      posted_by: input.actor,
      rate_reference: original.rate_reference,
      rate_source: original.rate_source,
      reversal_of_id: original.id,
      status: 'reversed',
      updated_by: input.actor,
    },
  })

  for (const [index, line] of lines.entries()) {
    await lockFcdAccountCurrency(tx, line.account_id, line.currency_code)
    const originalLedger = line.fcd_ledger_entry_id
      ? await tx.fcd_ledger_entries.findUnique({ select: { fx_rate: true }, where: { id: line.fcd_ledger_entry_id } })
      : null
    if (line.unrealized_fx_difference.eq(0)) {
      await tx.fcd_revaluation_lines.create({
        data: {
          account_id: line.account_id,
          batch_id: reversal.id,
          carrying_thb_before: line.revalued_thb_amount,
          closing_fx_rate: line.closing_fx_rate,
          currency_code: line.currency_code,
          fx_rate_id: line.fx_rate_id,
          native_balance: line.native_balance,
          period_end: normalizeDate(input.reversalDate),
          posted: false,
          revalued_thb_amount: line.carrying_thb_before,
          unrealized_fx_difference: line.unrealized_fx_difference.negated(),
        },
      })
      continue
    }
    if (!line.fcd_ledger_entry_id || !originalLedger?.fx_rate) {
      throw new Error('รายการตีมูลค่า FCD ต้นทางไม่มี FCD ledger rate สำหรับการยกเลิก')
    }
    const ledger = await tx.fcd_ledger_entries.create({
      data: {
        account_id: line.account_id,
        branch_id: original.branch_id,
        carrying_thb_in: line.unrealized_fx_difference.lt(0) ? line.unrealized_fx_difference.abs() : 0,
        carrying_thb_out: line.unrealized_fx_difference.gt(0) ? line.unrealized_fx_difference : 0,
        created_by: input.actor,
        currency_code: line.currency_code,
        entry_date: normalizeDate(input.reversalDate),
        fx_rate: originalLedger.fx_rate,
        fx_rate_id: line.fx_rate_id,
        idempotency_key: `${idempotencyKey}:ledger:${index + 1}`,
        native_amount_in: 0,
        native_amount_out: 0,
        reversal_of_id: line.fcd_ledger_entry_id,
        source_event_key: `fcd-revaluation:${docNo}:${index + 1}`,
        source_event_type: BANK_STATEMENT_SOURCE_EVENT_TYPE.FCD_REVALUATION_REVERSAL,
      },
    })
    await tx.fcd_revaluation_lines.create({
      data: {
        account_id: line.account_id,
        batch_id: reversal.id,
        carrying_thb_before: line.revalued_thb_amount,
        closing_fx_rate: line.closing_fx_rate,
        currency_code: line.currency_code,
        fcd_ledger_entry_id: ledger.id,
        fx_rate_id: line.fx_rate_id,
        native_balance: line.native_balance,
        period_end: normalizeDate(input.reversalDate),
        posted: false,
        revalued_thb_amount: line.carrying_thb_before,
        unrealized_fx_difference: line.unrealized_fx_difference.negated(),
      },
    })
  }
  await tx.fcd_revaluation_batches.update({
    data: { reversed_at: new Date(), reversed_by: input.actor, status: 'reversed', updated_by: input.actor },
    where: { id: original.id },
  })
  await tx.fcd_status_logs.create({
    data: {
      action: 'reversed',
      created_by: input.actor,
      entity_id: reversal.id,
      entity_type: 'fcd_revaluation',
      event_key: `fcd-revaluation.reversed.${docNo}`,
      from_status: 'posted',
      meta: { originalDocNo },
      to_status: 'reversed',
    },
  })
  return { docNo }
}
