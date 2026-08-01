import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const costPoolSource = readFileSync(new URL('./CostPoolPageClient.tsx', import.meta.url), 'utf8')
const allocatorSource = readFileSync(new URL('./CostAllocatorPageClient.tsx', import.meta.url), 'utf8')
const handlerSource = readFileSync(new URL('../../app/api/dual-costing/cost-pool/handler.ts', import.meta.url), 'utf8')

describe('Cost Pool wording and export contract', () => {
  it('uses the approved summary, supplier, item, and opening labels', () => {
    for (const label of ['ยอดรวมรายการจับคู่', 'ยอดคงเหลือพร้อมใช้', 'ผู้ขาย', 'รายการต้นทุน', 'ยอดยกมา — บิลซื้อ', 'ยอดยกมา — PO ซื้อ', 'ยอดยกมา — ปรับเกรด']) {
      expect(costPoolSource).toContain(label)
    }
    expect(costPoolSource).not.toContain('จับคู่แล้วรวม')
    expect(costPoolSource).not.toContain('คงเหลือพร้อมใช้รวม')
  })

  it('keeps allocator sorting keys while presenting suppliers and cost items to users', () => {
    expect(allocatorSource).toContain('sortKey="counterparty"')
    expect(allocatorSource).toContain('label="ผู้ขาย"')
    expect(allocatorSource).toContain('รายการต้นทุน')
    expect(allocatorSource).toContain("if (type === 'Opening_Purchase') return 'ยอดยกมา — บิลซื้อ'")
    expect(allocatorSource).not.toMatch(/(?:ล็อต|\\blot\\b)/i)
  })

  it('exports the actual counterparty data under the ผู้ขาย label without renaming the wire key', () => {
    expect(handlerSource).toContain('ผู้ขาย: row.counterparty')
    expect(handlerSource).toContain('counterparty: string')
    expect(handlerSource).toContain("? poBuySupplier || purchaseBillSupplier || '—'")
  })

  it('keeps Cost Pool XLSX actions at the confirmed emerald h-10 baseline', () => {
    expect(costPoolSource).toContain('className="h-10 gap-2 text-sm font-normal" variant="export"')
    expect(costPoolSource).toContain('className="h-10 w-full gap-2 text-sm font-normal" variant="export"')
    expect(costPoolSource).toContain('<Download className="size-4" />')
  })
})
