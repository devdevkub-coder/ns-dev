import { readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const componentDirectory = dirname(fileURLToPath(import.meta.url))
const sourceRoot = join(componentDirectory, '..')
const sourceDirectories = [join(sourceRoot, 'app'), join(sourceRoot, 'components')]

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return extname(entry.name) === '.tsx' && !entry.name.includes('.test.') ? [path] : []
  })
}

type SourceFile = { path: string; text: string }

const activeSource = sourceDirectories.flatMap(sourceFiles).map((path) => ({
  path: relative(sourceRoot, path).replaceAll('\\', '/'),
  text: readFileSync(path, 'utf8'),
}))

const csvActionAllowlist = new Map([
  // These handlers produce CSV by contract and must not be represented as Excel exports.
  ['app/admin/audit/AuditLogPageClient.tsx', 'ส่งออก CSV'],
  ['components/production/ProductionReportPageClient.tsx', 'ส่งออก CSV'],
])

const compactExcelActionAllowlist = new Map([
  // This is the detail-dialog helper, not a page-level action; it intentionally stays compact at small breakpoints.
  ['components/stock/StockOperationPageClient.tsx', 'sm:h-9'],
])

const pageActionContracts = [
  ['components/main/SalesPlanAnalysisDashboard.tsx', 'h-10', 'bg-emerald-600', 'size-4'],
  ['components/main/MainSalesControlClients.tsx', 'h-10', 'bg-blue-600', 'size-4'],
  ['app/admin/transaction-ledger/TransactionLedgerPageClient.tsx', 'h-10', 'bg-emerald-600', 'size-4'],
  ['components/stock/StockPlanningPageClient.tsx', 'h-10', 'variant="export"', 'size-4'],
  ['components/purchase-flow/AdvancePaymentsPageClient.tsx', 'h-10', 'size-4'],
  ['components/finance/CashPositionPageClient.tsx', 'h-10', 'bg-emerald-600', 'size-4'],
  ['components/finance/foreign/FcdLedgerPageClient.tsx', 'h-10', 'bg-emerald-600', 'size-4'],
] as const

describe('page action source contract', () => {
  it('rejects compact Excel page-action markup while documenting the one modal helper exception', () => {
    const compactActionFiles = activeSource
      .filter((file) => [...file.text.matchAll(/<(?:button|a)\b(?:(?!<\/(?:button|a)>)[\s\S]){0,900}?ส่งออก Excel/g)]
        .some((action) => /(?:\bh-9\b|\bsm:h-9\b)/.test(action[0])))
      .map((file) => file.path)

    expect(compactActionFiles).toEqual([...compactExcelActionAllowlist.keys()])
    for (const [path, marker] of compactExcelActionAllowlist) expect(activeSource.find((file) => file.path === path)?.text).toContain(marker)
  })

  it('keeps the audited page-action inventory at h-10 with the required visual affordances', () => {
    for (const [path, ...requiredMarkers] of pageActionContracts) {
      const text = activeSource.find((file) => file.path === path)?.text
      expect(text, path).toBeDefined()
      for (const marker of requiredMarkers) expect(text, `${path}: ${marker}`).toContain(marker)
      expect(text, `${path}: ส่งออก Excel`).toContain('ส่งออก Excel')
    }

    const auditLog = activeSource.find((file) => file.path === 'app/admin/audit/AuditLogPageClient.tsx')?.text
    expect(auditLog).toContain('exportAuditCsv(sortedRows)')
    expect(auditLog).toContain('h-10')
    expect(auditLog).toContain('ส่งออก CSV')
  })

  it('uses only the exact Thai Excel label and documents the two real CSV exceptions', () => {
    const englishExcelLabels = activeSource
      .filter((file) => /(?:^|[>\s])Export Excel(?:[<\s]|$)/.test(file.text))
      .map((file) => file.path)
    const csvLabels = activeSource
      .filter((file) => file.text.includes('ส่งออก CSV'))
      .map((file) => file.path)

    expect(englishExcelLabels).toEqual([])
    expect(csvLabels.sort()).toEqual([...csvActionAllowlist.keys()].sort())
    for (const [path, label] of csvActionAllowlist) expect(activeSource.find((file) => file.path === path)?.text).toContain(label)
  })
})
