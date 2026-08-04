import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  customerReceiptParse: vi.fn((value: unknown) => value),
  cancelCustomerReceipt: vi.fn(),
  createCustomerReceipt: vi.fn(),
  enqueueAndExecuteNotification: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  requirePermission: vi.fn(),
  replaceCustomerReceipt: vi.fn(),
}))

vi.mock('@/lib/daily', () => ({
  customerReceiptFormSchema: { parse: mocks.customerReceiptParse },
}))
vi.mock('@/lib/server/api-error', () => ({
  apiErrorResponse: vi.fn((_error: unknown, message: string, status: number) => Response.json({ error: message }, { status })),
}))
vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class AuthContextError extends Error {},
  authContextErrorResponse: vi.fn(),
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  requirePermission: mocks.requirePermission,
}))
vi.mock('@/lib/server/customer-receipts', () => ({
  cancelCustomerReceipt: mocks.cancelCustomerReceipt,
  createCustomerReceipt: mocks.createCustomerReceipt,
  replaceCustomerReceipt: mocks.replaceCustomerReceipt,
}))
vi.mock('@/lib/server/finance-currency-policy', () => ({
  getFinanceCurrencyPolicy: vi.fn(),
}))
vi.mock('@/lib/server/daily', () => ({
  currentActor: vi.fn(() => 'tester@example.com'),
  listDailyAccounts: vi.fn(),
  nextDailyDocNo: vi.fn(),
  normalizeDate: vi.fn(),
  toDateOnly: vi.fn(),
  toNumber: vi.fn(),
}))
vi.mock('@/lib/server/line-notification-jobs', () => ({
  enqueueAndExecuteNotification: mocks.enqueueAndExecuteNotification,
}))
vi.mock('@/lib/server/payment-methods', () => ({ getActivePaymentMethods: vi.fn() }))
vi.mock('@/lib/server/prisma', () => ({ prisma: {} }))

import { PATCH, POST } from './route'

const context = { appUser: { email: 'tester@example.com' }, authUser: { email: 'tester@example.com' } }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue(context)
  mocks.createCustomerReceipt.mockResolvedValue({ id: 'RCP2607-0001' })
  mocks.replaceCustomerReceipt.mockResolvedValue({ id: 'RCP2607-0002', replacedId: 'RCP2607-0001' })
  mocks.cancelCustomerReceipt.mockResolvedValue({ id: 'RCP2607-0001', status: 'cancelled' })
  mocks.enqueueAndExecuteNotification.mockResolvedValue({ status: 'enqueued' })
})

describe('customer receipt LINE post-commit trigger', () => {
  it('enqueues the committed RCP returned by create', async () => {
    const response = await POST(new Request('http://localhost/api/sales/receipts', {
      body: JSON.stringify({ customerId: 'CUS-001' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 'RCP2607-0001' })
    expect(mocks.enqueueAndExecuteNotification).toHaveBeenCalledWith(
      { documentNo: 'RCP2607-0001', sourceType: 'customer_receipt' },
      { force: false, requestedBy: 'tester@example.com' },
    )
  })

  it('returns the saved RCP even when LINE delivery throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.enqueueAndExecuteNotification.mockRejectedValue(new Error('LINE unavailable'))

    const response = await POST(new Request('http://localhost/api/sales/receipts', {
      body: JSON.stringify({ customerId: 'CUS-001' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 'RCP2607-0001' })
    expect(errorSpy).toHaveBeenCalledWith('[customer_receipt] LINE notification failed', expect.any(Error))
    errorSpy.mockRestore()
  })

  it('notifies the new RCP from cancel-and-reissue, not the replaced document', async () => {
    const response = await PATCH(new Request('http://localhost/api/sales/receipts', {
      body: JSON.stringify({
        action: 'replace',
        docNo: 'RCP2607-0001',
        reason: 'แก้ไขยอดรับ',
        values: { customerId: 'CUS-001' },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    }))

    expect(response.status).toBe(200)
    expect(mocks.enqueueAndExecuteNotification).toHaveBeenCalledWith(
      { documentNo: 'RCP2607-0002', sourceType: 'customer_receipt' },
      { force: false, requestedBy: 'tester@example.com' },
    )
  })

  it('does not notify when an RCP is cancelled', async () => {
    const response = await PATCH(new Request('http://localhost/api/sales/receipts', {
      body: JSON.stringify({ action: 'cancel', docNo: 'RCP2607-0001', reason: 'ยกเลิก' }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    }))

    expect(response.status).toBe(200)
    expect(mocks.cancelCustomerReceipt).toHaveBeenCalled()
    expect(mocks.enqueueAndExecuteNotification).not.toHaveBeenCalled()
  })
})

describe('customer receipt API boundary', () => {
  it('requires the receipt permission before parsing or calling the foreign receipt writer', async () => {
    const response = await POST(new Request('http://localhost/api/sales/receipts', {
      body: JSON.stringify({ customerId: 'CUS-001' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    expect(mocks.requirePermission).toHaveBeenCalledWith(context, 'sales.bills.receive')
    expect(mocks.requirePermission.mock.invocationCallOrder[0]).toBeLessThan(mocks.customerReceiptParse.mock.invocationCallOrder[0]!)
    expect(mocks.customerReceiptParse.mock.invocationCallOrder[0]).toBeLessThan(mocks.createCustomerReceipt.mock.invocationCallOrder[0]!)
  })

  it('rejects malformed foreign rate input before it can reach the writer', async () => {
    mocks.customerReceiptParse.mockImplementationOnce(() => {
      throw new Error('อัตราแลกเปลี่ยนต้องมีทศนิยมไม่เกิน 2 ตำแหน่ง')
    })

    const response = await POST(new Request('http://localhost/api/sales/receipts', {
      body: JSON.stringify({ fxRate: 35.123, receiptCurrencyCode: 'USD' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))

    expect(response.status).toBe(400)
    expect(mocks.createCustomerReceipt).not.toHaveBeenCalled()
  })

  it('passes the foreign rate snapshot through unchanged for server-side validation and idempotent posting', async () => {
    const values = {
      customerId: 'CUS-001',
      customerTransferredNativeAmount: 100,
      fxRate: 35.12,
      receiptCurrencyCode: 'USD',
    }
    mocks.customerReceiptParse.mockReturnValueOnce(values)

    const response = await POST(new Request('http://localhost/api/sales/receipts', {
      body: JSON.stringify(values),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    expect(mocks.createCustomerReceipt).toHaveBeenCalledWith(values, context)
  })

  it('uses the cancellation path without sending a post-commit notification', async () => {
    const response = await PATCH(new Request('http://localhost/api/sales/receipts', {
      body: JSON.stringify({ action: 'cancel', docNo: 'RCP2607-0001', reason: 'ยกเลิก' }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    }))

    expect(response.status).toBe(200)
    expect(mocks.requirePermission).toHaveBeenCalledWith(context, 'sales.bills.cancel')
    expect(mocks.cancelCustomerReceipt).toHaveBeenCalledWith('RCP2607-0001', 'ยกเลิก', context)
    expect(mocks.enqueueAndExecuteNotification).not.toHaveBeenCalled()
  })
})
