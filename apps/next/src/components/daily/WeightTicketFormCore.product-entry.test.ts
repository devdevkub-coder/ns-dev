// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cachedWeightTicketReferences: vi.fn(),
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
}))

import { getProductCardImages, WeightTicketFormCore } from './WeightTicketFormCore'

const formSource = readFileSync(
  resolve(process.cwd(), 'src/components/daily/WeightTicketFormCore.tsx'),
  'utf8',
)

describe('weight-ticket product entry start contract', () => {
  it('starts with no product line until the user explicitly adds one', () => {
    expect(formSource).toMatch(/function initialForm[\s\S]*?lines:\s*\[\],/)
    expect(formSource).toContain("next.lines = 'เพิ่มรายการสินค้าอย่างน้อย 1 รายการ'")
    expect(formSource).toContain("const firstErrorKey = errors.lines ? 'lines' : errorKeys[0]")
    expect(formSource).toContain('ยังไม่มีสินค้า — กด &quot;+ เพิ่มสินค้า&quot;')
  })
})

describe('weight-ticket mobile product workspace contract', () => {
  it('opens a blank product editor without auto-opening the product dropdown', () => {
    const addLineSource = formSource.match(/function addLine\(\) \{([\s\S]*?)\n  \}\n\n  function closeMobileProductEditor/)

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
    expect(formSource).toContain('function closeMobileProductEditor(')
    expect(formSource).toContain('id={`weight-ticket-line-card-${line.id}`}')
    expect(formSource).toContain("window.matchMedia('(min-width: 1280px)').matches || event.key !== 'Escape'")
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
    expect(formSource).toContain("? 'grid-cols-1'\n                                  : usesPercentDeduction")
    expect(formSource).toContain("? 'grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)]'")
    expect(formSource).toContain("const mobileImpuritySelectorColumns = usesPercentDeduction ? 'col-span-3 md:col-span-1' : 'col-span-2 md:col-span-1'")
    expect(formSource).toContain('!isOtherProductImpurity && mobileImpuritySelectorColumns')
    expect(formSource).toContain("!isOtherProductImpurity && 'self-end md:self-auto'")
  })

  it('keeps the mobile document header in two input rows', () => {
    expect(formSource).toContain('"grid min-w-0 grid-cols-2 gap-3 sm:gap-4"')
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
})

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT
let prefersReducedMotion = false

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
            customers: [],
            impurities: [],
            suppliers: [],
          },
    ))
  })

  afterEach(() => {
    vi.useRealTimers()
    act(() => root.unmount())
    container.remove()
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  async function renderForm() {
    await act(async () => {
      root.render(React.createElement(WeightTicketFormCore))
      await new Promise((resolve) => setTimeout(resolve, 0))
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

  it('still focuses the first invalid field after saving an incomplete product entry', async () => {
    await renderForm()

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
    await renderForm()

    const addProductButton = container.querySelector<HTMLButtonElement>('#weight-ticket-add-product')
    await act(async () => {
      addProductButton?.click()
      await Promise.resolve()
    })

    const addAnotherProductButton = Array.from(container.querySelectorAll('button')).find((button) => (
      button !== addProductButton && button.textContent?.trim() === 'เพิ่มสินค้า'
    ))
    expect(addAnotherProductButton).toBeDefined()

    await act(async () => {
      addAnotherProductButton?.click()
      await Promise.resolve()
    })

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
})
