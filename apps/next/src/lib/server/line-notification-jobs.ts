import { prisma } from './prisma'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { notifyWeightTicketLine } from './weight-ticket-line-notification'
import { findScopedWeightTicket, getWeightTicketUsageCounts, mapWeightTicketRow, type WeightTicketRow } from './weight-tickets'
import { resolveLineTargetsForWeightTicket } from './line-notification-routing'

export type JobStatus = 'pending' | 'sent' | 'failed' | 'skipped' | 'processing'

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
  const ticket = await findScopedWeightTicket(documentNo, [])
  if (!ticket) return null
  const usage = await getWeightTicketUsageCounts(prisma, ticket.id)
  return {
    id: ticket.id,
    record: mapWeightTicketRow(ticket as WeightTicketRow, usage),
  }
}

/**
 * Enqueue a new notification job into line_notification_jobs table.
 */
export async function enqueueNotificationJob(documentNo: string, options: EnqueueOptions) {
  const loaded = await loadWeightTicket(documentNo)
  if (!loaded) {
    throw new Error(`ไม่พบเอกสารใบชั่งน้ำหนักเลขที่ ${documentNo}`)
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
    // Call our newly created Routing Engine
    const decisions = await resolveLineTargetsForWeightTicket(loaded.record)
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
          source_type: 'weight_ticket',
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
          source_type: 'weight_ticket',
          source_id: loaded.id,
          document_no: documentNo,
          document_type: loaded.record.type,
          target_id: target.targetId,
          target_type: target.targetType,
          custom_message: options.customMessage || null,
          status: 'pending',
          priority: 100,
          requested_by: options.requestedBy || 'system',
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
            source_type: 'weight_ticket',
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
              source_type: 'weight_ticket',
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

/**
 * Execute a single line notification job by ID.
 * Uses notifyWeightTicketLine helper to run actual PDF and LINE push logic.
 */
export async function executeNotificationJob(jobId: string, options?: { force?: boolean; lockedBy?: string }) {
  const startTime = Date.now()
  const jobBigInt = BigInt(jobId)

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
    const appUrl = appUrlConfig?.value || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Check fonts availability first
    const fonts = checkFontsAvailability()
    if (!fonts.available) {
      throw new Error(`ไม่พบไฟล์ฟอนต์ภาษาไทยสำหรับสร้างเอกสาร PDF (Tried paths: ${fonts.triedPaths.join(', ')})`)
    }

    // 3. Delegate execution to notifyWeightTicketLine
    const result = await notifyWeightTicketLine(job.document_no, {
      force: true, // We bypass log check inside notifyWeightTicketLine because we control it here
      targetId: job.target_id,
      customMessage: job.custom_message || undefined,
      requestedBy: job.requested_by || 'system',
      origin: appUrl,
      scopedBranchIds: [],
      retryKey: String(job.retry_key)
    })

    if (result.status !== 200 && result.status !== 201 && result.status !== 409) {
      throw new Error(result.error || 'ส่ง LINE Notification ไม่สำเร็จ')
    }

    const isConflict = result.status === 409
    const lineRequestId = result.lineRequestId || result.sentResults?.[0]?.lineRequestId || null

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

    // Check if error is permanent (e.g. invalid target group id, token expired)
    const isPermanent = errorMsg.includes('400') || errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('404')
    const hasReachedMax = attemptNo >= job.max_attempts
    const finalStatus = (isPermanent || hasReachedMax) ? 'failed' : 'pending'

    // Calculate next retry time with exponential backoff (30s, 5m, 15m, 1h)
    const backoffSeconds = attemptNo === 1 ? 30 : attemptNo === 2 ? 300 : attemptNo === 3 ? 900 : 3600
    const nextRetry = new Date(Date.now() + backoffSeconds * 1000)

    await prisma.line_notification_jobs.update({
      where: { id: jobBigInt },
      data: {
        status: finalStatus,
        locked_at: null,
        locked_by: null,
        last_error_code: isPermanent ? 'PERMANENT_ERROR' : 'TRANSIENT_ERROR',
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
        error_code: isPermanent ? 'PERMANENT_ERROR' : 'TRANSIENT_ERROR',
        error_message: errorMsg.slice(0, 500),
        duration_ms: Date.now() - startTime
      }
    })

    return { status: finalStatus as any, error: errorMsg }
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
