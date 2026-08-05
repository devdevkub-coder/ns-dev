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

const billLine = vi.hoisted(() => ({
  load: vi.fn(),
  notify: vi.fn(),
}))

const weightLine = vi.hoisted(() => ({
  notify: vi.fn(),
}))

const weightTicket = vi.hoisted(() => ({
  find: vi.fn(),
  usage: vi.fn(),
  map: vi.fn(),
}))

const routing = vi.hoisted(() => ({
  resolveDocument: vi.fn(),
  resolveWeightTicket: vi.fn(),
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
  loadBillLineNotificationSource: billLine.load,
  notifyBillLine: billLine.notify,
}))

vi.mock('./weight-ticket-line-notification', () => ({ notifyWeightTicketLine: weightLine.notify }))
vi.mock('./weight-tickets', () => ({
  findScopedWeightTicket: weightTicket.find,
  getWeightTicketUsageCounts: weightTicket.usage,
  mapWeightTicketRow: weightTicket.map,
}))
vi.mock('./line-notification-routing', () => ({
  resolveLineTargetsForDocument: routing.resolveDocument,
  resolveLineTargetsForWeightTicket: routing.resolveWeightTicket,
}))

import { enqueueAndExecuteNotification, executeNotificationJob } from './line-notification-jobs'

function job(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  }
}

describe('financial LINE notification jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const defaultJob = job()
    paymentLine.load.mockResolvedValue({
      documentType: 'PMT',
      id: 42n,
      routingDocument: { branchId: '1', partyId: 'SUP-001', type: 'PMT' },
    })
    routing.resolveDocument.mockResolvedValue([{ targetId: 'C-PMT', targetType: 'group' }])
    db.findExistingJob.mockResolvedValue(null)
    db.createJob.mockResolvedValue(defaultJob)
    db.findJob.mockResolvedValue(defaultJob)
    db.updateJob.mockResolvedValue({ ...defaultJob, attempt_count: 1 })
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
    const receiptJob = job({
      document_no: 'RCP2607-0001',
      document_type: 'RCP',
      id: 8n,
      retry_key: 'receipt-retry-key',
      source_id: 43n,
      source_type: 'customer_receipt',
      target_id: 'C-RCP',
    })
    receiptLine.load.mockResolvedValue({
      documentType: 'RCP',
      id: 43n,
      routingDocument: { branchId: '01', customerId: 'CUS-001', partyId: 'CUS-001', type: 'RCP' },
    })
    routing.resolveDocument.mockResolvedValue([{ targetId: 'C-RCP', targetType: 'group' }])
    db.createJob.mockResolvedValue(receiptJob)
    db.findJob.mockResolvedValue(receiptJob)
    db.updateJob.mockResolvedValue({ ...receiptJob, attempt_count: 1 })
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

  it.each([
    ['WTI', 'WTI012608-0021'],
    ['WTO', 'WTO012608-0004'],
  ])('dispatches queued %s jobs with a trusted unscoped lookup', async (documentType, documentNo) => {
    const weightJob = job({
      document_no: documentNo,
      document_type: documentType,
      source_type: 'weight_ticket',
      target_id: 'C-WEIGHT',
    })
    db.findJob.mockResolvedValue(weightJob)
    db.updateJob.mockResolvedValue({ ...weightJob, attempt_count: 1 })
    weightLine.notify.mockResolvedValue({ lineRequestId: 'weight-line-request', status: 200 })

    const result = await executeNotificationJob(String(weightJob.id))

    expect(weightLine.notify).toHaveBeenCalledWith(documentNo, expect.objectContaining({
      scopedBranchIds: null,
      targetId: 'C-WEIGHT',
    }))
    expect(result).toMatchObject({ lineRequestId: 'weight-line-request', status: 'sent' })
  })

  it.each([
    ['purchase_bill', 'PB012608-0009'],
    ['sales_bill', 'SB012608-0004'],
  ])('dispatches queued %s jobs through the bill notification renderer', async (sourceType, documentNo) => {
    const billJob = job({
      document_no: documentNo,
      document_type: sourceType === 'purchase_bill' ? 'PB' : 'SB',
      source_type: sourceType,
      target_id: 'C-BILL',
    })
    db.findJob.mockResolvedValue(billJob)
    db.updateJob.mockResolvedValue({ ...billJob, attempt_count: 1 })
    billLine.notify.mockResolvedValue({ lineRequestId: 'bill-line-request', status: 200 })

    const result = await executeNotificationJob(String(billJob.id))

    expect(billLine.notify).toHaveBeenCalledWith(sourceType, documentNo, expect.objectContaining({
      targetId: 'C-BILL',
    }))
    expect(result).toMatchObject({ lineRequestId: 'bill-line-request', status: 'sent' })
  })

  it('marks a 404 dispatch result as permanent without exhausting all retries', async () => {
    const paymentJob = job()
    db.findJob.mockResolvedValue(paymentJob)
    db.updateJob.mockResolvedValue({ ...paymentJob, attempt_count: 1 })
    paymentLine.notify.mockResolvedValue({ error: 'ไม่พบเอกสารสำหรับส่ง LINE', status: 404 })

    const result = await executeNotificationJob(String(paymentJob.id))

    expect(result).toMatchObject({ status: 'failed' })
    expect(db.updateJob).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        last_error_code: 'PERMANENT_ERROR',
        status: 'failed',
      }),
      where: { id: paymentJob.id },
    })
    expect(db.createAttempt).toHaveBeenCalledWith({
      data: expect.objectContaining({ http_status: 404, status: 'failed' }),
    })
  })

  it('preserves an underlying permanent LINE status returned inside a WTI/WTO wrapper error', async () => {
    const weightJob = job({
      document_no: 'WTI012608-0021',
      document_type: 'WTI',
      source_type: 'weight_ticket',
      target_id: 'C-WEIGHT',
    })
    db.findJob.mockResolvedValue(weightJob)
    db.updateJob.mockResolvedValue({ ...weightJob, attempt_count: 1 })
    weightLine.notify.mockResolvedValue({
      error: 'LINE Push Message ไม่สำเร็จ (404): target not found',
      status: 500,
    })

    const result = await executeNotificationJob(String(weightJob.id))

    expect(result).toMatchObject({ status: 'failed' })
    expect(db.createAttempt).toHaveBeenCalledWith({
      data: expect.objectContaining({
        error_code: 'PERMANENT_ERROR',
        http_status: 404,
        status: 'failed',
      }),
    })
  })

  it.each([200, 409])('does not accept LINE %s without a verifiable request ID', async (httpStatus) => {
    const weightJob = job({
      document_no: 'WTI012608-0021',
      document_type: 'WTI',
      source_type: 'weight_ticket',
      target_id: 'C-WEIGHT',
    })
    db.findJob.mockResolvedValue(weightJob)
    db.updateJob.mockResolvedValue({ ...weightJob, attempt_count: 1 })
    weightLine.notify.mockResolvedValue({
      lineRequestId: null,
      status: httpStatus,
    })

    const result = await executeNotificationJob(String(weightJob.id))

    expect(result).toMatchObject({ status: 'pending' })
    expect(db.createAttempt).toHaveBeenCalledWith({
      data: expect.objectContaining({
        error_code: 'TRANSIENT_ERROR',
        http_status: httpStatus,
        status: 'pending',
      }),
    })
  })

  it.each([408, 409, 429])('keeps retryable LINE %s responses pending', async (httpStatus) => {
    const weightJob = job({
      document_no: 'WTI012608-0021',
      document_type: 'WTI',
      source_type: 'weight_ticket',
      target_id: 'C-WEIGHT',
    })
    db.findJob.mockResolvedValue(weightJob)
    db.updateJob.mockResolvedValue({ ...weightJob, attempt_count: 1 })
    weightLine.notify.mockResolvedValue({
      error: `LINE Push Message ไม่สำเร็จ (${httpStatus}): retry later`,
      status: 502,
    })

    const result = await executeNotificationJob(String(weightJob.id))

    expect(result).toMatchObject({ status: 'pending' })
    expect(db.createAttempt).toHaveBeenCalledWith({
      data: expect.objectContaining({
        error_code: 'TRANSIENT_ERROR',
        http_status: httpStatus,
        status: 'pending',
      }),
    })
  })
})
