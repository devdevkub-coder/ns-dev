import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { buildWtoEditTimelineNote, shouldRebuildWtoPendingOutOnEdit } from './weight-ticket-write/wto'

const createRouteSource = readFileSync(
  resolve(process.cwd(), 'src/app/api/daily/weight-tickets/route.ts'),
  'utf8',
)

const editRouteSource = readFileSync(
  resolve(process.cwd(), 'src/app/api/daily/weight-tickets/[id]/route.ts'),
  'utf8',
)

describe('WTO delivered edit release/rebuild contract', () => {
  it('keeps draft writes free of pending_out until the confirm action', () => {
    expect(createRouteSource).not.toContain('applyWeightTicketCreateSideEffects')
    expect(editRouteSource).toContain('existing.weight_ticket_lines.length === 0')
    const confirmStart = editRouteSource.indexOf("if (confirmParsed.success)")
    expect(confirmStart).toBeGreaterThan(-1)
    expect(editRouteSource.slice(confirmStart)).toContain('applyWeightTicketCreateSideEffects')
  })

  it('releases the old holds before replacing lines and rebuilds cost snapshots', () => {
    const releaseIndex = editRouteSource.indexOf('await releaseActiveWtoPendingOut(tx, {')
    const deleteLinesIndex = editRouteSource.indexOf('await tx.weight_ticket_lines.deleteMany({ where: { weight_ticket_id: existing.id } })')
    const createSideEffectsIndex = editRouteSource.indexOf('await applyWeightTicketEditSideEffects(tx, {')

    expect(releaseIndex).toBeGreaterThan(-1)
    expect(deleteLinesIndex).toBeGreaterThan(releaseIndex)
    expect(createSideEffectsIndex).toBeGreaterThan(deleteLinesIndex)
    expect(editRouteSource).toContain('preservedCostSnapshots: [],')
    expect(editRouteSource).toContain('shouldSnapshotCost: true,')
  })

  it('writes immutable release and rebuild events under the edit status log key', () => {
    expect(editRouteSource).toContain("eventTypeForHold: () => 'edit_release'")
    expect(editRouteSource).toContain("eventTypeForHold: () => 'edit_rebuild'")
    expect(editRouteSource).toContain('qtyAfterForHold: () => 0')
    expect(editRouteSource).toMatch(/eventTypeForHold: \(\) => 'edit_release',[\s\S]*?statusLogEventKey,[\s\S]*?eventTypeForHold: \(\) => 'edit_rebuild'/)
  })

  it.each([
    ['customer/header-only edit', false, [{ line_no: 1, net_weight: 100, product_id: 1n, warehouse_id: 10n }], [{ line_no: 1, net_weight: 100, product_id: 1n, warehouse_id: 10n }], false],
    ['quantity edit', false, [{ line_no: 1, net_weight: 100, product_id: 1n, warehouse_id: 10n }], [{ line_no: 1, net_weight: 90, product_id: 1n, warehouse_id: 10n }], true],
    ['product edit', false, [{ line_no: 1, net_weight: 100, product_id: 1n, warehouse_id: 10n }], [{ line_no: 1, net_weight: 100, product_id: 2n, warehouse_id: 10n }], true],
    ['warehouse edit', false, [{ line_no: 1, net_weight: 100, product_id: 1n, warehouse_id: 10n }], [{ line_no: 1, net_weight: 100, product_id: 1n, warehouse_id: 11n }], true],
    ['branch edit', true, [{ line_no: 1, net_weight: 100, product_id: 1n, warehouse_id: 10n }], [{ line_no: 1, net_weight: 100, product_id: 1n, warehouse_id: 10n }], true],
    ['zero-weight line add', false, [{ line_no: 1, net_weight: 0, product_id: 1n, warehouse_id: 10n }], [{ line_no: 1, net_weight: 0, product_id: 1n, warehouse_id: 10n }, { line_no: 2, net_weight: 0, product_id: 2n, warehouse_id: 10n }], false],
  ])('%s rebuild decision', (_name, branchChanged, existingLines, newLines, expected) => {
    expect(shouldRebuildWtoPendingOutOnEdit({ branchChanged, existingLines, newLines })).toBe(expected)
  })

  it('keeps the document timeline independent from pending_out event details', () => {
    const note = buildWtoEditTimelineNote({
      newLines: [{ gross_weight: 120, impurity_source_line_no: null, line_no: 1, net_weight: 110, product_id: 1n }],
      oldLines: [{ gross_weight: 100, impurity_source_line_no: null, line_no: 1, net_weight: 90, product_id: 1n }],
    } as never)

    expect(note).toContain('แก้ไขเต๋าเดิม')
    expect(note).toContain('น้ำหนักสุทธิ')
  })
})
