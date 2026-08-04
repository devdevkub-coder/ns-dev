import { Prisma } from '../../../generated/prisma/client'
import { BANK_STATEMENT_SOURCE_EVENT_TYPE } from '@/lib/server/bank-statement-cash-flow'
import { lockFcdAccountCurrency } from '@/lib/server/fcd-balance-lock'
import { fcdFxRate, requireFcdInputMoneyAmount } from '@/lib/server/fcd-money'
import { assertFcdReceiptPostingReconciles } from '@/lib/server/fcd-posting-reconciliation'
import { normalizeDate } from '@/lib/server/daily'

type DecimalInput = Prisma.Decimal | number | string

export type FcdReceiptSplitInput = {
  accountCode: string
  nativeAmount: DecimalInput
}

export type FcdReceiptPostingInput = {
  actor: string
  branchId: bigint
  carryingThbAmount: DecimalInput
  currencyCode: string
  date: string
  receiptDocNo: string
  receiptId: bigint
  rate: DecimalInput
  sourceEventKey: string
  splits: FcdReceiptSplitInput[]
  bankStatementDocNos: string[]
}

function normalizedCode(value: string, label: string) {
  const code = value.trim().toUpperCase()
  if (!code) throw new Error(`${label}ไม่ถูกต้อง`)
  return code
}

export function allocateCarryingAmounts(splits: FcdReceiptSplitInput[], totalCarryingInput: DecimalInput) {
  if (splits.length === 0) throw new Error('ต้องมีบัญชี FCD อย่างน้อย 1 รายการ')
  const totalNative = splits.reduce((total, split) => total.plus(requireFcdInputMoneyAmount(split.nativeAmount)), new Prisma.Decimal(0))
  if (totalNative.lte(0)) throw new Error('ยอดเข้าบัญชี FCD ต้องมากกว่า 0')
  const totalCarrying = requireFcdInputMoneyAmount(totalCarryingInput)
  if (totalCarrying.lte(0)) throw new Error('มูลค่าตามบัญชี FCD ต้องมากกว่า 0')
  let remainingCarrying = totalCarrying
  return splits.map((split, index) => {
    const nativeAmount = requireFcdInputMoneyAmount(split.nativeAmount)
    const carryingThbAmount = index === splits.length - 1
      ? remainingCarrying
      : totalCarrying.mul(nativeAmount).div(totalNative).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    remainingCarrying = remainingCarrying.minus(carryingThbAmount)
    return { carryingThbAmount, nativeAmount }
  })
}

/**
 * Legacy Bank Statement readers remain THB-only. The foreign facts live beside
 * those fields, while both THB columns must stay identical for every FCD event.
 */
export function fcdReceiptBankStatementInflow(nativeAmount: DecimalInput, carryingThbAmount: DecimalInput) {
  const native = requireFcdInputMoneyAmount(nativeAmount)
  const carrying = requireFcdInputMoneyAmount(carryingThbAmount)
  return {
    amount_in: carrying,
    amount_out: new Prisma.Decimal(0),
    book_amount_in: carrying,
    book_amount_out: new Prisma.Decimal(0),
    native_amount_in: native,
    native_amount_out: new Prisma.Decimal(0),
  }
}

export function fcdReceiptBankStatementReversal(nativeAmount: DecimalInput, carryingThbAmount: DecimalInput) {
  const native = requireFcdInputMoneyAmount(nativeAmount)
  const carrying = requireFcdInputMoneyAmount(carryingThbAmount)
  return {
    amount_in: new Prisma.Decimal(0),
    amount_out: carrying,
    book_amount_in: new Prisma.Decimal(0),
    book_amount_out: carrying,
    native_amount_in: new Prisma.Decimal(0),
    native_amount_out: native,
  }
}

/** Writes the two linked representations of an FCD cash receipt in one transaction. */
export async function postFcdReceiptAccountSplits(tx: Prisma.TransactionClient, input: FcdReceiptPostingInput) {
  if (input.splits.length !== input.bankStatementDocNos.length) {
    throw new Error('จำนวนบัญชีรับเงินและเลข Bank Statement ไม่ตรงกัน')
  }
  const currencyCode = normalizedCode(input.currencyCode, 'สกุลเงินรับ')
  const rate = fcdFxRate(input.rate)
  const splitCodes = input.splits.map((split) => normalizedCode(split.accountCode, 'บัญชีรับเงิน'))
  if (new Set(splitCodes).size !== splitCodes.length) throw new Error('บัญชี FCD ใน Receipt ซ้ำกัน')

  const accounts = await tx.accounts.findMany({
    include: {
      account_currency_balances: {
        select: { active: true, currency_code: true },
        where: { active: true, currency_code: currencyCode },
      },
    },
    where: { active: true, account_group: 'bank', code: { in: splitCodes }, is_fcd: true },
  })
  if (accounts.length !== splitCodes.length) {
    throw new Error(`บัญชีรับเงินต่างประเทศต้องเป็นบัญชี FCD ที่ active และรองรับ ${currencyCode}`)
  }
  const accountByCode = new Map(accounts.map((account) => [account.code, account]))
  const orderedAccounts = splitCodes.map((code) => accountByCode.get(code))
  if (orderedAccounts.some((account) => !account || account.account_currency_balances.length !== 1)) {
    throw new Error(`บัญชีรับเงินต่างประเทศต้องรองรับ ${currencyCode} จาก Account Master`)
  }

  for (const account of [...orderedAccounts].sort((left, right) => left!.id < right!.id ? -1 : 1)) {
    await lockFcdAccountCurrency(tx, account!.id, currencyCode)
  }

  const calculatedSplits = allocateCarryingAmounts(input.splits, input.carryingThbAmount)
  const created = [] as Array<{ bankStatementId: bigint; fcdLedgerEntryId: bigint }>
  for (const [index, split] of input.splits.entries()) {
    const account = orderedAccounts[index]!
    const amounts = calculatedSplits[index]!
    const bankStatement = await tx.bank_statement.create({
      data: {
        account_id: account.id,
        ...fcdReceiptBankStatementInflow(amounts.nativeAmount, amounts.carryingThbAmount),
        book_fx_rate: rate,
        branch_id: input.branchId,
        created_by: input.actor,
        date: normalizeDate(input.date),
        description: `${input.receiptDocNo} - รับเงิน Customer (FCD ${currencyCode})`,
        doc_no: input.bankStatementDocNos[index]!,
        idempotency_key: `${input.sourceEventKey}:bank:${index + 1}`,
        movement_currency_code: currencyCode,
        ref_id: input.receiptId.toString(),
        ref_no: input.receiptDocNo,
        ref_type: 'RCP',
        source_event_key: `${input.sourceEventKey}:split:${index + 1}`,
        source_event_type: BANK_STATEMENT_SOURCE_EVENT_TYPE.CUSTOMER_RECEIPT_FCD_SETTLEMENT,
        type: 'รับเงิน Customer',
      },
    })
    const ledgerEntry = await tx.fcd_ledger_entries.create({
      data: {
        account_id: account.id,
        bank_statement_id: bankStatement.id,
        branch_id: input.branchId,
        carrying_thb_in: amounts.carryingThbAmount,
        carrying_thb_out: 0,
        created_by: input.actor,
        currency_code: currencyCode,
        entry_date: normalizeDate(input.date),
        fx_rate: rate,
        idempotency_key: `${input.sourceEventKey}:ledger:${index + 1}`,
        native_amount_in: amounts.nativeAmount,
        native_amount_out: 0,
        source_event_key: `${input.sourceEventKey}:split:${index + 1}`,
        source_event_type: BANK_STATEMENT_SOURCE_EVENT_TYPE.CUSTOMER_RECEIPT_FCD_SETTLEMENT,
      },
    })
    await tx.customer_receipt_account_splits.create({
      data: {
        account_code_snapshot: account.code,
        account_id: account.id,
        account_name_snapshot: account.name,
        bank_statement_id: bankStatement.id,
        carrying_thb_amount: amounts.carryingThbAmount,
        created_by: input.actor,
        currency_code: currencyCode,
        fcd_ledger_entry_id: ledgerEntry.id,
        line_no: index + 1,
        receipt_id: input.receiptId,
        received_native_amount: amounts.nativeAmount,
      },
    })
    created.push({ bankStatementId: bankStatement.id, fcdLedgerEntryId: ledgerEntry.id })
  }
  await assertFcdReceiptPostingReconciles(tx, input.receiptId)
  return { created, totalCarryingThb: calculatedSplits.reduce((total, split) => total.plus(split.carryingThbAmount), new Prisma.Decimal(0)) }
}

export async function reverseFcdReceiptAccountSplits(tx: Prisma.TransactionClient, input: {
  actor: string
  branchId: bigint
  date: string
  receiptDocNo: string
  receiptId: bigint
  sourceEventKey: string
  bankStatementDocNos: string[]
}) {
  const splits = await tx.customer_receipt_account_splits.findMany({
    orderBy: [{ line_no: 'asc' }],
    where: { receipt_id: input.receiptId },
  })
  if (splits.length === 0 || splits.length !== input.bankStatementDocNos.length) {
    throw new Error('ข้อมูลบัญชี FCD ของ Receipt ไม่ครบสำหรับการยกเลิก')
  }
  const originalLedgerEntries = await tx.fcd_ledger_entries.findMany({
    where: { id: { in: splits.map((split) => split.fcd_ledger_entry_id).filter((id): id is bigint => id != null) } },
  })
  const ledgerById = new Map(originalLedgerEntries.map((entry) => [entry.id, entry]))
  if (ledgerById.size !== splits.length) throw new Error('ไม่พบ FCD ledger ต้นทางครบสำหรับการยกเลิก')

  for (const split of [...splits].sort((left, right) => left.account_id < right.account_id ? -1 : 1)) {
    await lockFcdAccountCurrency(tx, split.account_id, split.currency_code)
  }
  const created = [] as Array<{ bankStatementId: bigint; fcdLedgerEntryId: bigint }>
  for (const [index, split] of splits.entries()) {
    const originalLedger = ledgerById.get(split.fcd_ledger_entry_id!)!
    const bankStatement = await tx.bank_statement.create({
      data: {
        account_id: split.account_id,
        ...fcdReceiptBankStatementReversal(split.received_native_amount, split.carrying_thb_amount),
        book_fx_rate: originalLedger.fx_rate,
        branch_id: input.branchId,
        created_by: input.actor,
        date: normalizeDate(input.date),
        description: `${input.receiptDocNo} - ยกเลิกรับเงิน Customer (FCD ${split.currency_code})`,
        doc_no: input.bankStatementDocNos[index]!,
        idempotency_key: `${input.sourceEventKey}:bank:${index + 1}`,
        movement_currency_code: split.currency_code,
        ref_id: input.receiptId.toString(),
        ref_no: input.receiptDocNo,
        ref_type: 'RCP-CANCEL',
        reversal_of_id: originalLedger.bank_statement_id,
        source_event_key: `${input.sourceEventKey}:split:${index + 1}`,
        source_event_type: BANK_STATEMENT_SOURCE_EVENT_TYPE.CUSTOMER_RECEIPT_FCD_REVERSAL,
        type: 'ยกเลิกรับเงิน Customer',
      },
    })
    const ledgerEntry = await tx.fcd_ledger_entries.create({
      data: {
        account_id: split.account_id,
        bank_statement_id: bankStatement.id,
        branch_id: input.branchId,
        carrying_thb_in: 0,
        carrying_thb_out: split.carrying_thb_amount,
        created_by: input.actor,
        currency_code: split.currency_code,
        entry_date: normalizeDate(input.date),
        fx_rate: originalLedger.fx_rate,
        idempotency_key: `${input.sourceEventKey}:ledger:${index + 1}`,
        native_amount_in: 0,
        native_amount_out: split.received_native_amount,
        reversal_of_id: originalLedger.id,
        source_event_key: `${input.sourceEventKey}:split:${index + 1}`,
        source_event_type: BANK_STATEMENT_SOURCE_EVENT_TYPE.CUSTOMER_RECEIPT_FCD_REVERSAL,
      },
    })
    created.push({ bankStatementId: bankStatement.id, fcdLedgerEntryId: ledgerEntry.id })
  }
  return { created }
}
