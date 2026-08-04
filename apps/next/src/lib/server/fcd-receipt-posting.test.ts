import { describe, expect, it, vi } from 'vitest'
import { allocateCarryingAmounts, fcdReceiptBankStatementInflow, fcdReceiptBankStatementReversal, postFcdReceiptAccountSplits, reverseFcdReceiptAccountSplits } from './fcd-receipt-posting'

describe('allocateCarryingAmounts', () => {
  it('keeps the rounded account split carrying amount reconciled to the receipt total', () => {
    const result = allocateCarryingAmounts([
      { accountCode: 'FCD-1', nativeAmount: '33.33' },
      { accountCode: 'FCD-2', nativeAmount: '66.67' },
    ], '3512.30')

    expect(result.map((split) => split.carryingThbAmount.toFixed(2))).toEqual(['1170.65', '2341.65'])
    expect(result.reduce((sum, split) => sum.plus(split.carryingThbAmount), result[0]!.carryingThbAmount.minus(result[0]!.carryingThbAmount)).toFixed(2)).toBe('3512.30')
  })

  it('allocates persisted carrying THB after a Bank Fee without changing the native FCD total', () => {
    const result = allocateCarryingAmounts([
      { accountCode: 'FCD-1', nativeAmount: '40.00' },
      { accountCode: 'FCD-2', nativeAmount: '60.00' },
    ], '3465.00')

    expect(result.map((split) => split.carryingThbAmount.toFixed(2))).toEqual(['1386.00', '2079.00'])
    expect(result.reduce((sum, split) => sum.plus(split.carryingThbAmount), result[0]!.carryingThbAmount.minus(result[0]!.carryingThbAmount)).toFixed(2)).toBe('3465.00')
  })
})

describe('FCD Bank Statement compatibility', () => {
  it('mirrors the converted THB amount into the existing Bank Statement fields', () => {
    const result = fcdReceiptBankStatementInflow('100.00', '3500.00')
    expect(result.amount_in.toFixed(2)).toBe('3500.00')
    expect(result.book_amount_in.toFixed(2)).toBe('3500.00')
    expect(result.native_amount_in.toFixed(2)).toBe('100.00')
  })

  it('reverses the same persisted THB amount without converting the native amount again', () => {
    const result = fcdReceiptBankStatementReversal('100.00', '3500.00')
    expect(result.amount_out.toFixed(2)).toBe('3500.00')
    expect(result.book_amount_out.toFixed(2)).toBe('3500.00')
    expect(result.native_amount_out.toFixed(2)).toBe('100.00')
  })
})

describe('foreign receipt reversal posting', () => {
  it('reverses the persisted native, carrying and rate snapshots without looking up a current rate', async () => {
    const bankStatementCreate = vi.fn().mockResolvedValue({ id: 31n })
    const ledgerCreate = vi.fn().mockResolvedValue({ id: 41n })
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      bank_statement: { create: bankStatementCreate },
      customer_receipt_account_splits: {
        findMany: vi.fn().mockResolvedValue([{
          account_id: 7n,
          carrying_thb_amount: '3512.30',
          currency_code: 'USD',
          fcd_ledger_entry_id: 11n,
          received_native_amount: '100.00',
        }]),
      },
      fcd_ledger_entries: {
        create: ledgerCreate,
        findMany: vi.fn().mockResolvedValue([{ bank_statement_id: 22n, fx_rate: '35.123', id: 11n }]),
      },
    }

    await expect(reverseFcdReceiptAccountSplits(tx as never, {
      actor: 'tester@example.com',
      bankStatementDocNos: ['BST2607-0001'],
      branchId: 1n,
      date: '2026-07-30',
      receiptDocNo: 'RCP2607-0001',
      receiptId: 42n,
      sourceEventKey: 'customer-receipt:RCP2607-0001:cancel',
    })).resolves.toEqual({ created: [{ bankStatementId: 31n, fcdLedgerEntryId: 41n }] })

    expect(bankStatementCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        book_fx_rate: '35.123',
        native_amount_out: expect.objectContaining({}),
        reversal_of_id: 22n,
      }),
    }))
    const bankData = bankStatementCreate.mock.calls[0]?.[0].data
    expect(bankData.native_amount_out.toFixed(2)).toBe('100.00')
    expect(bankData.book_amount_out.toFixed(2)).toBe('3512.30')

    expect(ledgerCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ fx_rate: '35.123', reversal_of_id: 11n }),
    }))
    const ledgerData = ledgerCreate.mock.calls[0]?.[0].data
    expect(String(ledgerData.native_amount_out)).toBe('100.00')
    expect(String(ledgerData.carrying_thb_out)).toBe('3512.30')
  })
})

describe('foreign receipt idempotency keys', () => {
  it('derives a stable source and idempotency key for every linked split write', async () => {
    const bankStatementCreate = vi.fn().mockResolvedValue({ id: 31n })
    const ledgerCreate = vi.fn().mockResolvedValue({ id: 41n })
    const splitCreate = vi.fn().mockResolvedValue({ id: 51n })
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      accounts: {
        findMany: vi.fn().mockResolvedValue([{
          account_currency_balances: [{ active: true, currency_code: 'USD' }],
          code: 'FCD-USD',
          id: 7n,
          name: 'FCD USD',
        }]),
      },
      bank_statement: {
        create: bankStatementCreate,
        findMany: vi.fn().mockResolvedValue([{
          account_id: 7n,
          amount_in: '3512.30',
          book_amount_in: '3512.30',
          id: 31n,
          movement_currency_code: 'USD',
          native_amount_in: '100.00',
        }]),
      },
      customer_receipt_account_splits: {
        create: splitCreate,
        findMany: vi.fn().mockResolvedValue([{
          account_id: 7n,
          bank_statement_id: 31n,
          carrying_thb_amount: '3512.30',
          currency_code: 'USD',
          fcd_ledger_entry_id: 41n,
          line_no: 1,
          received_native_amount: '100.00',
        }]),
      },
      fcd_ledger_entries: {
        create: ledgerCreate,
        findMany: vi.fn().mockResolvedValue([{
          account_id: 7n,
          carrying_thb_in: '3512.30',
          currency_code: 'USD',
          id: 41n,
          native_amount_in: '100.00',
        }]),
      },
    }

    await postFcdReceiptAccountSplits(tx as never, {
      actor: 'tester@example.com',
      bankStatementDocNos: ['BST2607-0001'],
      branchId: 1n,
      currencyCode: 'USD',
      date: '2026-07-30',
      carryingThbAmount: '3512.30',
      rate: '35.123',
      receiptDocNo: 'RCP2607-0001',
      receiptId: 42n,
      sourceEventKey: 'customer-receipt:RCP2607-0001',
      splits: [{ accountCode: 'FCD-USD', nativeAmount: '100.00' }],
    })

    expect(bankStatementCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      idempotency_key: 'customer-receipt:RCP2607-0001:bank:1',
      source_event_key: 'customer-receipt:RCP2607-0001:split:1',
    }) }))
    expect(ledgerCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      idempotency_key: 'customer-receipt:RCP2607-0001:ledger:1',
      source_event_key: 'customer-receipt:RCP2607-0001:split:1',
    }) }))
    expect(splitCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      bank_statement_id: 31n,
      fcd_ledger_entry_id: 41n,
    }) }))
  })
})
