// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { FormSafetyProvider } from '@/components/ui/FormSafetyProvider'
const mocks = vi.hoisted(() => ({
  cachedWeightTicketReferences: vi.fn(),
  fetchFreshWeightTicketReferences: vi.fn(),
  saveWeightTicket: vi.fn(),
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
}))

import { changeWeightTicketProduct, getProductCardImages, remapWeightTicketLineIds, remapWeightTicketLineKey, resolvePersistedWeightTicketLotSource, shouldPersistWeightTicketBeforeAdding, WeightTicketFormCore } from './WeightTicketFormCore'

const formSource = readFileSync(
  resolve(process.cwd(), 'src/components/daily/WeightTicketFormCore.tsx'),
  'utf8',
)

describe('weight-ticket product entry start contract', () => {
  it('starts with no product line until the user explicitly adds one', () => {
    expect(formSource).toMatch(/function initialForm[\s\S]*?lines:\s*\[\],/)
    expect(formSource).toContain("if (form.type === 'WTO' && parentLines.length === 0) next.lines = 'เพิ่มรายการสินค้าอย่างน้อย 1 รายการ'")
    expect(formSource).toContain("const firstErrorKey = errors.lines ? 'lines' : errorKeys[0]")
    expect(formSource).toContain('ยังไม่มีสินค้า — กด &quot;+ เพิ่มสินค้า&quot;')
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
    expect(formSource).toContain("activeLine.productId ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'")
    expect(formSource).toContain('aria-label="ปิดหน้ากรอกสินค้า"')
    expect(formSource).toContain('const closeMobileProductEditor = useCallback(')
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

  it('shows product image choices three per row on mobile', () => {
    expect(formSource).toContain('grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4')
  })

  it('uses the requested action colors and gives each lot a distinct detail section', () => {
    expect(formSource).toContain('border-emerald-600 bg-emerald-600')
    expect(formSource).toContain('border-red-600 bg-red-600')
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

  it('keeps impurity selection as a keyboard-free dropdown', () => {
    expect(formSource).toMatch(/inputId=\{`weight-impurity-\$\{child\.id\}`\}[\s\S]*?readOnly\s+value=\{selectedImpurityId\}/)
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
    expect(formSource).toContain('const isCollapsed = !isOtherProductImpurity && Boolean(collapsedImpurityIds[child.id])')
    expect(formSource).toContain('aria-expanded={!isCollapsed}')
    expect(formSource).toContain('setCollapsedImpurityIds((current) => ({')
    expect(formSource).toContain("isOtherProductImpurity ? 'flex' : 'hidden md:flex'")
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
  })

  afterEach(() => {
    vi.useRealTimers()
    act(() => root.unmount())
    container.remove()
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  async function renderForm(initialType: 'WTI' | 'WTO' = 'WTI', options: { validHeader?: boolean } = {}) {
    await act(async () => {
      root.render(
        React.createElement(
          FormSafetyProvider,
          null,
          React.createElement(WeightTicketFormCore, { initialType }),
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
    setInput('#weight-ticket-vehicleNo', '83-5476')
    setInput('input[placeholder="เช่น โกดัง A"]', 'โกดัง A')
    await act(async () => {
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

    expect(Array.from(container.querySelectorAll('button')).filter((button) => (
      button.textContent?.trim() === 'เพิ่มสินค้า' && button.id !== 'weight-ticket-add-product'
    ))).toHaveLength(0)

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

  it('reserves equal mobile label height for all three product-entry weight inputs', async () => {
    await renderForm()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('#weight-ticket-add-product')?.click()
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

    expect(document.activeElement).toBe(addProductButton)

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
      addProductButton?.click()
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
    expect(container.querySelector('[class*="fixed"][class*="inset-0"][class*="z-40"]')).not.toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect(container.querySelectorAll('[id^="weight-ticket-line-card-"]')).toHaveLength(1)
    expect(container.querySelector('[class*="fixed"][class*="inset-0"][class*="z-40"]')).toBeNull()
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
      addProductButton?.click()
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
