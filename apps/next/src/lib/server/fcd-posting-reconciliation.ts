import { Prisma } from '../../../generated/prisma/client'

function sameMoney(left: Prisma.Decimal | number | string, right: Prisma.Decimal | number | string) {
  return new Prisma.Decimal(left).eq(new Prisma.Decimal(right))
}

function requireReconciled(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FCD posting reconcile ไม่ผ่าน: ${message}`)
}

/**
 * Verifies the three persisted facts for a foreign receipt before its enclosing
 * transaction commits. It deliberately reads the rows just written instead of
 * trusting calculated in-memory values.
 */
export async function assertFcdReceiptPostingReconciles(tx: Prisma.TransactionClient, receiptId: bigint) {
  const splits = await tx.customer_receipt_account_splits.findMany({
    where: { receipt_id: receiptId },
  })
  requireReconciled(splits.length > 0, 'ไม่พบบัญชีรับเงิน FCD ของ Receipt')

  const ledgerIds = splits.map((split) => split.fcd_ledger_entry_id).filter((id): id is bigint => id != null)
  const statementIds = splits.map((split) => split.bank_statement_id).filter((id): id is bigint => id != null)
  const [ledgers, statements] = await Promise.all([
    tx.fcd_ledger_entries.findMany({ where: { id: { in: ledgerIds } } }),
    tx.bank_statement.findMany({ where: { id: { in: statementIds } } }),
  ])
  const ledgerById = new Map(ledgers.map((row) => [row.id, row]))
  const statementById = new Map(statements.map((row) => [row.id, row]))

  for (const split of splits) {
    const ledger = split.fcd_ledger_entry_id ? ledgerById.get(split.fcd_ledger_entry_id) : null
    const statement = split.bank_statement_id ? statementById.get(split.bank_statement_id) : null
    requireReconciled(ledger, `split ${split.line_no} ไม่มี FCD ledger`)
    requireReconciled(statement, `split ${split.line_no} ไม่มี Bank Statement`)
    requireReconciled(ledger.account_id === split.account_id && ledger.currency_code === split.currency_code, `split ${split.line_no} ledger account/currency ไม่ตรง`)
    requireReconciled(statement.account_id === split.account_id && statement.movement_currency_code === split.currency_code, `split ${split.line_no} statement account/currency ไม่ตรง`)
    requireReconciled(sameMoney(ledger.native_amount_in, split.received_native_amount) && sameMoney(ledger.carrying_thb_in, split.carrying_thb_amount), `split ${split.line_no} ledger amount ไม่ตรง`)
    requireReconciled(sameMoney(statement.native_amount_in, split.received_native_amount) && sameMoney(statement.book_amount_in, split.carrying_thb_amount) && sameMoney(statement.amount_in ?? 0, split.carrying_thb_amount), `split ${split.line_no} statement amount ไม่ตรง`)
  }
}

/** Verifies the two bank facts and the source FCD ledger for one conversion. */
export async function assertFcdConversionPostingReconciles(tx: Prisma.TransactionClient, conversionId: bigint) {
  const lines = await tx.fcd_conversion_lines.findMany({ where: { conversion_id: conversionId } })
  requireReconciled(lines.length === 1, 'conversion ต้องมี 1 line')
  const line = lines[0]!
  requireReconciled(line.source_fcd_ledger_entry_id && line.source_bank_statement_id && line.destination_bank_statement_id, 'conversion line ไม่มี link ครบ')

  const [ledger, statements] = await Promise.all([
    tx.fcd_ledger_entries.findUnique({ where: { id: line.source_fcd_ledger_entry_id! } }),
    tx.bank_statement.findMany({ where: { id: { in: [line.source_bank_statement_id!, line.destination_bank_statement_id!] } } }),
  ])
  const statementById = new Map(statements.map((row) => [row.id, row]))
  const sourceStatement = statementById.get(line.source_bank_statement_id!)
  const destinationStatement = statementById.get(line.destination_bank_statement_id!)
  requireReconciled(ledger && sourceStatement && destinationStatement, 'conversion link อ้างถึง row ที่ไม่มีอยู่')
  requireReconciled(
    sameMoney(ledger.native_amount_out, line.native_amount)
      && sameMoney(ledger.carrying_thb_out, line.carrying_thb_out)
      && sameMoney(sourceStatement.native_amount_out, line.native_amount)
      && sameMoney(sourceStatement.book_amount_out, line.carrying_thb_out)
      && sameMoney(sourceStatement.amount_out ?? 0, line.carrying_thb_out),
    'conversion source amount ไม่ตรง',
  )
  requireReconciled(
    sameMoney(destinationStatement.native_amount_in, line.actual_thb_received)
      && sameMoney(destinationStatement.book_amount_in, line.actual_thb_received)
      && sameMoney(destinationStatement.amount_in ?? 0, line.actual_thb_received),
    'conversion destination amount ไม่ตรง',
  )
}

/** Verifies that every posted revaluation line has exactly its persisted carrying adjustment. */
export async function assertFcdRevaluationPostingReconciles(tx: Prisma.TransactionClient, batchId: bigint) {
  const lines = await tx.fcd_revaluation_lines.findMany({ where: { batch_id: batchId } })
  requireReconciled(lines.length > 0, 'ไม่พบบรรทัดตีมูลค่า FCD')
  const ledgerIds = lines.map((line) => line.fcd_ledger_entry_id).filter((id): id is bigint => id != null)
  const ledgers = await tx.fcd_ledger_entries.findMany({ where: { id: { in: ledgerIds } } })
  const ledgerById = new Map(ledgers.map((row) => [row.id, row]))

  for (const line of lines) {
    if (sameMoney(line.unrealized_fx_difference, 0)) {
      requireReconciled(line.fcd_ledger_entry_id == null, `revaluation line ${line.id} ที่ส่วนต่างเป็นศูนย์ไม่ควรมี ledger`)
      continue
    }
    const ledger = line.fcd_ledger_entry_id ? ledgerById.get(line.fcd_ledger_entry_id) : null
    requireReconciled(ledger, `revaluation line ${line.id} ไม่มี FCD ledger`)
    requireReconciled(ledger.account_id === line.account_id && ledger.currency_code === line.currency_code, `revaluation line ${line.id} account/currency ไม่ตรง`)
    requireReconciled(sameMoney(ledger.native_amount_in, 0) && sameMoney(ledger.native_amount_out, 0), `revaluation line ${line.id} ต้องไม่เปลี่ยน native balance`)
    const expectedIn = new Prisma.Decimal(line.unrealized_fx_difference).gt(0) ? line.unrealized_fx_difference : 0
    const expectedOut = new Prisma.Decimal(line.unrealized_fx_difference).lt(0) ? new Prisma.Decimal(line.unrealized_fx_difference).abs() : 0
    requireReconciled(sameMoney(ledger.carrying_thb_in, expectedIn) && sameMoney(ledger.carrying_thb_out, expectedOut), `revaluation line ${line.id} carrying THB ไม่ตรง`)
  }
}
