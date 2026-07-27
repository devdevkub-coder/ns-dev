import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const clientPath = fileURLToPath(new URL('./StockPlanningPageClient.tsx', import.meta.url))

describe('Stock Planning design contract', () => {
  it('uses the shared page hierarchy and compact responsive filters', async () => {
    const client = await readFile(clientPath, 'utf8')

    expect(client).toContain("import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'")
    expect(client).toContain("import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'")
    expect(client).toContain('data-stock-planning-filter-toolbar="desktop"')
    expect(client).toContain('data-stock-planning-filter-toolbar="mobile"')
    expect(client).toContain('<TabsList')
    expect(client).toContain('variant="line"')
    expect(client).toContain('mobileFilterDraft')
    expect(client).toContain('title="ตัวกรองวางแผนสต๊อก"')
    expect(client).toContain('visibleClassName="lg:hidden"')
    expect(client).toContain('ล้างตัวกรอง')
    expect(client).toContain('ใช้ตัวกรอง')
    expect(client).not.toContain('เทียบ Stock พร้อมส่งกับ PO Buy ที่กำลังเข้าและ PO Sell ที่ค้างส่งตามวันกำหนดส่ง')
  })

  it('switches heavy tables to mobile cards and keeps expansion keyboard-accessible', async () => {
    const client = await readFile(clientPath, 'utf8')
    const rightAlignedNumericHeaders = client.match(/<th data-column-align="right" className="[^"]*text-right/g) ?? []

    expect(client).toContain('data-stock-planning-mobile-card')
    expect(client).toContain('className="hidden md:block"')
    expect(client).toContain('className="space-y-3 md:hidden"')
    expect(client).toContain('aria-expanded={isExpanded}')
    expect(client).toContain('aria-controls={detailId}')
    expect(client).toContain('aria-pressed={date === selectedDate}')
    expect(client).toContain('tabular-nums')
    expect(rightAlignedNumericHeaders).toHaveLength(18)
  })

  it('shows canonical pagination/loading and exports a real Excel workbook', async () => {
    const client = await readFile(clientPath, 'utf8')
    const canonicalExportButtons = client.match(/bg-emerald-600[^"]*text-sm font-normal/g) ?? []

    expect(client).toContain("import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'")
    expect(client).toContain('<PageSizeDropdown')
    expect(client).toContain('กำลังโหลดข้อมูล')
    expect(client).toContain('หน้า {currentPage} / {pageCount}')
    expect(client).toContain("await import('write-excel-file/browser')")
    expect(client).toContain('.xlsx`')
    expect(client).toContain('ส่งออก Excel')
    expect(canonicalExportButtons).toHaveLength(2)
  })
})
