import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  createAttempt: vi.fn(),
  createJob: vi.fn(),
  findExistingJob: vi.fn(),
  findJob: vi.fn(),
  findSetting: vi.fn(),
  updateJob: vi.fn(),
}))

const paymentLine = vi.hoisted(() => ({
  load: vi.fn(),
  notify: vi.fn(),
}))

const receiptLine = vi.hoisted(() => ({
  load: vi.fn(),
  notify: vi.fn(),
}))

const routing = vi.hoisted(() => ({
  resolveDocument: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    line_notification_attempts: { create: db.createAttempt },
    line_notification_jobs: {
      create: db.createJob,
      findFirst: db.findExistingJob,
      findUnique: db.findJob,
      update: db.updateJob,
    },
    system_settings: { findUnique: db.findSetting },
  },
}))

vi.mock('./purchase-payment-line-notification', () => ({
  loadPurchasePaymentLineNotificationSource: paymentLine.load,
  notifyPurchasePaymentLine: paymentLine.notify,
}))

vi.mock('./customer-receipt-line-notification', () => ({
  loadCustomerReceiptLineNotificationSource: receiptLine.load,
  notifyCustomerReceiptLine: receiptLine.notify,
}))

vi.mock('./bill-line-notification', () => ({
  loadBillLineNotificationSource: vi.fn(),
  notifyBillLine: vi.fn(),
}))

vi.mock('./weight-ticket-line-notification', () => ({ notifyWeightTicketLine: vi.fn() }))
vi.mock('./weight-tickets', () => ({
  findScopedWeightTicket: vi.fn(),
  getWeightTicketUsageCounts: vi.fn(),
  mapWeightTicketRow: vi.fn(),
}))
vi.mock('./line-notification-routing', () => ({
  resolveLineTargetsForDocument: routing.resolveDocument,
  resolveLineTargetsForWeightTicket: vi.fn(),
}))

import { enqueueAndExecuteNotification } from './line-notification-jobs'

describe('financial LINE notification jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const job = {
      attempt_count: 0,
      custom_message: null,
      document_no: 'PMT012607-0001',
      document_type: 'PMT',
      id: 7n,
      locked_by: null,
      max_attempts: 5,
      next_retry_at: new Date(),
      requested_by: 'tester',
      retry_key: 'retry-key',
      source_id: 42n,
      source_type: 'purchase_payment',
      status: 'pending',
      target_id: 'C-PMT',
      target_type: 'group',
    }
    paymentLine.load.mockResolvedValue({
      documentType: 'PMT',
      id: 42n,
      routingDocument: { branchId: '1', partyId: 'SUP-001', type: 'PMT' },
    })
    routing.resolveDocument.mockResolvedValue([{ targetId: 'C-PMT', targetType: 'group' }])
    db.findExistingJob.mockResolvedValue(null)
    db.createJob.mockResolvedValue(job)
    db.findJob.mockResolvedValue(job)
    db.updateJob.mockResolvedValue({ ...job, attempt_count: 1 })
    db.findSetting.mockResolvedValue({ value: 'https://erp.example.com' })
    paymentLine.notify.mockResolvedValue({ lineRequestId: 'line-request', status: 200 })
    db.createAttempt.mockResolvedValue({ id: 1n })
  })

  it('uses explicit PMT routing and dispatches the queued purchase_payment source', async () => {
    const result = await enqueueAndExecuteNotification(
      { documentNo: 'PMT012607-0001', sourceType: 'purchase_payment' },
      { force: false, requestedBy: 'tester' },
    )

    expect(routing.resolveDocument).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PMT' }),
      { allowFallback: false },
    )
    expect(db.createJob).toHaveBeenCalledWith({
      data: expect.objectContaining({
        document_type: 'PMT',
        source_id: 42n,
        source_type: 'purchase_payment',
        target_id: 'C-PMT',
      }),
    })
    expect(paymentLine.notify).toHaveBeenCalledWith('PMT012607-0001', expect.objectContaining({
      origin: 'https://erp.example.com',
      targetId: 'C-PMT',
    }))
    expect(result.executionResults).toEqual([{ lineRequestId: 'line-request', pdfUrl: undefined, status: 'sent' }])
  })

  it('uses explicit RCP routing and dispatches the queued customer_receipt source', async () => {
    const job = {
      attempt_count: 0,
      custom_message: null,
      document_no: 'RCP2607-0001',
      document_type: 'RCP',
      id: 8n,
      locked_by: null,
      max_attempts: 5,
      next_retry_at: new Date(),
      requested_by: 'tester',
      retry_key: 'receipt-retry-key',
      source_id: 43n,
      source_type: 'customer_receipt',
      status: 'pending',
      target_id: 'C-RCP',
      target_type: 'group',
    }
    receiptLine.load.mockResolvedValue({
      documentType: 'RCP',
      id: 43n,
      routingDocument: { branchId: '01', customerId: 'CUS-001', partyId: 'CUS-001', type: 'RCP' },
    })
    routing.resolveDocument.mockResolvedValue([{ targetId: 'C-RCP', targetType: 'group' }])
    db.createJob.mockResolvedValue(job)
    db.findJob.mockResolvedValue(job)
    db.updateJob.mockResolvedValue({ ...job, attempt_count: 1 })
    receiptLine.notify.mockResolvedValue({ lineRequestId: 'receipt-line-request', status: 200 })

    const result = await enqueueAndExecuteNotification(
      { documentNo: 'RCP2607-0001', sourceType: 'customer_receipt' },
      { force: false, requestedBy: 'tester' },
    )

    expect(routing.resolveDocument).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RCP' }),
      { allowFallback: false },
    )
    expect(db.createJob).toHaveBeenCalledWith({
      data: expect.objectContaining({
        document_type: 'RCP',
        source_id: 43n,
        source_type: 'customer_receipt',
        target_id: 'C-RCP',
      }),
    })
    expect(receiptLine.notify).toHaveBeenCalledWith('RCP2607-0001', expect.objectContaining({
      origin: 'https://erp.example.com',
      targetId: 'C-RCP',
    }))
    expect(result.executionResults).toEqual([{ lineRequestId: 'receipt-line-request', pdfUrl: undefined, status: 'sent' }])
  })
})
