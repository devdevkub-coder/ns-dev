import { Prisma } from '../../../generated/prisma/client'
import { BANK_STATEMENT_SOURCE_EVENT_TYPE } from '@/lib/server/bank-statement-cash-flow'
import { documentBranchCode, normalizeDate } from '@/lib/server/daily'
import { lockFcdAccountCurrency } from '@/lib/server/fcd-balance-lock'
import { fcdFxRate, fcdMoneyAmount, requireFcdInputMoneyAmount } from '@/lib/server/fcd-money'

type DecimalInput = Prisma.Decimal | number | string

export type FcdConversionPostingInput = {
  actor: string
  actualThbReceived: DecimalInput
  bankFeeThb: DecimalInput
  bankReference?: string | null
  branchId: bigint
  conversionDate: string
  destinationAccountCode: string
  idempotencyKey: string
  nativeAmount: DecimalInput
  sourceAccountCode: string
  sourceCurrencyCode: string
}

function normalizedCode(value: string, label: string) {
  const code = value.trim().toUpperCase()
  if (!code) throw new Error(`${label}ไม่ถูกต้อง`)
  return code
}

function positiveMoney(value: DecimalInput, label: string) {
  const amount = requireFcdInputMoneyAmount(value)
  if (amount.lte(0)) throw new Error(`${label}ต้องมากกว่า 0`)
  return amount
}

function nonNegativeMoney(value: DecimalInput, label: string) {
  const amount = requireFcdInputMoneyAmount(value)
  if (amount.lt(0)) throw new Error(`${label}ต้องไม่ติดลบ`)
  return amount
}

export function calculateFcdConversionAmounts(input: {
  actualThbReceived: DecimalInput
  nativeAmount: DecimalInput
  weightedCarryingRate: DecimalInput
}) {
  const nativeAmount = positiveMoney(input.nativeAmount, 'ยอดเงินต่างประเทศที่แลก')
  const weightedCarryingRate = fcdFxRate(input.weightedCarryingRate)
  const carryingThbOut = fcdMoneyAmount(nativeAmount.mul(weightedCarryingRate))
  const actualThbReceived = positiveMoney(input.actualThbReceived, 'ยอดเงินบาทที่ได้รับจริง')
  return {
    actualThbReceived,
    carryingThbOut,
    realizedFxDifference: actualThbReceived.minus(carryingThbOut),
  }
}

async function nextFcdConversionDocNo(
  tx: Prisma.TransactionClient,
  conversionDate: string,
  branchCode: string,
) {
  const normalizedBranchCode = documentBranchCode(branchCode)
  if (!normalizedBranchCode) throw new Error('ไม่พบรหัสสาขาสำหรับออกเลขเอกสารแลกเงิน FCD')
  const compactDate = conversionDate.slice(2, 4) + conversionDate.slice(5, 7)
  const prefix = `FCV${normalizedBranchCode}${compactDate}-`
  await tx.$executeRaw`
    select pg_advisory_xact_lock(hashtext('fcd-conversion-doc'), hashtext(${prefix}))
  `
  const last = await tx.fcd_conversions.findFirst({
    orderBy: { doc_no: 'desc' },
    select: { doc_no: true },
    where: { doc_no: { startsWith: prefix } },
  })
  const sequence = Number(last?.doc_no.slice(prefix.length) ?? '0')
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error('เลขเอกสารแลกเงิน FCD เดิมไม่ถูกต้อง')
  return `${prefix}${String(sequence + 1).padStart(4, '0')}`
}

async function loadFcdBalance(tx: Prisma.TransactionClient, accountId: bigint, currencyCode: string) {
  const totals = await tx.fcd_ledger_entries.aggregate({
    _sum: { carrying_thb_in: true, carrying_thb_out: true, native_amount_in: true, native_amount_out: true },
    where: { account_id: accountId, currency_code: currencyCode },
  })
  const nativeBalance = new Prisma.Decimal(totals._sum.native_amount_in ?? 0).minus(totals._sum.native_amount_out ?? 0)
  const carryingThbBalance = new Prisma.Decimal(totals._sum.carrying_thb_in ?? 0).minus(totals._sum.carrying_thb_out ?? 0)
  if (nativeBalance.lte(0) || carryingThbBalance.lte(0)) {
    throw new Error('บัญชี FCD ไม่มี native balance หรือ carrying balance สำหรับการแลกเงิน')
  }
  return { carryingThbBalance, nativeBalance }
}

/**
 * Posts one real FCD conversion. The source and destination Bank Statement rows
 * are linked as one internal-transfer event; only their realized FX difference is
 * a gain/loss classification. Call only inside an enclosing database transaction.
 */
export async function postFcdConversion(tx: Prisma.TransactionClient, input: FcdConversionPostingInput) {
  const sourceAccountCode = normalizedCode(input.sourceAccountCode, 'บัญชี FCD ต้นทาง')
  const destinationAccountCode = normalizedCode(input.destinationAccountCode, 'บัญชีเงินบาทปลายทาง')
  const sourceCurrencyCode = normalizedCode(input.sourceCurrencyCode, 'สกุลเงิน FCD')
  const idempotencyKey = input.idempotencyKey.trim()
  if (!idempotencyKey) throw new Error('ต้องระบุ idempotency key สำหรับการแลกเงิน FCD')

  const [branch, policy, currency] = await Promise.all([
    tx.branches.findUnique({ select: { code: true }, where: { id: input.branchId } }),
    tx.finance_currency_policies.findMany({ select: { functional_currency_code: true }, take: 2 }),
    tx.currencies.findUnique({ select: { code: true }, where: { code: sourceCurrencyCode } }),
  ])
  if (!branch?.code) throw new Error('ไม่พบรหัสสาขาสำหรับการแลกเงิน FCD')
  if (policy.length !== 1 || !policy[0]?.functional_currency_code) throw new Error('การตั้งค่าสกุลเงินหลักของบริษัทไม่ถูกต้อง')
  if (!currency) throw new Error(`ไม่พบสกุลเงิน FCD ${sourceCurrencyCode} ใน Currency Master`)
  const functionalCurrencyCode = policy[0].functional_currency_code
  if (sourceCurrencyCode === functionalCurrencyCode) throw new Error('การแลกเงิน FCD ต้องใช้สกุลต้นทางที่ไม่ใช่สกุลเงินหลักของบริษัท')

  const accounts = await tx.accounts.findMany({
    include: {
      account_currency_balances: {
        select: { currency_code: true },
        where: { active: true, currency_code: { in: [sourceCurrencyCode, functionalCurrencyCode] } },
      },
    },
    where: { active: true, code: { in: [sourceAccountCode, destinationAccountCode] } },
  })
  if (accounts.length !== 2) throw new Error('ไม่พบบัญชีต้นทางหรือปลายทางที่ active สำหรับการแลกเงิน FCD')
  const byCode = new Map(accounts.map((account) => [account.code, account]))
  const sourceAccount = byCode.get(sourceAccountCode)
  const destinationAccount = byCode.get(destinationAccountCode)
  if (!sourceAccount?.is_fcd || !sourceAccount.account_currency_balances.some((item) => item.currency_code === sourceCurrencyCode)) {
    throw new Error(`บัญชีต้นทางต้องเป็น FCD ที่รองรับ ${sourceCurrencyCode}`)
  }
  if (!destinationAccount || destinationAccount.is_fcd || !destinationAccount.account_currency_balances.some((item) => item.currency_code === functionalCurrencyCode)) {
    throw new Error(`บัญชีปลายทางต้องเป็นบัญชีธนาคารปกติที่รองรับ ${functionalCurrencyCode}`)
  }

  await lockFcdAccountCurrency(tx, sourceAccount.id, sourceCurrencyCode)
  const balance = await loadFcdBalance(tx, sourceAccount.id, sourceCurrencyCode)
  const nativeAmount = positiveMoney(input.nativeAmount, 'ยอดเงินต่างประเทศที่แลก')
  if (nativeAmount.gt(balance.nativeBalance)) {
    throw new Error(`ยอดแลกเงินเกิน native balance ที่ใช้ได้ของบัญชี FCD ${sourceCurrencyCode}`)
  }
  const weightedCarryingRate = fcdFxRate(
    balance.carryingThbBalance.div(balance.nativeBalance).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP),
  )
  const amounts = calculateFcdConversionAmounts({
    actualThbReceived: input.actualThbReceived,
    nativeAmount,
    weightedCarryingRate,
  })
  const bankFeeThb = nonNegativeMoney(input.bankFeeThb, 'ค่าธรรมเนียมธนาคาร')

  const existing = await tx.fcd_conversions.findUnique({
    select: { doc_no: true },
    where: { idempotency_key: idempotencyKey },
  })
  if (existing) throw new Error(`รายการแลกเงิน FCD นี้ถูกบันทึกแล้ว: ${existing.doc_no}`)

  const docNo = await nextFcdConversionDocNo(tx, input.conversionDate, branch.code)
  const sourceEventKey = `fcd-conversion:${docNo}:source`
  const destinationEventKey = `fcd-conversion:${docNo}:destination`
  const conversion = await tx.fcd_conversions.create({
    data: {
      actual_thb_received: amounts.actualThbReceived,
      bank_fee_thb: bankFeeThb,
      bank_reference: input.bankReference?.trim() || null,
      branch_id: input.branchId,
      conversion_date: normalizeDate(input.conversionDate),
      created_by: input.actor,
      destination_account_id: destinationAccount.id,
      doc_no: docNo,
      idempotency_key: idempotencyKey,
      source_account_id: sourceAccount.id,
      source_currency_code: sourceCurrencyCode,
      status: 'active',
      updated_by: input.actor,
    },
  })
  const [sourceStatement, destinationStatement] = await Promise.all([
    tx.bank_statement.create({
      data: {
        account_id: sourceAccount.id,
        amount_in: 0,
        amount_out: amounts.carryingThbOut,
        book_amount_in: 0,
        book_amount_out: amounts.carryingThbOut,
        book_fx_rate: weightedCarryingRate.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP),
        branch_id: input.branchId,
        cash_flow_category: 'internal_transfer',
        created_by: input.actor,
        date: normalizeDate(input.conversionDate),
        description: `${docNo} - แลก ${sourceCurrencyCode} เป็น ${functionalCurrencyCode}`,
        doc_no: `${docNo}-OUT`,
        idempotency_key: `${idempotencyKey}:source-bank`,
        movement_currency_code: sourceCurrencyCode,
        native_amount_in: 0,
        native_amount_out: nativeAmount,
        ref_id: conversion.id.toString(),
        ref_no: docNo,
        ref_type: 'FCV',
        source_event_key: sourceEventKey,
        source_event_type: BANK_STATEMENT_SOURCE_EVENT_TYPE.FCD_CONVERSION_SOURCE,
        type: 'แลกเงินต่างประเทศออก',
      },
    }),
    tx.bank_statement.create({
      data: {
        account_id: destinationAccount.id,
        amount_in: amounts.actualThbReceived,
        amount_out: 0,
        book_amount_in: amounts.actualThbReceived,
        book_amount_out: 0,
        branch_id: input.branchId,
        cash_flow_category: 'internal_transfer',
        created_by: input.actor,
        date: normalizeDate(input.conversionDate),
        description: `${docNo} - รับเงินจากการแลก ${sourceCurrencyCode}`,
        doc_no: `${docNo}-IN`,
        idempotency_key: `${idempotencyKey}:destination-bank`,
        movement_currency_code: functionalCurrencyCode,
        native_amount_in: amounts.actualThbReceived,
        native_amount_out: 0,
        ref_id: conversion.id.toString(),
        ref_no: docNo,
        ref_type: 'FCV',
        source_event_key: destinationEventKey,
        source_event_type: BANK_STATEMENT_SOURCE_EVENT_TYPE.FCD_CONVERSION_DESTINATION,
        type: 'รับเงินจากการแลกเงินต่างประเทศ',
      },
    }),
  ])
  const sourceLedger = await tx.fcd_ledger_entries.create({
    data: {
      account_id: sourceAccount.id,
      bank_statement_id: sourceStatement.id,
      branch_id: input.branchId,
      carrying_thb_in: 0,
      carrying_thb_out: amounts.carryingThbOut,
      created_by: input.actor,
      currency_code: sourceCurrencyCode,
      entry_date: normalizeDate(input.conversionDate),
      fx_rate: weightedCarryingRate.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP),
      idempotency_key: `${idempotencyKey}:source-ledger`,
      native_amount_in: 0,
      native_amount_out: nativeAmount,
      source_event_key: sourceEventKey,
      source_event_type: BANK_STATEMENT_SOURCE_EVENT_TYPE.FCD_CONVERSION_SOURCE,
    },
  })
  await tx.fcd_conversion_lines.create({
    data: {
      actual_thb_received: amounts.actualThbReceived,
      carrying_thb_out: amounts.carryingThbOut,
      conversion_id: conversion.id,
      destination_bank_statement_id: destinationStatement.id,
      line_no: 1,
      native_amount: nativeAmount,
      realized_fx_difference: amounts.realizedFxDifference,
      source_bank_statement_id: sourceStatement.id,
      source_fcd_ledger_entry_id: sourceLedger.id,
    },
  })
  await tx.fcd_status_logs.create({
    data: {
      action: 'posted',
      created_by: input.actor,
      entity_id: conversion.id,
      entity_type: 'fcd_conversion',
      event_key: `fcd-conversion.posted.${docNo}`,
      from_status: null,
      meta: {
        actualThbReceived: amounts.actualThbReceived.toFixed(2),
        carryingThbOut: amounts.carryingThbOut.toFixed(2),
        destinationBankStatementId: destinationStatement.id.toString(),
        realizedFxDifference: amounts.realizedFxDifference.toFixed(2),
        sourceBankStatementId: sourceStatement.id.toString(),
        sourceCurrencyCode,
        sourceFcdLedgerEntryId: sourceLedger.id.toString(),
      },
      to_status: 'active',
    },
  })

  return { docNo, realizedFxDifference: amounts.realizedFxDifference }
}

/** Reverses a posted conversion by appending linked counter-movements. */
export async function reverseFcdConversion(tx: Prisma.TransactionClient, input: {
  actor: string
  conversionDate: string
  idempotencyKey: string
  originalDocNo: string
}) {
  const originalDocNo = input.originalDocNo.trim().toUpperCase()
  const idempotencyKey = input.idempotencyKey.trim()
  if (!originalDocNo) throw new Error('ต้องระบุเลขที่เอกสารแลกเงิน FCD ที่ต้องการยกเลิก')
  if (!idempotencyKey) throw new Error('ต้องระบุ idempotency key สำหรับการยกเลิกแลกเงิน FCD')

  const original = await tx.fcd_conversions.findUnique({ where: { doc_no: originalDocNo } })
  if (!original || original.status !== 'active') throw new Error('ไม่พบรายการแลกเงิน FCD ที่ active สำหรับการยกเลิก')
  const originalLines = await tx.fcd_conversion_lines.findMany({
    orderBy: { line_no: 'asc' },
    where: { conversion_id: original.id },
  })
  if (originalLines.length !== 1) throw new Error('รายการแลกเงิน FCD ต้นทางมี conversion line ไม่ครบ')
  const originalLine = originalLines[0]!
  if (!originalLine.source_fcd_ledger_entry_id || !originalLine.source_bank_statement_id || !originalLine.destination_bank_statement_id) {
    throw new Error('รายการแลกเงิน FCD ต้นทางมี link ledger หรือ Bank Statement ไม่ครบ')
  }
  const existingReversal = await tx.fcd_conversions.findFirst({
    select: { doc_no: true },
    where: { reversal_of_id: original.id },
  })
  if (existingReversal) throw new Error(`รายการแลกเงิน FCD นี้ถูกยกเลิกแล้ว: ${existingReversal.doc_no}`)
  const sourceLedger = await tx.fcd_ledger_entries.findUnique({
    select: { fx_rate: true },
    where: { id: originalLine.source_fcd_ledger_entry_id },
  })
  if (!sourceLedger?.fx_rate) throw new Error('รายการ FCD ledger ต้นทางไม่มี carrying rate สำหรับการยกเลิก')
  const [branch, policy] = await Promise.all([
    tx.branches.findUnique({ select: { code: true }, where: { id: original.branch_id } }),
    tx.finance_currency_policies.findMany({ select: { functional_currency_code: true }, take: 2 }),
  ])
  if (!branch?.code) throw new Error('ไม่พบรหัสสาขาของรายการแลกเงิน FCD ต้นทาง')
  if (policy.length !== 1 || !policy[0]?.functional_currency_code) throw new Error('การตั้งค่าสกุลเงินหลักของบริษัทไม่ถูกต้อง')
  const functionalCurrencyCode = policy[0].functional_currency_code

  await lockFcdAccountCurrency(tx, original.source_account_id, original.source_currency_code)
  const docNo = await nextFcdConversionDocNo(tx, input.conversionDate, branch.code)
  const sourceEventKey = `fcd-conversion:${docNo}:source-reversal`
  const destinationEventKey = `fcd-conversion:${docNo}:destination-reversal`
  const reversal = await tx.fcd_conversions.create({
    data: {
      actual_thb_received: original.actual_thb_received,
      bank_fee_thb: original.bank_fee_thb,
      bank_reference: original.bank_reference,
      branch_id: original.branch_id,
      conversion_date: normalizeDate(input.conversionDate),
      created_by: input.actor,
      destination_account_id: original.destination_account_id,
      doc_no: docNo,
      idempotency_key: idempotencyKey,
      reversal_of_id: original.id,
      source_account_id: original.source_account_id,
      source_currency_code: original.source_currency_code,
      status: 'active',
      updated_by: input.actor,
    },
  })
  const [sourceStatement, destinationStatement] = await Promise.all([
    tx.bank_statement.create({
      data: {
        account_id: original.source_account_id,
        amount_in: originalLine.carrying_thb_out,
        amount_out: 0,
        book_amount_in: originalLine.carrying_thb_out,
        book_amount_out: 0,
        book_fx_rate: sourceLedger.fx_rate,
        branch_id: original.branch_id,
        cash_flow_category: 'internal_transfer',
        created_by: input.actor,
        date: normalizeDate(input.conversionDate),
        description: `${docNo} - ยกเลิกการแลก ${original.source_currency_code}`,
        doc_no: `${docNo}-IN`,
        idempotency_key: `${idempotencyKey}:source-bank`,
        movement_currency_code: original.source_currency_code,
        native_amount_in: originalLine.native_amount,
        native_amount_out: 0,
        ref_id: reversal.id.toString(),
        ref_no: docNo,
        ref_type: 'FCV-CANCEL',
        reversal_of_id: originalLine.source_bank_statement_id,
        source_event_key: sourceEventKey,
        source_event_type: BANK_STATEMENT_SOURCE_EVENT_TYPE.FCD_CONVERSION_REVERSAL_SOURCE,
        type: 'ยกเลิกแลกเงินต่างประเทศ',
      },
    }),
    tx.bank_statement.create({
      data: {
        account_id: original.destination_account_id,
        amount_in: 0,
        amount_out: originalLine.actual_thb_received,
        book_amount_in: 0,
        book_amount_out: originalLine.actual_thb_received,
        branch_id: original.branch_id,
        cash_flow_category: 'internal_transfer',
        created_by: input.actor,
        date: normalizeDate(input.conversionDate),
        description: `${docNo} - ยกเลิกรับเงินจากการแลก ${original.source_currency_code}`,
        doc_no: `${docNo}-OUT`,
        idempotency_key: `${idempotencyKey}:destination-bank`,
        movement_currency_code: functionalCurrencyCode,
        native_amount_in: 0,
        native_amount_out: originalLine.actual_thb_received,
        ref_id: reversal.id.toString(),
        ref_no: docNo,
        ref_type: 'FCV-CANCEL',
        reversal_of_id: originalLine.destination_bank_statement_id,
        source_event_key: destinationEventKey,
        source_event_type: BANK_STATEMENT_SOURCE_EVENT_TYPE.FCD_CONVERSION_REVERSAL_DESTINATION,
        type: 'ยกเลิกรับเงินจากการแลกเงินต่างประเทศ',
      },
    }),
  ])
  const reversalLedger = await tx.fcd_ledger_entries.create({
    data: {
      account_id: original.source_account_id,
      bank_statement_id: sourceStatement.id,
      branch_id: original.branch_id,
      carrying_thb_in: originalLine.carrying_thb_out,
      carrying_thb_out: 0,
      created_by: input.actor,
      currency_code: original.source_currency_code,
      entry_date: normalizeDate(input.conversionDate),
      fx_rate: sourceLedger.fx_rate,
      idempotency_key: `${idempotencyKey}:source-ledger`,
      native_amount_in: originalLine.native_amount,
      native_amount_out: 0,
      reversal_of_id: originalLine.source_fcd_ledger_entry_id,
      source_event_key: sourceEventKey,
      source_event_type: BANK_STATEMENT_SOURCE_EVENT_TYPE.FCD_CONVERSION_REVERSAL_SOURCE,
    },
  })
  await tx.fcd_conversion_lines.create({
    data: {
      actual_thb_received: originalLine.actual_thb_received,
      carrying_thb_out: originalLine.carrying_thb_out,
      conversion_id: reversal.id,
      destination_bank_statement_id: destinationStatement.id,
      line_no: 1,
      native_amount: originalLine.native_amount,
      realized_fx_difference: originalLine.realized_fx_difference.negated(),
      source_bank_statement_id: sourceStatement.id,
      source_fcd_ledger_entry_id: reversalLedger.id,
    },
  })
  await tx.fcd_conversions.update({
    data: { status: 'cancelled', updated_at: new Date(), updated_by: input.actor },
    where: { id: original.id },
  })
  await tx.fcd_status_logs.create({
    data: {
      action: 'reversed',
      created_by: input.actor,
      entity_id: reversal.id,
      entity_type: 'fcd_conversion',
      event_key: `fcd-conversion.reversed.${docNo}`,
      from_status: null,
      meta: { originalDocNo, reversalOfId: original.id.toString() },
      to_status: 'active',
    },
  })
  await tx.fcd_status_logs.create({
    data: {
      action: 'cancelled',
      created_by: input.actor,
      entity_id: original.id,
      entity_type: 'fcd_conversion',
      event_key: `fcd-conversion.cancelled.${originalDocNo}`,
      from_status: 'active',
      meta: { reversalDocNo: docNo, reversalId: reversal.id.toString() },
      to_status: 'cancelled',
    },
  })
  return { docNo, originalDocNo }
}
