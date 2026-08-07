import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { buildWtoEditTimelineNote, shouldRebuildWtoPendingOutOnEdit } from './weight-ticket-write/wto'
import { mergeWeightTicketCollaborationBaseline } from '../weight-ticket-collaboration'

const createRouteSource = readFileSync(
  resolve(process.cwd(), 'src/app/api/daily/weight-tickets/route.ts'),
  'utf8',
)

const editRouteSource = readFileSync(
  resolve(process.cwd(), 'src/app/api/daily/weight-tickets/[id]/route.ts'),
  'utf8',
)

const formSource = readFileSync(
  resolve(process.cwd(), 'src/components/daily/WeightTicketFormCore.tsx'),
  'utf8',
)

describe('WTO delivered edit release/rebuild contract', () => {
  it('advances untouched remote lines without changing the local dirty-line baseline', () => {
    const baseline = {
      branchId: 'branch-1',
      lines: [
        { id: 'line-1', lineNo: 1, version: 1 },
        { id: 'line-2', lineNo: 2, version: 1 },
      ],
      partyId: 'party-1',
      remark: 'old',
      vehicleImageNames: ['old.jpg'],
      vehicleNo: 'AA-001',
      godownName: 'old-godown',
    }
    const latest = {
      ...baseline,
      lines: [
        { id: 'line-1', lineNo: 1, version: 1 },
        { id: 'line-2', lineNo: 2, version: 2 },
        { id: 'line-3', lineNo: 3, version: 1 },
      ],
      remark: 'remote remark',
    }

    const merged = mergeWeightTicketCollaborationBaseline({
      baselineTicket: baseline as never,
      dirtyLineIds: new Set(['line-1']),
      latestTicket: latest as never,
      preserveHeader: false,
    })

    expect(merged.lines).toEqual([
      { id: 'line-1', lineNo: 1, version: 1 },
      { id: 'line-2', lineNo: 2, version: 2 },
      { id: 'line-3', lineNo: 3, version: 1 },
    ])
    expect(merged.remark).toBe('remote remark')
  })

  it('keeps a locally deleted line in the baseline while omitting a remotely deleted untouched line', () => {
    const baseline = {
      branchId: 'branch-1',
      lines: [
        { id: 'local-delete', lineNo: 1, version: 1 },
        { id: 'remote-delete', lineNo: 2, version: 1 },
      ],
    }
    const latest = {
      ...baseline,
      lines: [{ id: 'local-delete', lineNo: 1, version: 2 }],
    }

    const merged = mergeWeightTicketCollaborationBaseline({
      baselineTicket: baseline as never,
      dirtyLineIds: new Set(['local-delete']),
      latestTicket: latest as never,
      preserveHeader: false,
    })

    expect(merged.lines).toEqual([{ id: 'local-delete', lineNo: 1, version: 1 }])
  })

  it('keeps draft writes free of pending_out until the confirm action', () => {
    expect(createRouteSource).not.toContain('applyWeightTicketCreateSideEffects')
    expect(editRouteSource).toContain('existing.weight_ticket_lines.length === 0')
    const confirmStart = editRouteSource.indexOf("if (confirmParsed.success)")
    expect(confirmStart).toBeGreaterThan(-1)
    expect(editRouteSource.slice(confirmStart)).toContain('applyWeightTicketCreateSideEffects')
  })

  it('rechecks the locked ticket before confirming or preserving a concurrent draft status', () => {
    const confirmStart = editRouteSource.indexOf("if (confirmParsed.success)")
    const confirmSource = editRouteSource.slice(confirmStart)

    expect(confirmSource).toContain('await tx.$executeRaw`select pg_advisory_xact_lock(${ticketId})`')
    expect(confirmSource).toContain('if (existing.weight_ticket_lines.length === 0)')
    expect(editRouteSource).toContain('const nextStatus = existing.status')
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

  it('blocks stale collaboration writes before delivered WTO pending_out rebuild', () => {
    expect(editRouteSource).toContain('if (isDeliveredWtoEdit && hasRemoteLineChanges && values.collaborationBaseLineVersions !== undefined)')
    expect(editRouteSource.indexOf('throw new WeightTicketCollaborationConflictError(Array.from(collaborationChangedLineIds))'))
      .toBeLessThan(editRouteSource.indexOf('await releaseActiveWtoPendingOut(tx, {'))
  })

  it('treats an edited line deleted by another user as a conflict', () => {
    expect(editRouteSource).toContain('const missingChangedLineIds = Object.keys(collaborationBaseLineVersions)')
    expect(editRouteSource).toContain('if (missingChangedLineIds.length) throw new WeightTicketCollaborationConflictError(missingChangedLineIds)')
  })

  it('keeps the original client baseline when realtime merges around dirty form data', () => {
    expect(formSource).toContain('const dirtyLineIds = new Set(changedLineIdsRef.current)')
    expect(formSource).toContain('mergeWeightTicketCollaborationBaseline({')
    expect(formSource).toContain('setSavedTicket(mergedBaseline)')
    expect(formSource).toContain('setSavedTicket(ticket)')
  })

  it('compares collaboration headers using the same business codes as the read model', () => {
    expect(editRouteSource).toContain("const currentPartyId = existing.doc_type === 'WTI' ? existing.suppliers?.code ?? '' : existing.customers?.code ?? ''")
    expect(editRouteSource).toContain("branchId: existing.branches?.code ?? ''")
  })
})
