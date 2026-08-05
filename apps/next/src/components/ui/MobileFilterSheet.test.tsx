// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { MobileFilterSheet } from './MobileFilterSheet'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

describe('MobileFilterSheet', () => {
  it('uses the canonical 80dvh cap and a theme-stable dark scrim', () => {
    const html = renderToStaticMarkup(
      <MobileFilterSheet
        footer={<button type="button">ใช้ตัวกรอง</button>}
        onClose={() => undefined}
        title="ตัวกรอง"
      >
        <div>filters</div>
      </MobileFilterSheet>,
    )

    expect(html).toContain('max-h-[80dvh]')
    expect(html).toContain('bg-[rgba(2,6,23,0.55)]')
  })

  it('uses the neutral table-header palette instead of the sidebar palette', () => {
    const html = renderToStaticMarkup(
      <MobileFilterSheet
        footer={<button type="button">Apply filters</button>}
        onClose={() => undefined}
        title="Filters"
      >
        <div>filters</div>
      </MobileFilterSheet>,
    )

    expect(html).toContain('border-b border-slate-200 bg-slate-100')
    expect(html).toContain('<h4 class="text-sm font-bold text-slate-700"')
    expect(html).not.toContain('<h4 class="text-sm font-bold text-white"')
  })

  it('exposes a labelled modal dialog without duplicating the footer exit in its header', () => {
    const html = renderToStaticMarkup(
      <MobileFilterSheet
        footer={<button type="button">ใช้ตัวกรอง</button>}
        onClose={() => undefined}
        title="ตัวกรอง"
      >
        <div>filters</div>
      </MobileFilterSheet>,
    )

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-labelledby=')
    expect(html).toContain('ใช้ตัวกรอง')
    expect(html).not.toContain('aria-label="ปิดตัวกรอง"')
  })

  it('moves focus into the sheet, closes on Escape, and restores the trigger focus', async () => {
    const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT
    const trigger = document.createElement('button')
    const container = document.createElement('div')
    const onClose = vi.fn()
    document.body.append(trigger, container)
    trigger.focus()
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    const root = createRoot(container)

    try {
      await act(async () => {
        root.render(
          <MobileFilterSheet
            footer={<button type="button">ใช้ตัวกรอง</button>}
            onClose={onClose}
            title="ตัวกรอง"
          >
            <input aria-label="ค้นหา" />
          </MobileFilterSheet>,
        )
      })

      const firstInput = container.querySelector('input[aria-label="ค้นหา"]')
      expect(document.activeElement).toBe(firstInput)
      expect(document.body.style.overflow).toBe('hidden')

      trigger.focus()
      expect(document.activeElement).toBe(firstInput)

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
      })
      expect(onClose).toHaveBeenCalledTimes(1)
    } finally {
      await act(async () => root.unmount())
      expect(document.activeElement).toBe(trigger)
      expect(document.body.style.overflow).toBe('')
      container.remove()
      trigger.remove()
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
    }
  })

  it('keeps Tab navigation inside the sheet', async () => {
    const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT
    const container = document.createElement('div')
    document.body.append(container)
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    const root = createRoot(container)

    try {
      await act(async () => {
        root.render(
          <MobileFilterSheet
            footer={<button type="button">ใช้ตัวกรอง</button>}
            onClose={() => undefined}
            title="ตัวกรอง"
          >
            <input aria-label="ค้นหา" />
          </MobileFilterSheet>,
        )
      })

      const firstInput = container.querySelector<HTMLInputElement>('input[aria-label="ค้นหา"]')
      const applyButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'ใช้ตัวกรอง')

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab', shiftKey: true }))
      })
      expect(document.activeElement).toBe(applyButton)

      applyButton?.focus()
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }))
      })
      expect(document.activeElement).toBe(firstInput)
    } finally {
      await act(async () => root.unmount())
      container.remove()
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
    }
  })

  it('keeps focus in a portalled popover opened from the sheet', async () => {
    const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT
    const container = document.createElement('div')
    document.body.append(container)
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    const root = createRoot(container)

    try {
      await act(async () => {
        root.render(
          <MobileFilterSheet
            footer={<button type="button">Apply filters</button>}
            onClose={() => undefined}
            title="Filters"
          >
            <Popover open>
              <PopoverTrigger asChild>
                <button type="button">Open calendar</button>
              </PopoverTrigger>
              <PopoverContent>
                <button type="button">Select date</button>
              </PopoverContent>
            </Popover>
          </MobileFilterSheet>,
        )
      })

      const popupButton = document.body.querySelector<HTMLButtonElement>('[data-slot="popover-content"] button')
      expect(popupButton).not.toBeNull()

      await act(async () => {
        popupButton?.focus()
      })
      expect(document.activeElement).toBe(popupButton)
    } finally {
      await act(async () => root.unmount())
      container.remove()
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
    }
  })

  it('rejects focus from a portalled popover that is not owned by the sheet', async () => {
    const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT
    const container = document.createElement('div')
    const onExternalAction = vi.fn()
    document.body.append(container)
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    const root = createRoot(container)

    try {
      await act(async () => {
        root.render(
          <>
            <Popover open>
              <PopoverTrigger asChild>
                <button type="button">External trigger</button>
              </PopoverTrigger>
              <PopoverContent>
                <button type="button" onClick={onExternalAction}>External action</button>
              </PopoverContent>
            </Popover>
            <MobileFilterSheet
              footer={<button type="button">Apply filters</button>}
              onClose={() => undefined}
              title="Filters"
            >
              <input aria-label="Search filters" />
            </MobileFilterSheet>
          </>,
        )
      })

      const firstInput = container.querySelector<HTMLInputElement>('input[aria-label="Search filters"]')
      const externalButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[data-slot="popover-content"] button'))
        .find((button) => button.textContent === 'External action')
      expect(externalButton).not.toBeNull()

      await act(async () => {
        externalButton?.focus()
        externalButton?.click()
      })
      expect(document.activeElement).toBe(firstInput)
      expect(onExternalAction).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      container.remove()
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
    }
  })
})
