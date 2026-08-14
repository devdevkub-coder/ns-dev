import nextEnv from '@next/env'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Prisma } from '../generated/prisma/client'

const SIT_PROJECT_REF = 'vbjlkxbytccklhqvxjuu'

const SYSTEM_CANCELLATION_NOTE_PREFIX = 'Cancelled from Sales Bill '

type RepairLine = {
  id: bigint
  line_no: number
  notes: string | null
  product_code_snapshot: string
  status: string
}

export type RepairBill = {
  cancel_note: string | null
  doc_no: string
  id: bigint
  items: unknown
  sales_bill_lines: RepairLine[]
  status: string | null
}

type NormalizedSnapshotItem = {
  lineNo: number
  note: unknown
  productCode: string
}

export type SalesBillCancellationNoteRepairCandidate = {
  billDocNo: string
  billId: string
  currentNote: string
  lineId: string
  lineNo: number
  productCode: string
  restoreNote: string | null
}

export type SalesBillCancellationNoteRepairSkipReason =
  | 'line_status'
  | 'note_mismatch'
  | 'snapshot_match'
  | 'snapshot_note'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeSnapshotItem(value: unknown, index: number): NormalizedSnapshotItem | null {
  if (!isRecord(value)) return null
  const rawLineNo = value.lineNo
  const lineNo = rawLineNo == null
    ? index + 1
    : typeof rawLineNo === 'number' && Number.isInteger(rawLineNo) && rawLineNo > 0
      ? rawLineNo
      : typeof rawLineNo === 'string' && /^[1-9]\d*$/.test(rawLineNo)
        ? Number(rawLineNo)
        : null
  if (lineNo == null) return null

  const rawProductCode = value.productCode ?? value.productId
  if (typeof rawProductCode !== 'string' || !rawProductCode.trim()) return null

  return {
    lineNo,
    note: value.note === undefined ? null : value.note,
    productCode: rawProductCode.trim(),
  }
}

export function collectSalesBillCancellationNoteRepairCandidates(
  bills: RepairBill[],
): {
  candidates: SalesBillCancellationNoteRepairCandidate[]
  skipped: Array<{
    billDocNo: string
    lineId: string
    reason: SalesBillCancellationNoteRepairSkipReason
  }>
} {
  const candidates: SalesBillCancellationNoteRepairCandidate[] = []
  const skipped: Array<{
    billDocNo: string
    lineId: string
    reason: SalesBillCancellationNoteRepairSkipReason
  }> = []

  for (const bill of bills) {
    if (!['cancelled', 'canceled'].includes(String(bill.status).toLowerCase())) continue
    const cancelNote = bill.cancel_note?.trim()
    if (!cancelNote || !Array.isArray(bill.items)) continue
    const expectedSystemNote = `${SYSTEM_CANCELLATION_NOTE_PREFIX}${bill.doc_no}: ${cancelNote}`

    for (const line of bill.sales_bill_lines) {
      if (typeof line.notes !== 'string' || !line.notes.startsWith(SYSTEM_CANCELLATION_NOTE_PREFIX)) continue
      if (!['cancelled', 'canceled'].includes(String(line.status).toLowerCase())) {
        skipped.push({ billDocNo: bill.doc_no, lineId: String(line.id), reason: 'line_status' })
        continue
      }
      if (line.notes !== expectedSystemNote) {
        skipped.push({ billDocNo: bill.doc_no, lineId: String(line.id), reason: 'note_mismatch' })
        continue
      }

      const snapshotMatches = bill.items
        .map((value, index) => normalizeSnapshotItem(value, index))
        .filter((item) => item != null)
        .filter((item) => (
          item.lineNo === line.line_no
          && item.productCode === line.product_code_snapshot
        ))

      if (snapshotMatches.length !== 1) {
        skipped.push({ billDocNo: bill.doc_no, lineId: String(line.id), reason: 'snapshot_match' })
        continue
      }
      const snapshot = snapshotMatches[0]
      if (snapshot.note !== null && typeof snapshot.note !== 'string') {
        skipped.push({ billDocNo: bill.doc_no, lineId: String(line.id), reason: 'snapshot_note' })
        continue
      }

      candidates.push({
        billDocNo: bill.doc_no,
        billId: String(bill.id),
        currentNote: line.notes,
        lineId: String(line.id),
        lineNo: line.line_no,
        productCode: line.product_code_snapshot,
        restoreNote: snapshot.note,
      })
    }
  }

  return { candidates, skipped }
}

export function salesBillCancellationNoteRepairFingerprint(
  candidates: SalesBillCancellationNoteRepairCandidate[],
): string {
  const stableRows = [...candidates]
    .sort((left, right) => (
      left.billDocNo.localeCompare(right.billDocNo)
      || left.lineNo - right.lineNo
      || left.lineId.localeCompare(right.lineId)
    ))
  return createHash('sha256').update(JSON.stringify(stableRows)).digest('hex')
}

function requiredEnv(name: 'DATABASE_URL' | 'NEXT_PUBLIC_SUPABASE_URL') {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function assertSitTarget() {
  const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL')
  const databaseUrl = requiredEnv('DATABASE_URL')
  if (new URL(supabaseUrl).hostname.split('.')[0] !== SIT_PROJECT_REF) {
    throw new Error('repair target must be SIT')
  }
  if (!databaseUrl.includes(SIT_PROJECT_REF)) {
    throw new Error('DATABASE_URL does not match the SIT project')
  }
}

function argumentValue(name: string) {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1)
}

type RepairCliOptions = {
  apply: boolean
  expectedCount: number | null
  expectedFingerprint: string | null
}

function parseRepairCliOptions(): RepairCliOptions {
  const apply = process.argv.includes('--apply')
  const expectedCountText = argumentValue('--expected-count')
  const expectedFingerprint = argumentValue('--expected-fingerprint') ?? null
  const expectedCount = expectedCountText == null ? null : Number(expectedCountText)
  if (apply && (!Number.isInteger(expectedCount) || expectedCount! < 1)) {
    throw new Error('--apply requires a positive --expected-count')
  }
  if (apply && !/^[a-f0-9]{64}$/.test(expectedFingerprint ?? '')) {
    throw new Error('--apply requires a SHA-256 --expected-fingerprint')
  }
  return { apply, expectedCount, expectedFingerprint }
}

async function loadRepairBills(
  client: Pick<Prisma.TransactionClient, 'sales_bills'>,
): Promise<RepairBill[]> {
  return client.sales_bills.findMany({
    orderBy: { doc_no: 'asc' },
    select: {
      cancel_note: true,
      doc_no: true,
      id: true,
      items: true,
      sales_bill_lines: {
        orderBy: { line_no: 'asc' },
        select: {
          id: true,
          line_no: true,
          notes: true,
          product_code_snapshot: true,
          status: true,
        },
      },
      status: true,
    },
    where: {
      cancel_note: { not: null },
      status: { in: ['cancelled', 'canceled'] },
    },
  })
}

async function main() {
  nextEnv.loadEnvConfig(fileURLToPath(new URL('..', import.meta.url)))
  assertSitTarget()
  const options = parseRepairCliOptions()

  const { prisma } = await import('../src/lib/server/prisma')

  const bills = await loadRepairBills(prisma)
  const plan = collectSalesBillCancellationNoteRepairCandidates(bills)
  const fingerprint = salesBillCancellationNoteRepairFingerprint(plan.candidates)

  if (!options.apply) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      projectRef: SIT_PROJECT_REF,
      candidateCount: plan.candidates.length,
      bills: [...new Set(plan.candidates.map((candidate) => candidate.billDocNo))].sort(),
      lines: plan.candidates.map((candidate) => ({
        billDocNo: candidate.billDocNo,
        lineNo: candidate.lineNo,
        productCode: candidate.productCode,
        restoreMode: candidate.restoreNote === null ? 'NULL' : 'SNAPSHOT',
      })),
      skipped: plan.skipped,
      fingerprint,
    }))
    return
  }

  if (options.expectedCount === null || options.expectedFingerprint === null) {
    throw new Error('--apply requires --expected-count and --expected-fingerprint')
  }
  if (plan.candidates.length !== options.expectedCount) {
    throw new Error('candidate count changed after dry-run')
  }
  if (fingerprint !== options.expectedFingerprint) {
    throw new Error('candidate fingerprint changed after dry-run')
  }
  if (plan.skipped.length > 0) {
    throw new Error('ambiguous cancellation-note rows require manual review')
  }

  await prisma.$transaction(async (tx) => {
    const currentBills = await loadRepairBills(tx)
    const currentPlan = collectSalesBillCancellationNoteRepairCandidates(currentBills)
    const currentFingerprint = salesBillCancellationNoteRepairFingerprint(currentPlan.candidates)

    if (currentPlan.candidates.length !== options.expectedCount) {
      throw new Error('candidate count changed after dry-run')
    }
    if (currentFingerprint !== options.expectedFingerprint) {
      throw new Error('candidate fingerprint changed after dry-run')
    }
    if (currentPlan.skipped.length > 0) {
      throw new Error('ambiguous cancellation-note rows require manual review')
    }

    for (const candidate of currentPlan.candidates) {
      const result = await tx.sales_bill_lines.updateMany({
        data: { notes: candidate.restoreNote },
        where: {
          id: BigInt(candidate.lineId),
          notes: candidate.currentNote,
          status: { in: ['cancelled', 'canceled'] },
        },
      })
      if (result.count !== 1) throw new Error(`compare-and-set failed for line ${candidate.lineId}`)
    }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 30_000,
  })

  const postBills = await loadRepairBills(prisma)
  const postPlan = collectSalesBillCancellationNoteRepairCandidates(postBills)
  if (postPlan.candidates.length !== 0) {
    throw new Error('postflight: exact contaminated candidates still remain')
  }

  console.log(JSON.stringify({
    mode: 'apply',
    projectRef: SIT_PROJECT_REF,
    appliedCount: plan.candidates.length,
    fingerprint,
    postflightCandidateCount: 0,
  }))
}

const isDirectExecution = Boolean(
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)

if (isDirectExecution) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
