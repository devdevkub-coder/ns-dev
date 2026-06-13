import { prisma } from '@/lib/server/prisma'

type RawProductionReconciliationIssue = Record<string, unknown>

export type ProductionReconciliationIssue = {
  actualQty: number
  actualValue: number
  details: Record<string, unknown>
  docNo: string
  expectedQty: number
  expectedValue: number
  issue: string
  orderDocNo: string
  refType: string
}

function text(value: unknown) {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function num(value: unknown) {
  if (value == null) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') return value.toNumber()
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

function mapIssue(row: RawProductionReconciliationIssue): ProductionReconciliationIssue {
  return {
    actualQty: num(row.actual_qty),
    actualValue: num(row.actual_value),
    details: jsonObject(row.details),
    docNo: text(row.doc_no),
    expectedQty: num(row.expected_qty),
    expectedValue: num(row.expected_value),
    issue: text(row.issue),
    orderDocNo: text(row.order_doc_no),
    refType: text(row.ref_type),
  }
}

export async function buildProductionReconciliationReport() {
  const rows = await prisma.$queryRaw<RawProductionReconciliationIssue[]>`
    select
      issue,
      ref_type,
      doc_no,
      order_doc_no,
      expected_qty,
      actual_qty,
      expected_value,
      actual_value,
      details
    from public.production_reconciliation_issues
    order by issue, order_doc_no, doc_no
    limit 500
  `

  const issues = rows.map(mapIssue)
  const byIssue = issues.reduce<Record<string, number>>((acc, row) => {
    acc[row.issue] = (acc[row.issue] ?? 0) + 1
    return acc
  }, {})
  const byRefType = issues.reduce<Record<string, number>>((acc, row) => {
    acc[row.refType] = (acc[row.refType] ?? 0) + 1
    return acc
  }, {})

  return {
    issues,
    summary: {
      byIssue,
      byRefType,
      hasIssues: issues.length > 0,
      issueCount: issues.length,
      limit: 500,
    },
  }
}
