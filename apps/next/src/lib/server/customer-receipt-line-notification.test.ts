import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  findReceipt: vi.fn(),
  findSetting: vi.fn(),
  findStatements: vi.fn(),
}))
const line = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('./prisma', () => ({
  prisma: {
    bank_statement: { findMany: db.findStatements },
    customer_receipts: { findUnique: db.findReceipt },
    system_settings: { findUnique: db.findSetting },
  },
}))

vi.mock('./weight-ticket-line-notification', () => ({ sendLinePush: line.push }))

import {
  loadCustomerReceiptLineNotificationSource,
  notifyCustomerReceiptLine,
} from './customer-receipt-line-notification'

function receipt(status = 'active') {
  return {
    account_code_snapshot: 'BANK-01',
    account_name_snapshot: 'บัญชี Snapshot',
    bank_fee_total: 5,
    branches: { code: '01', name: 'สำนักงานใหญ่' },
    customer_code_snapshot: 'CUS-001',
    customer_name_snapshot: 'บริษัท ลูกค้า จำกัด',
    customer_receipt_allocations: [{
      allocated_ar_amount: 1_100,
      discount_amount: 50,
      receipt_amount: 1_000,
      sales_bill_doc_no_snapshot: 'SB2607-0001',
      withholding_tax_amount: 50,
    }],
    date: new Date('2026-07-13T00:00:00.000Z'),
    discount_total: 50,
    doc_no: 'RCP2607-0001',
    gross_amount: 1_000,
    id: 42n,
    net_cash_in: 945,
    notes: 'รับชำระตามรอบ',
    payment_method_name_snapshot: 'เงินโอน',
    status,
    withholding_tax_total: 50,
  }
}

describe('customer receipt LINE notification source', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads canonical RCP header, ordered SB allocations, account splits, and routing codes', async () => {
    db.findReceipt.mockResolvedValue(receipt())
    db.findStatements.mockResolvedValue([
      { accounts: { code: 'BANK-01', name: 'บัญชีรับเงิน 1' }, amount_in: 500 },
      { accounts: { code: 'BANK-02', name: 'บัญชีรับเงิน 2' }, amount_in: 445 },
    ])

    const loaded = await loadCustomerReceiptLineNotificationSource('RCP2607-0001')

    expect(loaded).toMatchObject({
      data: {
        allocations: [{
          allocatedArAmount: 1_100,
          discount: 50,
          receiptAmount: 1_000,
          salesBillDocumentNo: 'SB2607-0001',
          withholdingTax: 50,
        }],
        branchName: 'สำนักงานใหญ่',
        companyAccounts: [
          { accountCode: 'BANK-01', accountName: 'บัญชีรับเงิน 1', amount: 500 },
          { accountCode: 'BANK-02', accountName: 'บัญชีรับเงิน 2', amount: 445 },
        ],
        customerName: 'บริษัท ลูกค้า จำกัด',
        discount: 50,
        documentNo: 'RCP2607-0001',
        fee: 5,
        netCashIn: 945,
        paymentMethod: 'เงินโอน',
        receivedAmount: 1_000,
        status: 'active',
        withholdingTax: 50,
      },
      documentType: 'RCP',
      id: 42n,
      routingDocument: {
        branchId: '01',
        customerId: 'CUS-001',
        partyId: 'CUS-001',
        type: 'RCP',
      },
    })
    expect(db.findReceipt).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.not.objectContaining({
        cancel_reason: true,
        cancelled_by: true,
        customers: true,
      }),
      where: { doc_no: 'RCP2607-0001' },
    }))
    expect(db.findReceipt).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        customer_receipt_allocations: expect.objectContaining({
          where: { status: 'active' },
        }),
      }),
    }))
    expect(db.findStatements).toHaveBeenCalledWith(expect.objectContaining({
      select: {
        accounts: { select: { code: true, name: true } },
        amount_in: true,
      },
      where: {
        amount_in: { gt: 0 },
        ref_id: '42',
        ref_type: 'RCP',
      },
    }))
  })

  it('uses the header account snapshot when split statements are unavailable', async () => {
    db.findReceipt.mockResolvedValue(receipt())
    db.findStatements.mockResolvedValue([])

    const loaded = await loadCustomerReceiptLineNotificationSource('RCP2607-0001')

    expect(loaded?.data.companyAccounts).toEqual([
      { accountCode: 'BANK-01', accountName: 'บัญชี Snapshot', amount: 945 },
    ])
  })

  it('does not load an auto-created pending RCP', async () => {
    db.findReceipt.mockResolvedValue(receipt('pending'))

    await expect(loadCustomerReceiptLineNotificationSource('RCP2607-0001')).resolves.toBeNull()
    expect(db.findStatements).not.toHaveBeenCalled()
  })

  it.each(['cancelled', 'canceled'])('does not load an inactive RCP with status %s', async (status) => {
    db.findReceipt.mockResolvedValue(receipt(status))

    await expect(loadCustomerReceiptLineNotificationSource('RCP2607-0001')).resolves.toBeNull()
    expect(db.findStatements).not.toHaveBeenCalled()
  })

  it.each([
    { conflict: false, expectedDeliveryStatus: 'sent', expectedStatus: 200 },
    { conflict: true, expectedDeliveryStatus: 'skipped', expectedStatus: 409 },
  ])('sends the RCP Flex to the selected target and maps conflict=$conflict', async ({ conflict, expectedDeliveryStatus, expectedStatus }) => {
    db.findReceipt.mockResolvedValue(receipt())
    db.findStatements.mockResolvedValue([])
    db.findSetting.mockResolvedValue({ value: 'test-line-token' })
    line.push.mockResolvedValue({ isConflict: conflict, lineRequestId: 'line-request-id' })

    const result = await notifyCustomerReceiptLine('RCP2607-0001', {
      origin: 'https://erp.example.com/base',
      retryKey: 'retry-key',
      targetId: 'C-RCP',
    })

    expect(line.push).toHaveBeenCalledWith(
      'C-RCP',
      expect.arrayContaining([expect.objectContaining({ type: 'flex' })]),
      'test-line-token',
      'retry-key',
      expect.any(AbortSignal),
    )
    expect(JSON.stringify(line.push.mock.calls[0]?.[1]))
      .toContain('https://erp.example.com/sales/receipts?tab=history')
    expect(result).toMatchObject({
      lineRequestId: 'line-request-id',
      sentResults: [{ status: expectedDeliveryStatus, targetId: 'C-RCP' }],
      status: expectedStatus,
    })
  })
})
