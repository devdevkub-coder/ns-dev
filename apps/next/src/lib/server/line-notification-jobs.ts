import { prisma } from './prisma'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadBillLineNotificationSource, notifyBillLine } from './bill-line-notification'
import { loadCustomerReceiptLineNotificationSource, notifyCustomerReceiptLine } from './customer-receipt-line-notification'
import { loadPurchasePaymentLineNotificationSource, notifyPurchasePaymentLine } from './purchase-payment-line-notification'
import { notifyWeightTicketLine } from './weight-ticket-line-notification'
import { findScopedWeightTicket, getWeightTicketUsageCounts, mapWeightTicketRow, type WeightTicketRow } from './weight-tickets'
import { resolveLineTargetsForDocument, resolveLineTargetsForWeightTicket } from './line-notification-routing'

export type JobStatus = 'pending' | 'sent' | 'failed' | 'skipped' | 'processing'
export type LineNotificationSourceType = 'weight_ticket' | 'purchase_bill' | 'sales_bill' | 'purchase_payment' | 'customer_receipt'

export type LineNotificationSource = {
  documentNo: string
  sourceType: LineNotificationSourceType
}

type EnqueueOptions = {
  customMessage?: string
  requestedBy: string
  targetId?: string
  force?: boolean
}

// Check font files path options helper
export function checkFontsAvailability(): { available: boolean; triedPaths: string[] } {
  const triedPaths = [
    join(/*turbopackIgnore: true*/ process.cwd(), 'public/fonts/NotoSansThai-Regular.ttf'),
    join(/*turbopackIgnore: true*/ process.cwd(), 'apps/next/public/fonts/NotoSansThai-Regular.ttf'),
    join(/*turbopackIgnore: true*/ process.cwd(), 'src/assets/fonts/NotoSansThai-Regular.ttf'),
    join(/*turbopackIgnore: true*/ process.cwd(), 'apps/next/src/assets/fonts/NotoSansThai-Regular.ttf'),
  ]
  const available = triedPaths.some(p => existsSync(p))
  return { available, triedPaths }
}

async function loadWeightTicket(documentNo: string) {
  const ticket = await findScopedWeightTicket(documentNo, null)
  if (!ticket) return null
  const usage = await getWeightTicketUsageCounts(prisma, ticket.id)
  return {
    id: ticket.id,
    record: mapWeightTicketRow(ticket as WeightTicketRow, usage),
  }
}

async function loadNotificationSource(source: LineNotificationSource) {
  if (source.sourceType === 'weight_ticket') {
    const loaded = await loadWeightTicket(source.documentNo)
    if (!loaded) return null
    return {
      documentType: loaded.record.type,
      id: loaded.id,
      routingDocument: loaded.record,
    }
  }

  if (source.sourceType === 'purchase_payment') {
    const loaded = await loadPurchasePaymentLineNotificationSource(source.documentNo)
    if (!loaded) return null
    return {
      documentType: loaded.documentType,
      id: loaded.id,
      routingDocument: loaded.routingDocument,
    }
  }

  if (source.sourceType === 'customer_receipt') {
    const loaded = await loadCustomerReceiptLineNotificationSource(source.documentNo)
    if (!loaded) return null
    return {
      documentType: loaded.documentType,
      id: loaded.id,
      routingDocument: loaded.routingDocument,
    }
  }

  const loaded = await loadBillLineNotificationSource(source.sourceType, source.documentNo)
  if (!loaded) return null
  return {
    documentType: loaded.documentType,
    id: loaded.id,
    routingDocument: loaded.routingDocument,
  }
}

function sourceNotFoundMessage(source: LineNotificationSource) {
  if (source.sourceType === 'weight_ticket') {
    return `ไม่พบเอกสารใบชั่งน้ำหนักเลขที่ ${source.documentNo}`
  }
  return `ไม่พบเอกสาร ${source.documentNo}`
}

/**
 * Enqueue a new notification job into line_notification_jobs table.
 */
export async function enqueueNotificationJob(documentNo: string, options: EnqueueOptions) {
  return enqueueNotificationSource({ documentNo, sourceType: 'weight_ticket' }, options)
}

async function enqueueNotificationSource(source: LineNotificationSource, options: EnqueueOptions) {
  if (!options.requestedBy.trim()) throw new Error('ต้องระบุผู้ขอส่ง LINE notification')
  const loaded = await loadNotificationSource(source)
  if (!loaded) {
    throw new Error(sourceNotFoundMessage(source))
  }

  // Resolve Targets
  let targets: Array<{ targetId: string; targetType: string }> = []

  if (options.targetId && options.targetId !== 'routing') {
    // Detect target type
    const targetType = options.targetId.startsWith('U') 
      ? 'user' 
      : options.targetId.startsWith('C') 
      ? 'group' 
      : options.targetId.startsWith('R') 
      ? 'room' 
      : 'unknown'
    targets = [{ targetId: options.targetId, targetType }]
  } else {
    const decisions = source.sourceType === 'weight_ticket'
      ? await resolveLineTargetsForWeightTicket(loaded.routingDocument)
      : await resolveLineTargetsForDocument(loaded.routingDocument, { allowFallback: false })
    targets = decisions.map(d => ({ targetId: d.targetId, targetType: d.targetType }))
  }

  if (targets.length === 0) {
    return {
      status: 'no_targets' as const,
      message: 'ไม่มีเป้าหมายผู้รับสำหรับแจ้งเตือนนี้',
      jobs: []
    }
  }

  const jobsCreated = []

  for (const target of targets) {
    // Avoid duplicate enqueues for the same target and ticket within pending/processing/sent status
    if (!options.force) {
      const existingJob = await prisma.line_notification_jobs.findFirst({
        where: {
          source_type: source.sourceType,
          source_id: loaded.id,
          target_id: target.targetId,
          status: { in: ['pending', 'sent', 'processing'] }
        }
      })

      if (existingJob) {
        jobsCreated.push(existingJob)
        continue
      }
    }

    try {
      const job = await prisma.line_notification_jobs.create({
        data: {
          source_type: source.sourceType,
          source_id: loaded.id,
          document_no: source.documentNo,
          document_type: loaded.documentType,
          target_id: target.targetId,
          target_type: target.targetType,
          custom_message: options.customMessage || null,
          status: 'pending',
          priority: 100,
          requested_by: options.requestedBy.trim(),
          next_retry_at: new Date()
        }
      })
      jobsCreated.push(job)
    } catch (caught: any) {
      // Handle potential race-condition unique constraint violation by fetching the existing job
      if (caught?.code === 'P2002' || String(caught).includes('unique constraint') || String(caught).includes('duplicate key')) {
        // Query for active pending/processing job first
        let existingJob = await prisma.line_notification_jobs.findFirst({
          where: {
            source_type: source.sourceType,
            source_id: loaded.id,
            target_id: target.targetId,
            status: { in: ['pending', 'processing'] }
          },
          orderBy: { id: 'desc' }
        })
        
        // If not found (e.g. it was just sent), fall back to looking for sent status
        if (!existingJob) {
          existingJob = await prisma.line_notification_jobs.findFirst({
            where: {
              source_type: source.sourceType,
              source_id: loaded.id,
              target_id: target.targetId,
              status: 'sent'
            },
            orderBy: { id: 'desc' }
          })
        }

        if (existingJob) {
          jobsCreated.push(existingJob)
          continue
        }
      }
      throw caught
    }
  }

  return {
    status: 'enqueued' as const,
    jobs: jobsCreated.map(j => ({ ...j, id: String(j.id), source_id: String(j.source_id) }))
  }
}

export async function enqueueAndExecuteNotification(source: LineNotificationSource, options: EnqueueOptions) {
  const enqueued = await enqueueNotificationSource(source, options)
  if (enqueued.status !== 'enqueued') {
    return { ...enqueued, executionResults: [] }
  }

  const executionResults = await Promise.all(enqueued.jobs.map((job) =>
    executeNotificationJob(job.id, { force: options.force }),
  ))
  return { ...enqueued, executionResults }
}

/**
 * Execute a single line notification job by ID.
 * Dispatches the queued source to its LINE notification renderer.
 */
export async function executeNotificationJob(jobId: string, options?: { force?: boolean; lockedBy?: string }) {
  const startTime = Date.now()
  const jobBigInt = BigInt(jobId)
  let failureHttpStatus: number | null = null
  let failureCode: string | null = null

  const job = await prisma.line_notification_jobs.findUnique({
    where: { id: jobBigInt }
  })

  if (!job) {
    return { status: 'not_found' as const, error: 'ไม่พบงานแจ้งเตือนนี้' }
  }

  if (job.status === 'sent' && !(options?.force || job.attempt_count === 0)) {
    return { status: 'already_sent' as const, message: 'บิลนี้ถูกส่งไปไลน์กลุ่มนี้เรียบร้อยแล้ว' }
  }

  // Update status to processing and increase attempt if not pre-locked
  let attemptNo = job.attempt_count
  if (options?.lockedBy && job.status === 'processing' && job.locked_by === options.lockedBy) {
    const updated = await prisma.line_notification_jobs.update({
      where: { id: jobBigInt },
      data: {
        attempt_count: { increment: 1 }
      }
    })
    attemptNo = updated.attempt_count
  } else {
    const updated = await prisma.line_notification_jobs.update({
      where: { id: jobBigInt },
      data: {
        status: 'processing',
        attempt_count: { increment: 1 },
        locked_at: new Date(),
        locked_by: options?.lockedBy || ('worker-' + process.pid)
      }
    })
    attemptNo = updated.attempt_count
  }

  try {
    // 2. Fetch app URL for origin
    const appUrlConfig = await prisma.system_settings.findUnique({
      where: { key: 'NEXT_PUBLIC_APP_URL' }
    })
    const appUrl = appUrlConfig?.value?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim()
    if (!appUrl) throw new Error('ยังไม่ได้ตั้งค่า NEXT_PUBLIC_APP_URL สำหรับสร้างลิงก์แจ้งเตือน')

    type NotificationDispatchResult = {
      code?: string
      error?: string
      lineRequestId?: string | null
      pdfUrl?: string
      sentResults?: Array<{ lineRequestId?: string | null }>
      status: number
    }

    let result: NotificationDispatchResult
    if (job.source_type === 'weight_ticket') {
      const requestedBy = job.requested_by?.trim()
      if (!requestedBy) throw new Error(`งานแจ้งเตือน ${job.id.toString()} ไม่มีผู้ขอส่งรายการ`)
      const fonts = checkFontsAvailability()
      if (!fonts.available) {
        throw new Error(`ไม่พบไฟล์ฟอนต์ภาษาไทยสำหรับสร้างเอกสาร PDF (Tried paths: ${fonts.triedPaths.join(', ')})`)
      }
      result = await notifyWeightTicketLine(job.document_no, {
        force: true, // We bypass log check inside notifyWeightTicketLine because we control it here
        targetId: job.target_id,
        customMessage: job.custom_message || undefined,
        requestedBy,
        origin: appUrl,
        scopedBranchIds: null,
        retryKey: String(job.retry_key)
      })
    } else if (job.source_type === 'purchase_bill' || job.source_type === 'sales_bill') {
      result = await notifyBillLine(job.source_type, job.document_no, {
        targetId: job.target_id,
        customMessage: job.custom_message || undefined,
        origin: appUrl,
        retryKey: String(job.retry_key),
      })
    } else if (job.source_type === 'purchase_payment') {
      result = await notifyPurchasePaymentLine(job.document_no, {
        targetId: job.target_id,
        customMessage: job.custom_message || undefined,
        origin: appUrl,
        retryKey: String(job.retry_key),
      })
    } else if (job.source_type === 'customer_receipt') {
      result = await notifyCustomerReceiptLine(job.document_no, {
        targetId: job.target_id,
        customMessage: job.custom_message || undefined,
        origin: appUrl,
        retryKey: String(job.retry_key),
      })
    } else {
      throw new Error(`ไม่รองรับ LINE notification source_type: ${job.source_type}`)
    }

    if (result.status !== 200 && result.status !== 201 && result.status !== 409) {
      failureHttpStatus = result.status
      failureCode = result.code ?? null
      throw new Error(result.error || 'ส่ง LINE Notification ไม่สำเร็จ')
    }
    if (result.code === 'WEIGHT_TICKET_PRINT_IMAGE_NOT_READY') {
      failureHttpStatus = result.status
      failureCode = result.code
      throw new Error(result.error || 'รูปสำหรับพิมพ์ยังไม่พร้อม')
    }

    const isConflict = result.status === 409
    const lineRequestId = result.lineRequestId || result.sentResults?.[0]?.lineRequestId || null
    if (!lineRequestId) {
      failureHttpStatus = result.status
      throw new Error(`LINE ตอบ ${result.status} แต่ไม่มี request ID ยืนยันการรับข้อความ`)
    }

    // 4. Record success
    await prisma.line_notification_jobs.update({
      where: { id: jobBigInt },
      data: {
        status: isConflict ? 'skipped' : 'sent',
        locked_at: null,
        locked_by: null,
        pdf_url: result.pdfUrl || null,
        line_request_id: isConflict ? null : lineRequestId,
        accepted_request_id: isConflict ? lineRequestId : null,
        sent_at: new Date(),
        last_error_code: null,
        last_error_message: null
      }
    })

    // Write attempt log
    await prisma.line_notification_attempts.create({
      data: {
        job_id: jobBigInt,
        attempt_no: attemptNo,
        status: isConflict ? 'skipped' : 'success',
        http_status: isConflict ? 409 : 200,
        line_request_id: isConflict ? null : lineRequestId,
        accepted_request_id: isConflict ? lineRequestId : null,
        duration_ms: Date.now() - startTime
      }
    })

    return { status: (isConflict ? 'skipped' : 'sent') as any, lineRequestId, pdfUrl: result.pdfUrl }

  } catch (caught: any) {
    const errorMsg = caught instanceof Error ? caught.message : String(caught)
    console.error(`[Job ${jobId}] Failed:`, errorMsg)

    const messageHttpStatus = Number(errorMsg.match(/\(([45]\d{2})\)/)?.[1]) || null
    const httpStatus = messageHttpStatus ?? failureHttpStatus
    const isPermanent = httpStatus !== null
      && httpStatus >= 400
      && httpStatus < 500
      && ![408, 409, 429].includes(httpStatus)
    const hasReachedMax = attemptNo >= job.max_attempts
    const finalStatus = (isPermanent || hasReachedMax) ? 'failed' : 'pending'
    const errorCode = failureCode ?? (isPermanent ? 'PERMANENT_ERROR' : 'TRANSIENT_ERROR')

    // Calculate next retry time with exponential backoff (30s, 5m, 15m, 1h)
    const backoffSeconds = attemptNo === 1 ? 30 : attemptNo === 2 ? 300 : attemptNo === 3 ? 900 : 3600
    const nextRetry = new Date(Date.now() + backoffSeconds * 1000)

    await prisma.line_notification_jobs.update({
      where: { id: jobBigInt },
      data: {
        status: finalStatus,
        locked_at: null,
        locked_by: null,
        last_error_code: errorCode,
        last_error_message: errorMsg.slice(0, 500),
        next_retry_at: finalStatus === 'pending' ? nextRetry : job.next_retry_at
      }
    })

    // Write attempt log
    await prisma.line_notification_attempts.create({
      data: {
        job_id: jobBigInt,
        attempt_no: attemptNo,
        status: finalStatus,
        http_status: httpStatus,
        error_code: errorCode,
        error_message: errorMsg.slice(0, 500),
        duration_ms: Date.now() - startTime
      }
    })

    return {
      code: failureCode ?? undefined,
      httpStatus: httpStatus ?? undefined,
      status: finalStatus as any,
      error: errorMsg,
    }
  }
}

/**
 * Worker process function that locking pending jobs and process them.
 */
export async function processPendingNotificationJobs() {
  const now = new Date()
  const workerId = 'worker-' + process.pid + '-' + Math.random().toString(36).slice(2, 9)

  // Use select inside transaction with FOR UPDATE SKIP LOCKED and update status to processing immediately
  const lockedJobs = await prisma.$transaction(async (tx) => {
    const jobs = await tx.$queryRaw<Array<{ id: bigint }>>`
      SELECT id FROM public.line_notification_jobs
      WHERE status = 'pending'
        AND next_retry_at <= ${now}
        AND attempt_count < max_attempts
        AND (locked_at IS NULL OR locked_at < ${new Date(Date.now() - 5 * 60 * 1000)})
      ORDER BY priority DESC, created_at ASC
      LIMIT 5
      FOR UPDATE SKIP LOCKED;
    `
    if (jobs.length === 0) return []

    const jobIds = jobs.map(j => j.id)

    await tx.line_notification_jobs.updateMany({
      where: { id: { in: jobIds } },
      data: {
        status: 'processing',
        locked_at: new Date(),
        locked_by: workerId
      }
    })

    return jobIds
  })

  if (lockedJobs.length === 0) {
    return { processedCount: 0, results: [] }
  }

  const results = []

  for (const jobId of lockedJobs) {
    const jobIdStr = String(jobId)
    const result = await executeNotificationJob(jobIdStr, { lockedBy: workerId })
    results.push({ jobId: jobIdStr, ...result })
  }

  return {
    processedCount: results.length,
    results
  }
}
