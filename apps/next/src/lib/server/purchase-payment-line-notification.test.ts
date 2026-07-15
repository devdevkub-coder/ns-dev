import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  findAccountSplits: vi.fn(),
  findAllocations: vi.fn(),
  findPayments: vi.fn(),
  findSetting: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    payment_account_splits: { findMany: db.findAccountSplits },
    payment_allocations: { findMany: db.findAllocations },
    payments: { findMany: db.findPayments },
    system_settings: { findUnique: db.findSetting },
  },
}))

vi.mock('./weight-ticket-line-notification', () => ({ sendLinePush: vi.fn() }))

import { loadPurchasePaymentLineNotificationSource } from './purchase-payment-line-notification'

const approvalSnapshot = {
  destination_account_no_snapshot: '1234567890',
  destination_bank_name_snapshot: 'ธนาคารปลายทาง',
  destination_payment_method_snapshot: 'เงินโอน',
  party_id: 'SUP-001',
  party_name_snapshot: 'ผู้รับจาก PMA',
  source_doc_no_snapshot: 'PB-001',
  source_type: 'purchase_bill',
}

function payment(overrides: Record<string, unknown>) {
  return {
    amount: 100,
    bank_fee: 3,
    branches: { code: '01', name: 'สำนักงานใหญ่' },
    date: new Date('2026-07-13T00:00:00.000Z'),
    discount: 10,
    fee: null,
    id: 11n,
    method: 'เงินสด',
    net_amount: 103,
    notes: '',
    status: 'active',
    suppliers: { code: 'SUP-001', name: 'ชื่อจาก Supplier' },
    voucher_id: null,
    withholding_tax: 2,
    ...overrides,
  }
}

describe('purchase payment LINE notification source', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('aggregates every payment row and prefers PMA and account snapshots', async () => {
    db.findPayments.mockResolvedValue([
      payment({}),
      payment({
        amount: 200,
        bank_fee: 99,
        discount: 20,
        fee: 5,
        id: 12n,
        net_amount: 205,
        notes: 'หมายเหตุจากใบจ่าย',
        voucher_id: 'VOUCHER-1',
        withholding_tax: 4,
      }),
    ])
    db.findAllocations.mockResolvedValue([
      {
        allocated_amount: 110,
        payment_approval_doc_no: 'PMA-001',
        payment_approvals: approvalSnapshot,
        source_doc_no_snapshot: null,
        source_type: 'purchase_bill',
      },
      {
        allocated_amount: 220,
        payment_approval_doc_no: 'PMA-002',
        payment_approvals: {
          ...approvalSnapshot,
          source_doc_no_snapshot: 'EXP-002',
          source_type: 'expense',
        },
        source_doc_no_snapshot: 'EXP-002',
        source_type: 'expense',
      },
    ])
    db.findAccountSplits.mockResolvedValue([
      {
        account_code_snapshot: 'BANK-01',
        account_name_snapshot: 'บัญชี Snapshot 1',
        accounts: { code: 'OLD-01', name: 'ชื่อปัจจุบัน 1' },
        amount: 150,
      },
      {
        account_code_snapshot: 'BANK-02',
        account_name_snapshot: 'บัญชี Snapshot 2',
        accounts: { code: 'OLD-02', name: 'ชื่อปัจจุบัน 2' },
        amount: 158,
      },
    ])

    const loaded = await loadPurchasePaymentLineNotificationSource('PMT012607-0001')

    expect(loaded).toMatchObject({
      data: {
        approvals: [
          { amount: 110, approvalNo: 'PMA-001', sourceDocumentNo: 'PB-001', sourceType: 'purchase_bill' },
          { amount: 220, approvalNo: 'PMA-002', sourceDocumentNo: 'EXP-002', sourceType: 'expense' },
        ],
        companyAccounts: [
          { accountCode: 'BANK-01', accountName: 'บัญชี Snapshot 1', amount: 150 },
          { accountCode: 'BANK-02', accountName: 'บัญชี Snapshot 2', amount: 158 },
        ],
        destinationAccountNo: '1234567890',
        destinationBankName: 'ธนาคารปลายทาง',
        discount: 30,
        fee: 8,
        netCashOut: 308,
        notes: 'หมายเหตุจากใบจ่าย',
        paidAmount: 300,
        payeeName: 'ผู้รับจาก PMA',
        paymentMethod: 'เงินโอน',
        withholdingTax: 6,
      },
      documentType: 'PMT',
      id: 11n,
      routingDocument: {
        branchId: '01',
        partyId: 'SUP-001',
        supplierId: 'SUP-001',
        type: 'PMT',
      },
    })
    expect(db.findAllocations).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { payment_voucher_id: 'PMT012607-0001' },
          { payment_doc_no: 'PMT012607-0001' },
        ],
      }),
    }))
  })

  it('rejects a document whose rows point to different non-null vouchers', async () => {
    db.findPayments.mockResolvedValue([
      payment({ voucher_id: 'VOUCHER-1' }),
      payment({ id: 12n, voucher_id: 'VOUCHER-2' }),
    ])

    await expect(loadPurchasePaymentLineNotificationSource('PMT012607-0001'))
      .rejects.toThrow('Payment Voucher เดียว')
    expect(db.findAllocations).not.toHaveBeenCalled()
    expect(db.findAccountSplits).not.toHaveBeenCalled()
  })
})
