// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { FormSafetyProvider } from '@/components/ui/FormSafetyProvider'
import { Dialog } from '@/components/ui/Dialog'
const mocks = vi.hoisted(() => ({
  cachedWeightTicketReferences: vi.fn(),
  fetchFreshWeightTicketReferences: vi.fn(),
  saveWeightTicket: vi.fn(),
  patchWeightTicketChanges: vi.fn(),
  router: {
    push: vi.fn(),
    refresh: vi.fn(),
  },
}))

vi.mock('next/image', () => ({ default: 'img' }))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/lib/weight-ticket-reference-cache', () => ({
  cachedWeightTicketReferences: mocks.cachedWeightTicketReferences,
  fetchFreshWeightTicketReferences: mocks.fetchFreshWeightTicketReferences,
}))
vi.mock('@/lib/weight-tickets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/weight-tickets')>()),
  saveWeightTicket: mocks.saveWeightTicket,
  patchWeightTicketChanges: mocks.patchWeightTicketChanges,
}))

import { changeWeightTicketProduct, getProductCardImages, getWeightTicketServerErrorMessage, getWeightTicketValidationFocusTarget, mapWeightTicketServerFieldErrors, remapWeightTicketLineIds, remapWeightTicketLineKey, replaceWeightTicketSectionLines, requirePersistedWeightTicketLineId, resolvePersistedWeightTicketLotSource, shouldPersistWeightTicketBeforeAdding, WeightTicketFormCore } from './WeightTicketFormCore'

const formSource = readFileSync(
  resolve(process.cwd(), 'src/components/daily/WeightTicketFormCore.tsx'),
  'utf8',
)
const typeFormSectionsSource = readFileSync(
  resolve(process.cwd(), 'src/components/daily/WeightTicketTypeFormSections.tsx'),
  'utf8',
)
const weightTicketApiSource = readFileSync(
  resolve(process.cwd(), 'src/app/api/daily/weight-tickets/[id]/route.ts'),
  'utf8',
)
const weightTicketCreateApiSource = readFileSync(
  resolve(process.cwd(), 'src/app/api/daily/weight-tickets/route.ts'),
  'utf8',
)
const weightTicketClientSource = readFileSync(
  resolve(process.cwd(), 'src/lib/weight-tickets.ts'),
  'utf8',
)

describe('weight-ticket product entry start contract', () => {
  it('starts with no product line until the user explicitly adds one', () => {
    expect(formSource).toMatch(/function initialForm[\s\S]*?lines:\s*\[\],/)
    expect(formSource).toContain("if (form.type === 'WTO' && parentLines.length === 0) next.lines = 'เพิ่มรายการสินค้าอย่างน้อย 1 รายการ'")
    expect(formSource).toContain("const firstErrorKey = errors.lines ? 'lines' : errorKeys[0]")
    expect(formSource).toContain('ยังไม่มีสินค้า')
    expect(formSource).toContain('id="weight-ticket-add-product"')
  })

  it('uploads the selected image without client-side resizing', () => {
    expect(formSource).toContain("body.set('file', file)")
    expect(formSource).not.toContain('createImageBitmap(file)')
    expect(formSource).not.toContain('canvas.toBlob')
  })

  it('uploads up to six selected images concurrently per form without a cross-tab lock', () => {
    expect(formSource).toContain("fetch('/api/daily/weight-tickets/attachments', { method: 'GET' })")
    expect(formSource).toContain('Math.min(uploadConfig.uploadConcurrency, files.length)')
    expect(formSource).not.toContain('navigator.locks')
    expect(formSource).not.toContain('BroadcastChannel')
  })

  it('persists a header-only draft before the first product is added for both WTI and WTO', () => {
    expect(shouldPersistWeightTicketBeforeAdding('WTI', 0)).toBe(true)
    expect(shouldPersistWeightTicketBeforeAdding('WTO', 0)).toBe(true)
    expect(shouldPersistWeightTicketBeforeAdding('WTI', 1)).toBe(true)
    expect(formSource).toContain('id: savedTicket?.id ?? editingTicketId')
    expect(formSource).toContain("beginSaveStage('auto_save')")
    expect(formSource).toContain('<WeightTicketSaveProgress stage={saveStage} type={form.type} />')
    expect(formSource).toContain("saveInFlightRef.current = 'auto_save'")
    expect(formSource).toContain("saveInFlightRef.current = 'save'")
    expect(formSource).toContain("saveScope: snapshotToSave.lines.length === 0 ? 'header' : undefined")
    expect(formSource).toContain("if (shouldIgnoreRapidAdd('product')) return")
    expect(formSource).toContain('if (shouldIgnoreRapidAdd(`lot:${sourceLine.id}`)) return')
    expect(formSource).toContain('if (shouldIgnoreRapidAdd(`impurity:${sourceLine.id}`)) return')
    expect(formSource).toContain('saveDraftBeforeAdding({')
    expect(formSource).toContain('}, currentSectionLineIds)')
    expect(formSource).toContain('lastBackgroundLineIdMapRef.current = ticket.lineIdMap')
    expect(formSource).toContain('loadedTicketRef.current = ticket')
    expect(formSource).toContain('savedTicketRef.current = ticket')
    expect(formSource).toContain('draftLineIds: Array.from(draftLineIds)')
    expect(formSource).toContain("applyApiFieldErrors(caught, formRef.current, 'บันทึกแบบร่างก่อนเพิ่มรายการไม่ได้', submittedErrorLines)")
  })

  it('uses the ticket returned by the header save as the section-save identity', () => {
    expect(formSource).toContain('const baselineTicket = savedTicket ?? loadedTicket')
    expect(formSource).toContain('if (!baselineTicket) {')
    expect(formSource).not.toContain('if (!baselineTicket || !editingTicketId) {')
    expect(formSource).toContain('id: baselineTicket.id')
  })

  it('reconciles temporary section line IDs from the explicit server mapping', () => {
    expect(weightTicketApiSource).toContain('lineIdMap')
    expect(weightTicketClientSource).toContain('weightTicketSaveResultSchema')
    expect(formSource).toContain('const persistedRootId = requirePersistedWeightTicketLineId(ticket.lineIdMap, sectionId)')
    expect(formSource).not.toContain('const persistedRootId = ticket.lineIdMap[sectionId] ?? sectionId')
    expect(formSource).toContain('remapWeightTicketLineIds(current.lines, ticket.lineIdMap)')
  })

  it('keeps blank child lots limited to explicitly marked incremental saves', () => {
    expect(weightTicketApiSource).toContain('isWeightTicketDraftLotSkeleton(line) && !draftLineIds.has(line.id)')
    expect(weightTicketApiSource).toContain('(!baselineLineIds.has(line.id) || changedLineIds.has(line.id))')
    expect(weightTicketCreateApiSource).toContain('isWeightTicketDraftLotSkeleton(line) && !draftLineIds.has(line.id)')
    expect(formSource).toContain('const linesForFingerprint = isScopedAdd')
    expect(formSource).toContain('if (!isScopedAdd) {')
  })

  it('rejects an incomplete section line ID mapping instead of retaining a temporary ID', () => {
    expect(() => requirePersistedWeightTicketLineId({}, 'client-line')).toThrow('ผลการบันทึกไม่คืน ID ของรายการ client-line')
    expect(requirePersistedWeightTicketLineId({ 'client-line': '1001' }, 'client-line')).toBe('1001')
  })

  it('keeps a saved product section in its original position', () => {
    expect(replaceWeightTicketSectionLines(
      [
        { id: '101', name: 'A old' },
        { id: '201', name: 'B' },
      ],
      [{ id: '101', name: 'A saved' }],
      new Set(['101']),
    )).toEqual([
      { id: '101', name: 'A saved' },
      { id: '201', name: 'B' },
    ])
  })

  it('rebinds a new lot to the persisted source line after auto-save', () => {
    const sourceLine = { id: 'client-line', productId: 'product-001', warehouseId: 'warehouse-001' }
    const persistedLines = [{ id: '42', productId: 'product-001', warehouseId: 'warehouse-001' }]

    expect(resolvePersistedWeightTicketLotSource(sourceLine, persistedLines, 0)).toEqual(persistedLines[0])
    expect(resolvePersistedWeightTicketLotSource(sourceLine, [{ ...persistedLines[0], productId: 'product-002' }], 0)).toBeNull()
    expect(resolvePersistedWeightTicketLotSource(sourceLine, persistedLines, 1)).toBeNull()
    expect(formSource).toContain('disabled={!hasSelectedProduct}')
  })

  it('reconciles every line-id reference after the source line is persisted', () => {
    const remapped = remapWeightTicketLineIds([
      { id: 'client-source', parentId: undefined, impuritySourceLineId: undefined },
      { id: 'client-lot', parentId: 'client-source', impuritySourceLineId: undefined },
      { id: 'client-impurity', parentId: 'client-source', impuritySourceLineId: 'client-source' },
    ], { 'client-source': 'WTI-001:01' })

    expect(remapped).toEqual([
      { id: 'WTI-001:01', parentId: undefined, impuritySourceLineId: undefined },
      { id: 'client-lot', parentId: 'WTI-001:01', impuritySourceLineId: undefined },
      { id: 'client-impurity', parentId: 'WTI-001:01', impuritySourceLineId: 'WTI-001:01' },
    ])
    expect(remapWeightTicketLineKey('line-client-source-gross', { 'client-source': 'WTI-001:01' })).toBe('line-WTI-001:01-gross')
    expect(remapWeightTicketLineKey('branchId', { 'client-source': 'WTI-001:01' })).toBe('branchId')
  })

  it('maps validation errors to the correct lot and opens collapsed ancestors before focus', () => {
    const lines = [
      { deductionMode: 'none', id: 'root-1a2b', parentId: undefined },
      { deductionMode: 'none', id: 'lot-2c3d', parentId: 'root-1a2b' },
      { deductionMode: 'kg', id: 'impurity-3e4f', parentId: 'lot-2c3d' },
      { deductionMode: 'kg', id: 'nested-5f6a', parentId: 'impurity-3e4f' },
    ] as Parameters<typeof getWeightTicketValidationFocusTarget>[0]

    expect(getWeightTicketValidationFocusTarget(lines, 'line-lot-2c3d-gross')).toEqual({
      impurityId: null,
      lineId: 'lot-2c3d',
      lotId: 'lot-2c3d',
      productSectionId: 'root-1a2b',
    })
    expect(getWeightTicketValidationFocusTarget(lines, 'line-nested-5f6a-deduction')).toEqual({
      impurityId: 'nested-5f6a',
      lineId: 'nested-5f6a',
      lotId: 'lot-2c3d',
      productSectionId: 'root-1a2b',
    })
  })

  it('maps API line errors to the local field key and keeps the product context', () => {
    expect(mapWeightTicketServerFieldErrors({
      'lines.2.impurityId': ['สิ่งเจือปนไม่ถูกต้องหรือถูกปิดใช้งาน'],
    }, [
      { id: 'product-1', parentId: undefined, productId: 'SKU001', productName: 'กระปะดำ, ผัด' },
      { id: 'lot-1', parentId: 'product-1', productId: 'SKU001', productName: 'กระปะดำ, ผัด' },
      { id: 'product-2', parentId: undefined, productId: 'SKU002', productName: 'กระป๋องอลูมิเนียม' },
    ])).toEqual({
      'line-product-2-impurity': ['สิ่งเจือปนไม่ถูกต้องหรือถูกปิดใช้งาน'],
    })
    expect(getWeightTicketServerErrorMessage({
      'lines.2.impurityId': ['สิ่งเจือปนไม่ถูกต้องหรือถูกปิดใช้งาน'],
    }, [
      { id: 'product-1', parentId: undefined, productId: 'SKU001', productName: 'กระปะดำ, ผัด' },
      { id: 'lot-1', parentId: 'product-1', productId: 'SKU001', productName: 'กระปะดำ, ผัด' },
      { id: 'product-2', parentId: undefined, productId: 'SKU002', productName: 'กระป๋องอลูมิเนียม' },
    ], 'บันทึกไม่สำเร็จ')).toBe('สินค้า "กระป๋องอลูมิเนียม" (รายการที่ 2): สิ่งเจือปนไม่ถูกต้องหรือถูกปิดใช้งาน')
  })

  it('keeps section validation mapped to line IDs containing hyphens', () => {
    expect(formSource).toContain('const parsed = parseWeightTicketValidationKey(key)')
    expect(formSource).toContain('sectionLineIdSet.has(parsed.lineId)')
  })
})

describe('weight-ticket product change behavior', () => {
  it('uses the save boundary for WTO draft stock validation', () => {
    const editRouteSource = readFileSync(
      resolve(process.cwd(), 'src/app/api/daily/weight-tickets/[id]/route.ts'),
      'utf8',
    )
    const createRouteSource = readFileSync(
      resolve(process.cwd(), 'src/app/api/daily/weight-tickets/route.ts'),
      'utf8',
    )

    expect(editRouteSource).toContain("if (effectiveValues.type === 'WTO' && effectiveValues.saveScope !== 'header')")
    expect(createRouteSource).toContain("if (values.type === 'WTO' && values.saveScope !== 'header')")
    expect(editRouteSource).toContain('excludeWeightTicketId')
  })

  it('keeps the confirmation contract non-destructive for WTI and WTO', () => {
    expect(formSource).toContain("description: form.type === 'WTO'")
    expect(formSource).toContain('ข้อมูลเดิมจะคงไว้ ระบบจะตรวจ stock ของรายการทั้งหมดใหม่ก่อนบันทึก')
    expect(formSource).toContain('เปลี่ยนเฉพาะสินค้า น้ำหนัก และสิ่งเจือปน ข้อมูลและรูปถ่ายอื่นจะคงเดิม')
    expect(formSource).not.toContain('ข้อมูลสินค้า เต๋า และสิ่งเจือปนที่เกี่ยวข้องจะถูกล้างจากรายการนี้')
  })

  it('changes the product without dropping weighing data or attached evidence', () => {
    const evidence = { fileName: 'weighing.jpg', id: 'photo-1', rawValue: 'photo-1', url: 'https://example.test/photo-1.jpg' }
    const mainLine = {
      containerDeductionWeight: '10',
      deductionMode: 'none',
      deductionValue: '0',
      grossWeight: '500',
      id: 'main-line',
      imageFiles: [evidence],
      imageNames: ['photo-1'],
      parentId: undefined,
      productId: 'old-product',
      productName: 'สินค้าเดิม',
    } as Parameters<typeof changeWeightTicketProduct>[0][number]
    const lotLine = {
      ...mainLine,
      id: 'lot-line',
      parentId: 'main-line',
      grossWeight: '250',
    }
    const purchasedImpurityLine = {
      ...mainLine,
      id: 'purchased-impurity-line',
      impuritySourceLineId: 'impurity-line',
      parentId: 'main-line',
      productId: 'purchased-impurity-product',
      productName: 'สินค้าที่ปนมา',
    }

    const changed = changeWeightTicketProduct(
      [mainLine, lotLine, purchasedImpurityLine],
      'main-line',
      'new-product',
      'สินค้าใหม่',
    )

    expect(changed).toHaveLength(3)
    expect(changed[0]).toMatchObject({ grossWeight: '500', imageFiles: [evidence], imageNames: ['photo-1'], productId: 'new-product', productName: 'สินค้าใหม่' })
    expect(changed[1]).toMatchObject({ grossWeight: '250', imageFiles: [evidence], imageNames: ['photo-1'], productId: 'new-product' })
    expect(changed[2]).toMatchObject({ productId: 'purchased-impurity-product', productName: 'สินค้าที่ปนมา' })
  })
})

describe('weight-ticket mobile product workspace contract', () => {
  it('opens a blank product editor without auto-opening the product dropdown', () => {
    const addLineSource = formSource.match(/function addLine\(\) \{([\s\S]*?)\r?\n  \}\r?\n\r?\n  const closeMobileProductEditor = useCallback/)

    expect(addLineSource).not.toBeNull()
    expect(addLineSource?.[1]).toContain("setMobileProductView('editor')")
    expect(addLineSource?.[1]).not.toContain('setPendingFocusField')
    expect(formSource).toContain('setPendingFocusField(firstErrorKey)')
  })

  it('keeps the product list behind a non-nested bottom-sheet editor', () => {
    expect(formSource).toContain("const [mobileProductView, setMobileProductView] = useState<'list' | 'editor'>('list')")
    expect(formSource).toContain('const [isMobileProductEditorVisible, setMobileProductEditorVisible] = useState(false)')
    expect(formSource).toContain('useLayoutEffect(() => {')
    expect(formSource).toMatch(/mobileProductEditorOpenAnimationFrameRef\.current = window\.requestAnimationFrame\(\(\) => \{[\s\S]*?mobileProductEditorOpenAnimationFrameRef\.current = window\.requestAnimationFrame/)
    expect(formSource).toContain('cancelMobileProductEditorOpenAnimation()')
    expect(formSource).toContain("setMobileProductView('editor')")
    expect(formSource).toContain('setPendingFocusField(`line-${nextLine.id}-gross`)')
    expect(formSource).toContain('setPendingFocusField(`line-${nextLine.id}-impurity`)')
    expect(formSource).not.toContain('transition-opacity duration-300 ease-out')
    expect(formSource).not.toContain("isMobileProductEditorVisible ? 'opacity-100' : 'opacity-0'")
    expect(formSource).not.toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches")
    expect(formSource).not.toContain('motion-reduce:transition-none')
    expect(formSource).toContain("isMobileLotDetailMode ? 'รายละเอียดเต๋า' : activeLine.productId ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'")
    expect(formSource).toContain("const [mobileLotDetailId, setMobileLotDetailId] = useState<string | null>(null)")
    expect(formSource).toContain('const isMobileLotDetailMode = Boolean(')
    expect(formSource).toContain("lots.filter((entry) => entry.id === mobileLotDetailId)")
    expect(formSource).toContain('กรอกข้อมูลเต๋า แล้วกลับไปบันทึกสินค้านี้')
    expect(formSource).toContain('กลับไปสินค้า')
    expect(formSource).toContain('setMobileLotDetailId((current) => current ? (ticket.lineIdMap[current] ?? current) : current)')
    expect(formSource).toContain('mt-1 flex min-w-0 items-center gap-2')
    expect(formSource).toContain('{hasSelectedProduct ? (')
    expect(formSource).toContain('{activeLine.productId || getMainParentLines(form.lines).length > 1 ? (')
    expect(formSource).toContain('aria-label="ปิดหน้ากรอกสินค้า"')
    expect(formSource).toContain('const closeMobileProductEditor = useCallback(')
    expect(formSource).toContain('prepareValidationFocus(firstErrorKey)')
    expect(formSource).toContain('setCollapsedLotIds((current) => ({ ...current, [target.lotId as string]: false }))')
    expect(formSource).toContain('setMobileLotDetailId(target.lotId)')
    expect(formSource).toContain('setCollapsedImpurityIds((current) => ({ ...current, [target.impurityId as string]: false }))')
    expect(formSource).toContain('id={`weight-ticket-line-card-${line.id}`}')
    expect(formSource).toContain("window.matchMedia('(min-width: 1280px)').matches || event.key !== 'Escape'")
    expect(formSource).toContain("document.addEventListener('keydown', handleMobileProductEditorKeyDown)")
    expect(formSource).toContain('transition-transform duration-[400ms] ease-[cubic-bezier(.32,.72,0,1)]')
    expect(formSource).toContain('translate-y-full')
    expect(formSource).not.toContain('animate-in slide-in-from-bottom-8')
    expect(formSource).toContain('className="min-w-0 space-y-3"')
    expect(formSource).toContain('xl:contents')
    expect(formSource).not.toContain('MobileFilterSheet')
  })

  it('keeps the mobile header and product steps explicit', () => {
    expect(formSource).toContain("const [mobileEntryStep, setMobileEntryStep] = useState<'header' | 'products'>('header')")
    expect(formSource).toContain("mobileEntryStep === 'header' ? 'ขั้นตอน 1 จาก 2 · ข้อมูลหัวเอกสาร' : 'ขั้นตอน 2 จาก 2 · รายการสินค้า'")
    expect(formSource).toContain('บันทึกหัวเอกสารและไปต่อ')
    expect(formSource).toContain('แก้ไขหัวเอกสาร')
    expect(formSource).not.toContain('ตรวจหัวเอกสาร')
    expect(formSource).not.toContain('บันทึกเอกสาร')
    expect(formSource).toContain("isEmbeddedModal && mobileEntryStep === 'products' ? 'hidden xl:block' : ''")
  })

  it('routes product validation to the visible mobile product step before focusing', () => {
    const validationSource = formSource.match(/function prepareValidationFocus\(errorKey: string, sourceForm: FormState = form\) \{([\s\S]*?)\r?\n  \}/)

    expect(validationSource).not.toBeNull()
    expect(validationSource?.[1]).toContain("setMobileEntryStep('products')")
    expect(validationSource?.[1]).toContain("setMobileProductView('editor')")
    expect(validationSource?.[1]).toContain("setMobileEntryStep('header')")
    expect(validationSource?.[1]).toContain("setMobileProductView('list')")
    expect(formSource).toContain("if (firstErrorKey === 'lines') {\n        setMobileEntryStep('products')")
    expect(formSource).toContain("if (parsed || ['branchId', 'partyId', 'vehicleNo', 'warehouseName', 'godownName'].includes(firstErrorKey)) {\n        prepareValidationFocus(firstErrorKey)")
  })

  it('shows product image choices three per row on mobile', () => {
    expect(formSource).toContain('grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4')
  })

  it('uses the requested action colors and gives each lot a distinct detail section', () => {
    expect(formSource).toContain('border-emerald-600 bg-emerald-600')
    expect(formSource).toContain('bg-red-600')
    expect(formSource).toContain('บันทึกสินค้านี้')
    expect(formSource).not.toContain('!hasSelectedProduct || !line.version')
    expect(formSource).toContain('data-testid={`weight-ticket-add-lot-${line.id}`}')
    expect(formSource).toContain('disabled={!hasSelectedProduct || isLoadingTicket}')
    expect(formSource).toContain('if (!firstLineError)')
    expect(formSource).toContain('impurityChildLines.length > 0')
    expect(formSource).toContain('const impurityChildLines = getImpurityChildLines(line, form.lines)')
    expect(formSource).toContain('onClick={() => addImpurityLine(line)}')
    expect(formSource).toContain('if (isMobileLotDetailMode) return null')
    expect(formSource).toContain('{!isMobileLotDetailMode ? <div className="mt-4 border-t border-slate-200/60 pt-4">')
    expect(formSource).toContain('data-testid={`weight-ticket-add-nested-impurity-${child.id}`}')
    expect(formSource).toContain('onClick={() => addImpurityLine(child)}')
    expect(formSource).toContain('หักสิ่งเจือปนต่อ')
    expect(formSource).toContain('data-testid={`weight-ticket-lot-${lot.id}`}')
    expect(formSource).toContain('รายละเอียดเต๋าที่ {lotIndex + 1}')
    expect(formSource).toContain('border-slate-300 bg-white p-3 shadow-sm')
  })

  it('hides the lot summary while expanded for both WTI and WTO', () => {
    expect(formSource).toContain('const showLotSummary = isCollapsed')
    expect(formSource).not.toContain("const showLotSummary = form.type !== 'WTI' || isCollapsed")
    expect(formSource).toContain('{showLotSummary ? (')
    expect(formSource).toContain('รวม {formatWeight(lotGrossWeight)} กก.')
    expect(formSource).toContain('หลังหัก {formatWeight(lotNetBeforeImpurityWeight)} กก.')
  })

  it('keeps WTI impurity evidence optional and reuses the shared attachment grid', () => {
    expect(formSource).toContain("const showImpurityImageField = form.type === 'WTI' || isOtherProductImpurity")
    expect(formSource).toContain("label={isOtherProductImpurity ? 'รูปสินค้าที่ปนมา' : 'รูปสิ่งเจือปน (ไม่บังคับ)'}")
    expect(formSource).toContain('onAppend={(files) => void appendLineImages(child.id, files)}')
    expect(formSource).toContain('if (isParent || isSecondaryLot) {')
    expect(formSource).toContain('if (getLineImages(line).length === 0)')
    expect(formSource).not.toContain('รูปสิ่งเจือปน (ไม่บังคับ)*')
  })

  it('keeps impurity actions at product-section scope while preserving WTI/WTO differences', () => {
    expect(formSource).toContain('const impurityChildLines = getImpurityChildLines(line, form.lines)')
    expect(formSource).toContain('const boughtImpurityLinesForLine = getBoughtImpurityEntriesForLine(line, form.lines)')
    expect(formSource).toContain('onClick={() => addImpurityLine(line)}')
    expect(formSource).toContain("if (form.type !== 'WTI') return masterOptions")
    expect(formSource).toContain("const showImpurityImageField = form.type === 'WTI' || isOtherProductImpurity")
    expect(typeFormSectionsSource).toContain('export function WeightTicketWtiFormSection')
    expect(typeFormSectionsSource).toContain('export function WeightTicketWtoFormSection')
    expect(typeFormSectionsSource).toContain('<WarehouseField {...warehouse} />')
  })

  it('shows each product card a compact thumbnail from its real-lot evidence only', () => {
    expect(formSource).toContain('export function getProductCardImages(line: FormWeightTicketLine, allLines: FormWeightTicketLine[])')
    expect(formSource).toContain('...(isImpurityPurchaseLine(line) ? [] : [line])')
    expect(formSource).toContain("entry.deductionMode === 'none'")
    expect(formSource).toContain('!isImpurityPurchaseLine(entry)')
    expect(formSource).toContain('<WeightTicketLineCardThumbnail files={cardImages} />')
    expect(formSource).toContain('+{files.length - 1}')
  })

  it('does not show copied impurity evidence for a purchased-impurity parent card', () => {
    const impurityImage = { fileName: 'impurity.jpg', id: 'impurity-image', rawValue: 'impurity', url: 'https://example.test/impurity.jpg' }
    const realLotImage = { fileName: 'real-lot.jpg', id: 'real-lot-image', rawValue: 'real-lot', url: 'https://example.test/real-lot.jpg' }
    const parent = {
      deductionMode: 'none',
      id: 'purchased-product',
      imageFiles: [impurityImage],
      impuritySourceLineId: 'impurity-source',
    } as Parameters<typeof getProductCardImages>[0]
    const realLot = {
      deductionMode: 'none',
      id: 'real-lot',
      imageFiles: [realLotImage],
      parentId: parent.id,
    } as Parameters<typeof getProductCardImages>[0]
    const impurityDeduction = {
      deductionMode: 'kg',
      id: 'impurity-deduction',
      imageFiles: [impurityImage],
      parentId: parent.id,
    } as Parameters<typeof getProductCardImages>[0]

    expect(getProductCardImages(parent, [parent, realLot, impurityDeduction])).toEqual([realLotImage])
    expect(getProductCardImages(parent, [parent, impurityDeduction])).toEqual([])
  })

  it('uses two compact rows for a normal impurity input on mobile', () => {
    expect(formSource).toMatch(/\? 'grid-cols-1'\r?\n\s*: usesPercentDeduction/)
    expect(formSource).toContain("? 'grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)]'")
    expect(formSource).toContain("const mobileImpuritySelectorColumns = usesPercentDeduction ? 'col-span-3 md:col-span-1' : 'col-span-2 md:col-span-1'")
    expect(formSource).toContain('!isOtherProductImpurity && mobileImpuritySelectorColumns')
    expect(formSource).toContain("!isOtherProductImpurity && 'self-end md:self-auto'")
  })

  it('allows typing to search impurity options', () => {
    const impuritySelectorSource = formSource.match(/inputId=\{`weight-impurity-\$\{child\.id\}`\}([\s\S]*?)<\/FieldBlock>/)
    expect(impuritySelectorSource?.[1]).toContain('value={selectedImpurityId}')
    expect(impuritySelectorSource?.[1]).not.toContain('readOnly')
    expect(formSource).not.toMatch(/<SearchCombobox\s+key=\{`\$\{child\.id\}:\$\{selectedImpurityId\}:\$\{selectedImpurityLabel\}`\}/)
  })

  it('keeps the mobile document header in two input rows', () => {
    expect(formSource).toContain('"grid min-w-0 grid-cols-2 gap-3 sm:gap-4"')
  })

  it('keeps all three lot weight controls in one row', () => {
    expect(formSource).toContain('grid grid-cols-3 items-start gap-2 sm:gap-4')
    expect(formSource).not.toMatch(/<div className="col-span-2 sm:col-span-1">\s*<FieldBlock label="น้ำหนักหลังหักภาชนะ">/)
  })

  it('uses collapsible mobile cards for impurity entries', () => {
    expect(formSource).toContain('const [collapsedImpurityIds, setCollapsedImpurityIds] = useState<Record<string, boolean>>({})')
    expect(formSource).toContain('function toggleImpurityCollapsed(impurityId: string)')
    expect(formSource).toContain('const isCollapsed = Boolean(collapsedImpurityIds[child.id])')
    expect(formSource).toContain('aria-expanded={!isCollapsed}')
    expect(formSource).toContain('aria-controls={`weight-ticket-impurity-panel-${child.id}`}')
    expect(formSource).toContain('focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1')
    expect(formSource).toContain('id={`weight-ticket-impurity-panel-${child.id}`}')
    expect(formSource).toContain('setCollapsedImpurityIds((current) => ({')
    expect(formSource).toContain('const showImpuritySummary = isCollapsed')
    expect(formSource).toContain('!isCollapsed ? (')
    expect(formSource).toContain('rounded-lg border border-slate-200 bg-slate-50')
    expect(formSource).toContain('isOtherProductImpurity && selectedImpurityProductLabel')
    expect(formSource).toContain('aria-label="ลบรายการหักสิ่งเจือปน"')
    expect(formSource).toContain('ลบสิ่งเจือปน')
  })
  it('keeps mobile product and impurity removal behind the confirmation guards', () => {
    expect(formSource).toContain('requestProductRemoval(activeLine.id)')
    expect(formSource).toContain('requestImpurityRemoval(child.id)')
  })
})

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT
let prefersReducedMotion = false
const persistedDraftTicket = {
  branchId: 'branch-001',
  branchName: 'สาขาหลัก',
  canCancel: true,
  canEdit: true,
  cancelNote: '',
  cancelledAt: null,
  createdAt: '2026-08-05T00:00:00.000Z',
  documentDate: '2026-08-05',
  documentNo: 'WTI-TEST-001',
  enteredBy: 'ผู้ทดสอบ',
  id: 'ticket-001',
  imageCount: 0,
  imageNames: [],
  lines: [],
  partyId: 'supplier-001',
  partyName: 'ผู้ขายทดสอบ',
  pendingOutEvents: [],
  pendingOutHistory: [],
  productSummaries: [],
  remark: '',
  status: 'draft',
  totals: { containerDeductionWeight: 0, deductionWeight: 0, grossWeight: 0, netWeight: 0 },
  downstreamAllocations: [],
  timeline: [],
  type: 'WTI',
  updatedAt: null,
  updatedBy: 'ผู้ทดสอบ',
  usageTimeline: [],
  usedInPurchaseBillCount: 0,
  usedInPurchaseBillDocNos: [],
  usedInSalesBillCount: 0,
  usedInSalesBillDocNos: [],
  vehicleImageCount: 0,
  vehicleImageNames: [],
  vehicleNo: '83-5476',
  godownName: 'โกดัง A',
}

beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
})

describe('weight-ticket product editor behavior', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    prefersReducedMotion = false
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('matchMedia', (query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query === '(prefers-reduced-motion: reduce)' && prefersReducedMotion,
      media: '',
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }))
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    mocks.cachedWeightTicketReferences.mockImplementation((url: string) => Promise.resolve(
      url.endsWith('/products')
        ? {
            rows: [{ code: 'P-001', id: 'product-001', name: 'เหล็ก', type: 'เศษเหล็ก', unit: 'กก.' }],
          }
        : {
            branches: [{ id: 'branch-001', name: 'สาขาหลัก' }],
            customers: [{ branchIds: ['branch-001'], id: 'customer-001', name: 'ลูกค้าทดสอบ' }],
            impurities: [],
            suppliers: [{ branchIds: ['branch-001'], id: 'supplier-001', name: 'ผู้ขายทดสอบ' }],
        },
    ))
    mocks.fetchFreshWeightTicketReferences.mockImplementation((url: string) => Promise.resolve(
      url.endsWith('/products')
        ? { rows: [{ code: 'P-001', id: 'product-001', name: 'เหล็ก', type: 'เศษเหล็ก', unit: 'กก.' }] }
        : url.endsWith('/impurity-options')
          ? { options: [] }
        : {
            options: url.includes('type=WTI')
              ? [{ branchIds: ['branch-001'], id: 'supplier-001', name: 'ผู้ขายทดสอบ' }]
              : [{ branchIds: ['branch-001'], id: 'customer-001', name: 'ลูกค้าทดสอบ' }],
          },
    ))
    mocks.saveWeightTicket.mockImplementation(async (values: {
      lines: Array<Record<string, unknown>>
      partyId: string
      type: 'WTI' | 'WTO'
    }) => ({
      ...persistedDraftTicket,
      documentNo: values.type === 'WTO' ? 'WTO-TEST-001' : persistedDraftTicket.documentNo,
      lines: values.lines.map((line, index) => ({
        ...line,
        impurityName: '',
        impuritySourceLineNo: null,
        lineNo: index + 1,
        parentLineNo: null,
        productName: '',
        warehouseName: '',
        warehouseType: '',
      })),
      partyId: values.partyId,
      partyName: values.type === 'WTO' ? 'ลูกค้าทดสอบ' : persistedDraftTicket.partyName,
      type: values.type,
    }))
    mocks.patchWeightTicketChanges.mockImplementation(mocks.saveWeightTicket)
  })

  afterEach(async () => {
    vi.useRealTimers()
    // Let reference/preview promises settle inside act before unmounting so
    // their guarded state updates do not leak into the next test.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    act(() => root.unmount())
    container.remove()
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  async function renderForm(initialType: 'WTI' | 'WTO' = 'WTI', options: { embeddedModal?: boolean; validHeader?: boolean } = {}) {
    const form = React.createElement(WeightTicketFormCore, { embeddedModal: options.embeddedModal, initialType })
    await act(async () => {
      root.render(
        React.createElement(
          FormSafetyProvider,
          null,
          options.embeddedModal ? React.createElement(Dialog, { open: true }, form) : form,
        ),
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    if (options.validHeader !== false) await fillValidHeader(initialType)
  }

  async function fillValidHeader(type: 'WTI' | 'WTO') {
    const chooseOption = (label: string) => {
      const option = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find((button) => button.textContent?.includes(label))
      if (!option) throw new Error(`Missing combobox option: ${label}`)
      option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    }
    await vi.waitFor(() => {
      expect(mocks.cachedWeightTicketReferences).toHaveBeenCalled()
    })
    const branchInput = container.querySelector<HTMLInputElement>('#weight-ticket-branch')
    await act(async () => {
      branchInput?.click()
      await Promise.resolve()
    })
    await act(async () => {
      chooseOption('สาขาหลัก')
      await Promise.resolve()
    })
    expect(branchInput?.value).toBe('สาขาหลัก')

    const partyInput = container.querySelector<HTMLInputElement>('#weight-ticket-party')
    expect(partyInput?.disabled).toBe(false)
    await act(async () => {
      partyInput?.click()
      await Promise.resolve()
    })
    await vi.waitFor(() => {
      expect(Array.from(document.querySelectorAll('button')).some((button) => (
        button.textContent?.includes(type === 'WTO' ? 'ลูกค้าทดสอบ' : 'ผู้ขายทดสอบ')
      ))).toBe(true)
    })
    await act(async () => {
      chooseOption(type === 'WTO' ? 'ลูกค้าทดสอบ' : 'ผู้ขายทดสอบ')
      await Promise.resolve()
    })

    const setInput = (selector: string, value: string) => {
      const input = container.querySelector<HTMLInputElement>(selector)
      if (!input) throw new Error(`Missing input: ${selector}`)
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
    await act(async () => {
      setInput('#weight-ticket-vehicleNo', '83-5476')
      setInput('input[placeholder="เช่น โกดัง A"]', 'โกดัง A')
      await Promise.resolve()
    })
  }

  it('waits for an off-screen frame before entering even when reduced motion is requested', async () => {
    const queuedFrames = new Map<number, FrameRequestCallback>()
    let nextFrameId = 1
    prefersReducedMotion = true
    vi.stubGlobal('cancelAnimationFrame', (frameId: number) => queuedFrames.delete(frameId))
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const frameId = nextFrameId++
      queuedFrames.set(frameId, callback)
      return frameId
    })
    await renderForm()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('#weight-ticket-add-product')?.click()
      await Promise.resolve()
    })

    const sheet = container.querySelector<HTMLElement>('[class*="transition-transform"]')
    expect(sheet?.classList.contains('translate-y-full')).toBe(true)

    const firstFrame = queuedFrames.get(1)
    expect(firstFrame).toBeDefined()
    queuedFrames.delete(1)
    await act(async () => {
      firstFrame?.(0)
      await Promise.resolve()
    })

    expect(sheet?.classList.contains('translate-y-full')).toBe(true)

    const secondFrame = queuedFrames.get(2)
    expect(secondFrame).toBeDefined()
    queuedFrames.delete(2)
    await act(async () => {
      secondFrame?.(16)
      await Promise.resolve()
    })

    expect(sheet?.classList.contains('translate-y-0')).toBe(true)
  })

  it('opens a blank editor without focusing or opening the product dropdown until the user taps it', async () => {
    await renderForm()

    const addProductButton = container.querySelector<HTMLButtonElement>('#weight-ticket-add-product')
    expect(addProductButton).not.toBeNull()

    await act(async () => {
      addProductButton?.click()
      await Promise.resolve()
    })

    expect(container.querySelector<HTMLButtonElement>('#weight-ticket-add-product')).not.toBeNull()

    const productInput = container.querySelector<HTMLInputElement>('[id^="weight-product-"]')
    expect(productInput).not.toBeNull()
    expect(productInput?.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).not.toBe(productInput)

    await act(async () => {
      productInput?.click()
      await Promise.resolve()
    })

    expect(productInput?.getAttribute('aria-expanded')).toBe('true')
  })

  it('collapses and expands a product impurity card after it is added', async () => {
    await renderForm()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('#weight-ticket-add-product')?.click()
      await Promise.resolve()
    })

    const productInput = container.querySelector<HTMLInputElement>('[id^="weight-product-"]')
    expect(productInput).not.toBeNull()
    await act(async () => {
      productInput?.click()
      await Promise.resolve()
    })
    await vi.waitFor(() => {
      expect(Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.includes('เหล็ก'))).toBe(true)
    })
    const productOption = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find((button) => button.textContent?.includes('เหล็ก'))
    await act(async () => {
      productOption?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })

    await vi.waitFor(() => {
      expect(container.querySelector<HTMLInputElement>('[id^="weight-product-"]')?.value).toContain('เหล็ก')
    })
    const addImpurityButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.trim() === 'เพิ่มสิ่งเจือปน')
    expect(addImpurityButton).not.toBeUndefined()
    await act(async () => {
      addImpurityButton?.click()
      await Promise.resolve()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[id^="weight-impurity-"]')).not.toBeNull()
    })
    const collapseButton = container.querySelector<HTMLButtonElement>('button[aria-controls^="weight-ticket-impurity-panel-"]')
    expect(collapseButton).not.toBeUndefined()
    await act(async () => {
      collapseButton?.click()
      await Promise.resolve()
    })

    expect(container.querySelector('[id^="weight-impurity-"]')).toBeNull()
    const expandButton = container.querySelector<HTMLButtonElement>('button[aria-controls^="weight-ticket-impurity-panel-"]')
    expect(expandButton).not.toBeUndefined()
    await act(async () => {
      expandButton?.click()
      await Promise.resolve()
    })
    expect(container.querySelector('[id^="weight-impurity-"]')).not.toBeNull()
  })

  it('keeps nested impurity cards independent and preserves entered values while collapsing', async () => {
    mocks.fetchFreshWeightTicketReferences.mockImplementation((url: string) => Promise.resolve(
      url.endsWith('/products')
        ? { rows: [{ code: 'P-001', id: 'product-001', name: 'เหล็ก', type: 'เศษเหล็ก', unit: 'กก.' }] }
        : url.endsWith('/impurity-options')
          ? { options: [{ id: 'impurity-001', label: 'ฝุ่น' }] }
          : url.includes('type=WTI')
            ? { options: [{ branchIds: ['branch-001'], id: 'supplier-001', name: 'ผู้ขายทดสอบ' }] }
            : { options: [{ branchIds: ['branch-001'], id: 'customer-001', name: 'ลูกค้าทดสอบ' }] },
    ))

    await renderForm()
    await act(async () => {
      container.querySelector<HTMLButtonElement>('#weight-ticket-add-product')?.click()
      await Promise.resolve()
    })

    const productInput = container.querySelector<HTMLInputElement>('[id^="weight-product-"]')
    await act(async () => {
      productInput?.click()
      await Promise.resolve()
    })
    await vi.waitFor(() => {
      expect(Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.includes('เหล็ก'))).toBe(true)
    })
    const productOption = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find((button) => button.textContent?.includes('เหล็ก'))
    await act(async () => {
      productOption?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(container.querySelector<HTMLInputElement>('[id^="weight-product-"]')?.value).toContain('เหล็ก'))

    const addImpurityButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.trim() === 'เพิ่มสิ่งเจือปน')
    expect(addImpurityButton).not.toBeUndefined()
    await act(async () => {
      addImpurityButton?.click()
      await Promise.resolve()
    })

    const firstImpurityInput = container.querySelector<HTMLInputElement>('[id^="weight-impurity-"]')
    expect(firstImpurityInput).not.toBeNull()
    await vi.waitFor(() => expect(firstImpurityInput?.value).toContain('ฝุ่น'))
    const firstDeductionInput = container.querySelector<HTMLInputElement>('[id^="weight-deduction-"]')
    expect(firstDeductionInput).not.toBeNull()
    const firstImpurityId = firstDeductionInput?.id.replace('weight-deduction-', '') ?? ''
    const setInputValue = async (input: HTMLInputElement, value: string) => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        setter?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        await Promise.resolve()
      })
    }
    await setInputValue(firstDeductionInput!, '2')

    const nestedAddButton = container.querySelector<HTMLButtonElement>(`[data-testid="weight-ticket-add-nested-impurity-${firstImpurityId}"]`)
    expect(nestedAddButton?.disabled).toBe(false)
    await act(async () => {
      nestedAddButton?.click()
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(container.querySelectorAll('[id^="weight-impurity-"]').length).toBe(2))

    const deductionInputs = Array.from(container.querySelectorAll<HTMLInputElement>('[id^="weight-deduction-"]'))
    expect(deductionInputs).toHaveLength(2)
    const secondImpurityId = deductionInputs.find((input) => input.id !== firstDeductionInput?.id)?.id.replace('weight-deduction-', '') ?? ''
    const panelIds = Array.from(container.querySelectorAll<HTMLElement>('[id^="weight-ticket-impurity-panel-"]')).map((panel) => panel.id)
    expect(panelIds).toHaveLength(2)

    const panelControls = (panelId: string) => Array.from(container.querySelectorAll<HTMLButtonElement>(`button[aria-controls="${panelId}"]`))
    expect(panelControls(panelIds[0])).toHaveLength(2)
    expect(panelControls(panelIds[0]).every((button) => button.getAttribute('aria-expanded') === 'true')).toBe(true)

    await act(async () => {
      panelControls(panelIds[0])[1]?.click()
      await Promise.resolve()
    })
    expect(panelControls(panelIds[0]).every((button) => button.getAttribute('aria-expanded') === 'false')).toBe(true)
    expect(container.querySelector(`#weight-deduction-${firstImpurityId}`)).toBeNull()
    expect(container.querySelector(`#weight-deduction-${secondImpurityId}`)).not.toBeNull()

    await act(async () => {
      panelControls(panelIds[0])[0]?.click()
      await Promise.resolve()
    })
    expect(container.querySelector<HTMLInputElement>(`#weight-deduction-${firstImpurityId}`)?.value).toBe('2')

    await act(async () => {
      panelControls(panelIds[1])[1]?.click()
      await Promise.resolve()
    })
    expect(container.querySelector(`#weight-deduction-${firstImpurityId}`)).not.toBeNull()
    expect(container.querySelector(`#weight-deduction-${secondImpurityId}`)).toBeNull()
  })

  it('reserves equal mobile label height for all three product-entry weight inputs', async () => {
    await renderForm()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('#weight-ticket-add-product')?.click()
      await Promise.resolve()
    })

    const productInput = container.querySelector<HTMLInputElement>('[id^="weight-product-"]')
    expect(Array.from(container.querySelectorAll<HTMLLabelElement>('label')).some((label) => label.textContent?.includes('น้ำหนักรวม'))).toBe(false)
    await act(async () => {
      productInput?.click()
      await Promise.resolve()
    })
    await vi.waitFor(() => {
      expect(Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.includes('เหล็ก'))).toBe(true)
    })
    await act(async () => {
      const option = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find((button) => button.textContent?.includes('เหล็ก'))
      option?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })

    const weightLabels = Array.from(container.querySelectorAll<HTMLLabelElement>('label')).filter((label) => (
      /^(น้ำหนักรวม \(กก\. \/ ลัง\)|หักภาชนะ \(กก\.\)|น้ำหนักหลังหักภาชนะ)/.test(label.textContent?.trim() ?? '')
    ))

    expect(weightLabels).toHaveLength(3)
    for (const label of weightLabels) {
      expect(label.className).toContain('min-h-10')
      expect(label.className).toContain('leading-5')
      expect(label.className).toContain('sm:min-h-0')
    }
  })

  it('still focuses the first invalid field after saving an incomplete product entry', async () => {
    await renderForm('WTI', { validHeader: false })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('#weight-ticket-add-product')?.click()
      await Promise.resolve()
    })

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'บันทึก')
    expect(saveButton).toBeDefined()

    await act(async () => {
      saveButton?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(document.activeElement).toBe(container.querySelector('#weight-ticket-branch'))
  })

  it('keeps the sheet mounted while its close motion finishes, then removes it', async () => {
    await renderForm()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('#weight-ticket-add-product')?.click()
      await Promise.resolve()
    })

    vi.useFakeTimers()
    const closeButton = container.querySelector<HTMLButtonElement>('[aria-label="ปิดหน้ากรอกสินค้า"]')
    expect(closeButton).not.toBeNull()

    await act(async () => {
      closeButton?.click()
      await Promise.resolve()
    })

    const closingOverlay = container.querySelector<HTMLElement>('[class*="fixed"][class*="inset-0"][class*="z-40"]')
    expect(closingOverlay).not.toBeNull()
    expect(closingOverlay?.classList.contains('opacity-0')).toBe(false)
    expect(container.querySelector('[class*="translate-y-full"]')).not.toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(399)
    })

    expect(container.querySelector('[class*="fixed"][class*="inset-0"][class*="z-40"]')).not.toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(container.querySelector('[class*="fixed"][class*="inset-0"][class*="z-40"]')).toBeNull()
  })

  it('closes the mobile editor with Escape even when focus stays on the add-product trigger', async () => {
    await renderForm()

    const addProductButton = container.querySelector<HTMLButtonElement>('#weight-ticket-add-product')
    expect(addProductButton).not.toBeNull()

    await act(async () => {
      addProductButton?.click()
      addProductButton?.focus()
      await Promise.resolve()
    })

    expect(document.activeElement).toBe(document.body)

    vi.useFakeTimers()
    const escapeEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' })
    await act(async () => {
      document.dispatchEvent(escapeEvent)
      await Promise.resolve()
    })

    expect(escapeEvent.defaultPrevented).toBe(true)
    expect(container.querySelector('[class*="fixed"][class*="inset-0"][class*="z-40"]')).not.toBeNull()
    expect(container.querySelector('[class*="translate-y-full"]')).not.toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(399)
    })

    expect(container.querySelector('[class*="fixed"][class*="inset-0"][class*="z-40"]')).not.toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(container.querySelector('[class*="fixed"][class*="inset-0"][class*="z-40"]')).toBeNull()
  })
  it('keeps the same exit motion when the browser requests reduced motion', async () => {
    prefersReducedMotion = true
    await renderForm()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('#weight-ticket-add-product')?.click()
      await Promise.resolve()
    })

    vi.useFakeTimers()
    const closeButton = container.querySelector<HTMLButtonElement>('[aria-label="ปิดหน้ากรอกสินค้า"]')
    await act(async () => {
      closeButton?.click()
      await Promise.resolve()
    })

    expect(container.querySelector('[class*="fixed"][class*="inset-0"][class*="z-40"]')).not.toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect(container.querySelector('[class*="fixed"][class*="inset-0"][class*="z-40"]')).toBeNull()
  })

  it('uses the same exit motion before deleting a mobile product', async () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    await renderForm()

    const addProductButton = container.querySelector<HTMLButtonElement>('#weight-ticket-add-product')
    await act(async () => {
      addProductButton?.click()
      await Promise.resolve()
    })

    now += 400
    await act(async () => {
      container.querySelector<HTMLButtonElement>('#weight-ticket-add-product')?.click()
      await Promise.resolve()
    })

    expect(container.querySelectorAll('[id^="weight-ticket-line-card-"]')).toHaveLength(2)
    vi.useFakeTimers()
    const deleteButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'ลบสินค้า')
    expect(deleteButton).toBeDefined()

    await act(async () => {
      deleteButton?.click()
      await Promise.resolve()
    })

    expect(container.querySelectorAll('[id^="weight-ticket-line-card-"]')).toHaveLength(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect(container.querySelectorAll('[id^="weight-ticket-line-card-"]')).toHaveLength(2)
  })

  it('auto-saves an empty WTI draft once and ignores a duplicate add while saving', async () => {
    let resolveSave: ((ticket: typeof persistedDraftTicket) => void) | undefined
    mocks.saveWeightTicket.mockReturnValueOnce(new Promise((resolve) => {
      resolveSave = resolve
    }))

    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    await renderForm('WTI')

    const addProductButton = container.querySelector<HTMLButtonElement>('#weight-ticket-add-product')
    expect(addProductButton).not.toBeNull()
    await act(async () => {
      addProductButton?.click()
      addProductButton?.click()
      await Promise.resolve()
    })

    expect(mocks.saveWeightTicket).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[aria-label="ปิดหน้ากรอกสินค้า"]')).not.toBeNull()
    expect(container.querySelector('[id^="weight-product-"]')).not.toBeNull()

    now += 400
    await act(async () => {
      container.querySelector<HTMLButtonElement>('#weight-ticket-add-product')?.click()
      await Promise.resolve()
    })

    expect(mocks.saveWeightTicket).toHaveBeenCalledTimes(1)
    expect(container.querySelectorAll('[id^="weight-ticket-line-card-"]')).toHaveLength(2)

    const remarkInput = container.querySelector<HTMLTextAreaElement>('textarea[placeholder="ระบุหมายเหตุเพิ่มเติม"]')
    expect(remarkInput).not.toBeNull()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(remarkInput, 'แก้ไขระหว่างกำลังบันทึก')
      remarkInput?.dispatchEvent(new Event('input', { bubbles: true }))
      remarkInput?.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })

    await act(async () => {
      resolveSave?.(persistedDraftTicket)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.saveWeightTicket).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[aria-label="ปิดหน้ากรอกสินค้า"]')).not.toBeNull()
    expect(container.querySelector('[id^="weight-product-"]')).not.toBeNull()
    expect(remarkInput?.value).toBe('แก้ไขระหว่างกำลังบันทึก')
    expect(container.querySelectorAll('[id^="weight-ticket-line-card-"]')).toHaveLength(2)
  })

  it('shows the assigned document number immediately after the header-only draft is saved', async () => {
    await renderForm('WTI', { embeddedModal: true })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('#weight-ticket-header-continue')?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    await vi.waitFor(() => {
      expect(container.textContent).toContain('WTI-TEST-001')
    })
  })

  it('saves the first product section against the header draft and keeps the persisted line', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/images/preview')) {
        return new Response(JSON.stringify({ imageNames: [], lines: [], refreshAfterMs: null, vehicleImageNames: [] }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        })
      }
      if (url.includes('/telemetry/')) return new Response('{}', { status: 200 })
      if (init?.method === 'GET') {
        return new Response(JSON.stringify({ maxUploadBytes: 10 * 1024 * 1024, uploadConcurrency: 2 }), { status: 200 })
      }
      return new Response(JSON.stringify({
        bucket: 'weight-ticket-pdfs',
        fileName: 'proof.jpg',
        storageKey: 'tickets/proof.jpg',
        thumbnailStatus: 'queued',
        thumbnailStorageKey: 'tickets/thumbnails/proof.jpg',
        thumbnailUrl: 'https://example.com/proof-thumbnail.jpg',
      }), { status: 200 })
    }))
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:proof'),
      revokeObjectURL: vi.fn(),
    })
    mocks.patchWeightTicketChanges.mockImplementationOnce(async (_ticketId: string, values: {
      lines: Array<{
        containerDeductionWeight: number
        deductionMode: 'none' | 'kg' | 'percent'
        deductionValue: number
        grossWeight: number
        id: string
        imageNames: string[]
        impurityId: string
        note: string
        productId: string
        warehouseId: string
      }>
    }) => {
      const line = values.lines[0]
      return {
        ...persistedDraftTicket,
        lineIdMap: { [line.id]: '1001' },
        lines: [{
          ...line,
          containerDeductionWeight: String(line.containerDeductionWeight),
          containerDeductionWeightValue: line.containerDeductionWeight,
          deductionValue: String(line.deductionValue),
          deductionWeight: 0,
          grossWeight: String(line.grossWeight),
          grossWeightValue: line.grossWeight,
          id: '1001',
          imageCount: line.imageNames.length,
          impurityName: '',
          impurityProductId: '',
          impurityProductName: '',
          impuritySourceLineNo: null,
          lineNo: 1,
          netWeight: line.grossWeight - line.containerDeductionWeight,
          parentLineNo: null,
          productName: 'เหล็ก',
          version: 1,
          warehouseName: '',
          warehouseType: '',
        }],
      }
    })

    await renderForm('WTI')
    await act(async () => {
      container.querySelector<HTMLButtonElement>('#weight-ticket-add-product')?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await vi.waitFor(() => {
      expect(mocks.saveWeightTicket).toHaveBeenCalledTimes(1)
      expect(container.textContent).toContain(persistedDraftTicket.documentNo)
    })

    const productInput = container.querySelector<HTMLInputElement>('[id^="weight-product-"]')
    await act(async () => {
      productInput?.click()
      await Promise.resolve()
    })
    const productOption = await vi.waitFor(() => {
      const option = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find((button) => button.textContent?.includes('เหล็ก'))
      expect(option).toBeDefined()
      return option
    })
    await act(async () => {
      productOption?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })

    const grossInput = container.querySelector<HTMLInputElement>('[id^="weight-gross-"]')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(grossInput, '100')
      grossInput?.dispatchEvent(new Event('input', { bubbles: true }))
      grossInput?.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    const imageInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[data-image-source="gallery"]'))
    const imageInput = imageInputs.at(-1)
    const proof = new File(['proof'], 'proof.jpg', { type: 'image/jpeg' })
    Object.defineProperty(imageInput, 'files', {
      configurable: true,
      value: { 0: proof, item: (index: number) => index === 0 ? proof : null, length: 1 },
    })
    await act(async () => {
      imageInput?.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(container.textContent).toContain('proof.jpg'))
    await vi.waitFor(() => expect(container.textContent).not.toContain('แนบรูปภาพบรรทัดที่ 1 อย่างน้อย 1 รูป'))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const saveSectionButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.trim() === 'บันทึกสินค้านี้')
    expect(saveSectionButton).toBeDefined()
    expect(saveSectionButton?.disabled).toBe(false)
    await act(async () => {
      saveSectionButton?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(grossInput?.value).toBe('100')
    expect(container.textContent).not.toContain('กรุณาแก้ข้อมูลใน section นี้ให้ครบก่อนบันทึก')

    await vi.waitFor(() => {
      expect(mocks.patchWeightTicketChanges).toHaveBeenCalledWith(
        persistedDraftTicket.id,
        expect.objectContaining({ id: persistedDraftTicket.id }),
      )
      expect(container.querySelector('#weight-gross-1001')).not.toBeNull()
    })
  })

  it('opens the first WTO product immediately while saving a header-only draft', async () => {
    let resolveSave: ((ticket: typeof persistedDraftTicket) => void) | undefined
    mocks.saveWeightTicket.mockReturnValueOnce(new Promise((resolve) => {
      resolveSave = resolve
    }))

    await renderForm('WTO')

    const addProductButton = container.querySelector<HTMLButtonElement>('#weight-ticket-add-product')
    await act(async () => {
      addProductButton?.click()
      await Promise.resolve()
    })

    expect(mocks.saveWeightTicket).toHaveBeenCalledTimes(1)
    expect(mocks.saveWeightTicket).toHaveBeenCalledWith(expect.objectContaining({
      lines: [],
      saveScope: 'header',
      type: 'WTO',
    }))
    expect(container.querySelector('[aria-label="ปิดหน้ากรอกสินค้า"]')).not.toBeNull()
    expect(container.querySelectorAll('[id^="weight-ticket-line-card-"]')).toHaveLength(1)

    await act(async () => {
      resolveSave?.({
        ...persistedDraftTicket,
        documentNo: 'WTO-TEST-001',
        partyId: 'customer-001',
        partyName: 'ลูกค้าทดสอบ',
        type: 'WTO',
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[aria-label="ปิดหน้ากรอกสินค้า"]')).not.toBeNull()
    expect(container.querySelectorAll('[id^="weight-ticket-line-card-"]')).toHaveLength(1)
  })
})
