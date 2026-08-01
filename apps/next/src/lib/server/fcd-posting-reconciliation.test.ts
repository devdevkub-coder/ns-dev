import { describe, expect, it, vi } from 'vitest'
import {
  assertFcdConversionPostingReconciles,
  assertFcdReceiptPostingReconciles,
  assertFcdRevaluationPostingReconciles,
} from './fcd-posting-reconciliation'

describe('FCD posting reconciliation invariants', () => {
  it('rejects a receipt when its persisted Bank Statement carrying THB differs from the split', async () => {
    const tx = {
      bank_statement: { findMany: vi.fn().mockResolvedValue([{
        account_id: 7n, amount_in: '3499.99', book_amount_in: '3499.99', id: 31n, movement_currency_code: 'USD', native_amount_in: '100.00',
      }]) },
      customer_receipt_account_splits: { findMany: vi.fn().mockResolvedValue([{
        account_id: 7n, bank_statement_id: 31n, carrying_thb_amount: '3500.00', currency_code: 'USD', fcd_ledger_entry_id: 41n, line_no: 1, received_native_amount: '100.00',
      }]) },
      fcd_ledger_entries: { findMany: vi.fn().mockResolvedValue([{
        account_id: 7n, carrying_thb_in: '3500.00', currency_code: 'USD', id: 41n, native_amount_in: '100.00',
      }]) },
    }

    await expect(assertFcdReceiptPostingReconciles(tx as never, 1n)).rejects.toThrow('statement amount ไม่ตรง')
  })

  it('accepts a conversion only when source ledger/BST and destination BST reconcile to persisted line amounts', async () => {
    const tx = {
      bank_statement: { findMany: vi.fn().mockResolvedValue([
        { amount_out: '3500.00', book_amount_out: '3500.00', id: 31n, native_amount_out: '100.00' },
        { amount_in: '3510.00', book_amount_in: '3510.00', id: 32n, native_amount_in: '3510.00' },
      ]) },
      fcd_conversion_lines: { findMany: vi.fn().mockResolvedValue([{
        actual_thb_received: '3510.00', carrying_thb_out: '3500.00', destination_bank_statement_id: 32n, native_amount: '100.00', source_bank_statement_id: 31n, source_fcd_ledger_entry_id: 41n,
      }]) },
      fcd_ledger_entries: { findUnique: vi.fn().mockResolvedValue({ carrying_thb_out: '3500.00', native_amount_out: '100.00' }) },
    }

    await expect(assertFcdConversionPostingReconciles(tx as never, 1n)).resolves.toBeUndefined()
  })

  it('rejects a revaluation ledger that changes the native balance', async () => {
    const tx = {
      fcd_ledger_entries: { findMany: vi.fn().mockResolvedValue([{
        account_id: 7n, carrying_thb_in: '20.00', carrying_thb_out: '0.00', currency_code: 'USD', id: 41n, native_amount_in: '0.01', native_amount_out: '0.00',
      }]) },
      fcd_revaluation_lines: { findMany: vi.fn().mockResolvedValue([{
        account_id: 7n, currency_code: 'USD', fcd_ledger_entry_id: 41n, id: 1n, unrealized_fx_difference: '20.00',
      }]) },
    }

    await expect(assertFcdRevaluationPostingReconciles(tx as never, 1n)).rejects.toThrow('ต้องไม่เปลี่ยน native balance')
  })
})
