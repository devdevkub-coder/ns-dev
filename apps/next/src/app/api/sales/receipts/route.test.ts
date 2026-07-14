import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cancelCustomerReceipt: vi.fn(),
  createCustomerReceipt: vi.fn(),
  enqueueAndExecuteNotification: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  replaceCustomerReceipt: vi.fn(),
}))

vi.mock('@/lib/daily', () => ({
  customerReceiptFormSchema: { parse: vi.fn((value: unknown) => value) },
}))
vi.mock('@/lib/server/api-error', () => ({
  apiErrorResponse: vi.fn((_error: unknown, message: string, status: number) => Response.json({ error: message }, { status })),
}))
vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class AuthContextError extends Error {},
  authContextErrorResponse: vi.fn(),
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  requirePermission: vi.fn(),
}))
vi.mock('@/lib/server/customer-receipts', () => ({
  cancelCustomerReceipt: mocks.cancelCustomerReceipt,
  createCustomerReceipt: mocks.createCustomerReceipt,
  replaceCustomerReceipt: mocks.replaceCustomerReceipt,
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
