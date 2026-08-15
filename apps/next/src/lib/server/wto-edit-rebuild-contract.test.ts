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

const handlersSource = readFileSync(
  resolve(process.cwd(), 'src/lib/server/weight-ticket-write/handlers.ts'),
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
      dirtyHeaderFields: new Set(),
      dirtyLineIds: new Set(['line-1']),
      latestTicket: latest as never,
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
      dirtyHeaderFields: new Set(),
      dirtyLineIds: new Set(['local-delete']),
      latestTicket: latest as never,
    })

    expect(merged.lines).toEqual([{ id: 'local-delete', lineNo: 1, version: 1 }])
  })

  it('preserves only dirty header fields while advancing clean header fields', () => {
    const baseline = { branchId: 'branch-old', lines: [], partyId: 'party-old', remark: 'old', vehicleNo: 'AA-001', godownName: 'old' }
    const latest = { ...baseline, branchId: 'branch-new', partyId: 'party-new', remark: 'new', vehicleNo: 'AA-999', godownName: 'new' }
    const merged = mergeWeightTicketCollaborationBaseline({
      baselineTicket: baseline as never,
      dirtyHeaderFields: new Set(['vehicleNo']),
      dirtyLineIds: new Set(),
      latestTicket: latest as never,
    })

    expect(merged.vehicleNo).toBe('AA-001')
    expect(merged.branchId).toBe('branch-new')
    expect(merged.remark).toBe('new')
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
    expect(editRouteSource).toContain('if (isDeliveredWtoEdit && hasStaleCollaborationBaseline)')
    expect(editRouteSource.indexOf('throw new WeightTicketCollaborationConflictError(Array.from(collaborationChangedLineIds), [], {'))
      .toBeLessThan(editRouteSource.indexOf('await releaseActiveWtoPendingOut(tx, {'))
  })

  it('does not bypass stale baseline conflicts for the same actor', () => {
    expect(editRouteSource).toContain('const hasStaleCollaborationBaseline = collaborationBaseUpdatedAt !== collaborationCurrentUpdatedAt.toISOString()')
    expect(editRouteSource).not.toContain('existing.updated_by !== actor')
    expect(editRouteSource).toContain('const collaborationLineIds = new Set([...collaborationChangedLineIds, ...collaborationDeletedLineIds])')
  })

  it('checks the locked document timestamp before deleting lines', () => {
    expect(editRouteSource).toContain('if (deleteLines.data.collaborationBaseUpdatedAt !== locked.updated_at.toISOString())')
    expect(editRouteSource).toContain("operation: 'delete_lines'")
  })

  it('rechecks branch scope and derives audit/realtime previous values from the locked row', () => {
    expect(editRouteSource).toContain('if (scopedBranchIds !== null && !scopedBranchIds.includes(previousBranchId))')
    expect(editRouteSource).toContain('const previousDocumentNo = existing.doc_no')
    expect(editRouteSource).toContain('return { beforeSnapshot, eventLineIds: resolvedChangedLineIds, imageChanged, lineIdMap, previousDocumentNo, previousHeader: currentHeader, ticket }')
    expect(editRouteSource).toContain('const effectiveBranch = requestOwnsBranch')
    expect(editRouteSource).toContain('where: { active: true, code: effectiveValues.branchId.toUpperCase() }')
    expect(editRouteSource).toContain('const lockedBranchId = locked.branches?.code')
    expect(editRouteSource).toContain('if (!currentPartyId) {')
    expect(editRouteSource).toContain('if (!currentVehicleNo) {')
    expect(editRouteSource).toContain("if (values.type === 'WTO' && !currentGodownName) {")
    expect(editRouteSource).toContain('await assertWeightTicketPartyForType({')
  })

  it('fails closed when the persisted party reference is missing', () => {
    expect(handlersSource).toContain("throw new WeightTicketWriteValidationError('ผู้ขายไม่ถูกต้องหรือถูกปิดใช้งาน'")
    expect(handlersSource).toContain("throw new WeightTicketWriteValidationError('ลูกค้าไม่ถูกต้องหรือถูกปิดใช้งาน'")
    expect(handlersSource).not.toContain('input.supplier?.name ??')
    expect(handlersSource).not.toContain('input.customer?.name ??')
    expect(editRouteSource).not.toContain('customerName: customer?.name ??')
    expect(editRouteSource).not.toContain('supplierName: supplier?.name ??')
  })

  it('fails closed when a changed line cannot be mapped to a persisted id', () => {
    expect(editRouteSource).toContain('const unresolvedChangedLineIds = [...collaborationChangedLineIds]')
    expect(editRouteSource).toContain('throw new WeightTicketDataContractError(`ไม่สามารถระบุรายการที่เปลี่ยนแปลงหลังบันทึก: ${unresolvedChangedLineIds.join(\', \')}`)')
  })

  it('treats an edited line deleted by another user as a conflict', () => {
    expect(editRouteSource).toContain('const missingChangedLineIds = [...collaborationLineIds]')
    expect(editRouteSource).toContain('if (missingChangedLineIds.length) throw new WeightTicketCollaborationConflictError(missingChangedLineIds, [], {')
    expect(editRouteSource).toMatch(/effectiveValues = \{[\s\S]*?lines: values\.saveScope === 'section'/)
  })

  it('records collaboration conflicts and uses persisted line ids only', () => {
    expect(editRouteSource).toContain("eventKey: 'daily.weight-ticket.collaboration-conflict'")
    expect(editRouteSource).toContain('currentLineVersions')
    expect(editRouteSource).toContain("operation: 'delete_lines'")
    expect(editRouteSource).not.toContain('collaborationBaseDocumentNo')
    expect(editRouteSource).not.toContain('latestLineByClientId.set(`${existing.doc_no}:')
    expect(formSource).not.toContain('collaborationBaseDocumentNo')
  })

  it('uses one server clock for WTI and WTO elapsed timers', () => {
    expect(editRouteSource).toContain('serverNow: new Date().toISOString()')
    expect(formSource).toContain('const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0)')
    expect(formSource).toContain('serverNowMs - Date.now()')
    expect(formSource).toContain('const timerCurrentMs = timerNow + serverClockOffsetMs')
  })

  it('saves each impurity line with its UUID-scoped descendants', () => {
    expect(formSource).toContain('บันทึกสิ่งเจือปนนี้')
    expect(formSource).toContain('getWeightTicketImpuritySaveLineIds(form.lines, child.id)')
    expect(formSource).toContain('saveLineIds.add(current.parentId)')
    expect(formSource).toContain('getWeightTicketRootLineId(currentForm.lines, sectionId)')
    expect(formSource).toContain('const savedTargetLineIds = Array.from(targetLineIdSet ?? sectionLineIdSet)')
    expect(formSource).toContain("saveScope: 'section'")
    expect(formSource).toContain('remoteChangedLineIds.has(child.id)')
    expect(formSource).toContain('มีข้อมูลใหม่จากผู้ใช้อื่น')
  })

  it('keeps the original client baseline when realtime merges around dirty form data', () => {
    expect(formSource).toContain('const dirtyLineIds = new Set(changedLineIdsRef.current)')
    expect(formSource).toContain('mergeWeightTicketCollaborationBaseline({')
    expect(formSource).toContain('setSavedTicket(mergedBaseline)')
    expect(formSource).toContain('setSavedTicket(ticket)')
    expect(formSource).toContain('version: line.version')
    expect(formSource).toContain('const deletedLineIdsRef = useRef<Set<string>>(new Set())')
    expect(formSource).toContain('if (deletedLineIdsRef.current.has(latestLine.id)) return null')
    expect(formSource).toContain('setSavedTicket(ticket)')
    expect(formSource).toContain('line.version != null || baselineLines.has(line.id)')
    expect(formSource).toContain('function markLinesDeleted(lineIds: Iterable<string>)')
    const appendLineImagesStart = formSource.indexOf('async function appendLineImages(')
    const appendVehicleImagesStart = formSource.indexOf('async function appendVehicleImages(', appendLineImagesStart)
    expect(formSource.slice(appendLineImagesStart, appendVehicleImagesStart)).not.toContain("dirtyHeaderFieldsRef.current.add('vehicleImageNames')")
    expect(formSource).toContain('function removeImpurityLine')
    expect(editRouteSource).not.toContain('const remoteChangedHeaderFields =')
  })

  it('compares collaboration headers using the same business codes as the read model', () => {
    expect(editRouteSource).toContain("const currentPartyId = existing.doc_type === 'WTI' ? existing.suppliers?.code : existing.customers?.code")
    expect(editRouteSource).toContain('branchId: previousBranchId')
  })
})
