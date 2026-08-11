// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { SearchCombobox } from './SearchCombobox'
import { Dialog, DialogContent } from './Dialog'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT

beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
})

describe('SearchCombobox portal interaction', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
  })

  afterEach(() => {
    document.body.style.pointerEvents = ''
    document.body.replaceChildren()
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps portalled options clickable while a modal disables outside pointer events', () => {
    document.body.style.pointerEvents = 'none'
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onChange = vi.fn()

    act(() => {
      root.render(
        <SearchCombobox
          inputId="party-search"
          label="ผู้ขาย"
          options={[
            { id: 'supplier-a', label: 'ผู้ขาย A' },
            { id: 'supplier-b', label: 'ผู้ขาย B' },
          ]}
          pickerMode="auto"
          value=""
          onChange={onChange}
        />,
      )
    })

    const input = container.querySelector<HTMLInputElement>('[role="combobox"]')
    expect(input).not.toBeNull()

    act(() => input?.focus())

    const listbox = document.getElementById('party-search-options')
    const option = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]'))
      .find((button) => button.textContent?.includes('ผู้ขาย B'))
    const resultList = document.querySelector<HTMLElement>('#party-search-options > div:last-child')

    expect(listbox?.classList.contains('pointer-events-auto')).toBe(true)
    expect(resultList?.classList.contains('overflow-y-auto')).toBe(true)
    expect(resultList?.classList.contains('touch-pan-y')).toBe(true)
    expect(resultList?.classList.contains('overscroll-contain')).toBe(true)
    expect(option).toBeDefined()

    act(() => {
      option?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    })

    expect(onChange).toHaveBeenLastCalledWith('supplier-b')
    expect(input?.value).toBe('ผู้ขาย B')
    expect(input?.getAttribute('aria-expanded')).toBe('false')

    act(() => root.unmount())
  })

  it('keeps the mobile options sheet open while focus moves from the field to its search input', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        <SearchCombobox
          inputId="party-search"
          label="ผู้ขาย"
          options={[{ id: 'supplier-a', label: 'ผู้ขาย A' }]}
          value=""
          onChange={vi.fn()}
        />,
      )
    })

    const input = container.querySelector<HTMLInputElement>('[role="combobox"]')
    expect(input).not.toBeNull()

    act(() => input?.focus())

    expect(document.getElementById('party-search-options')).not.toBeNull()
    expect(document.querySelector<HTMLInputElement>('input[aria-label="ผู้ขาย"]')).not.toBeNull()
    const optionsPanel = document.getElementById('party-search-options')
    expect(optionsPanel?.classList.contains('overflow-hidden')).toBe(true)
    const resultList = document.querySelector<HTMLElement>('#party-search-options > div:last-child')
    expect(optionsPanel?.classList.contains('overflow-y-auto')).toBe(false)
    expect(resultList?.classList.contains('overflow-y-auto')).toBe(true)
    expect(resultList?.classList.contains('touch-pan-y')).toBe(true)

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(document.getElementById('party-search-options')).not.toBeNull()
    expect(input?.getAttribute('aria-expanded')).toBe('true')

    act(() => root.unmount())
  })

  it('selects a mobile option after a tap without using touch handlers that block scrolling', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onChange = vi.fn()

    act(() => {
      root.render(
        <SearchCombobox
          inputId="party-search"
          label="ผู้ขาย"
          options={[{ id: 'supplier-a', label: 'ผู้ขาย A' }]}
          value=""
          onChange={onChange}
        />,
      )
    })

    const input = container.querySelector<HTMLInputElement>('[role="combobox"]')
    act(() => input?.focus())
    const option = document.querySelector<HTMLButtonElement>('[role="option"]')
    expect(option).not.toBeNull()

    act(() => {
      option?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    expect(onChange).toHaveBeenLastCalledWith('supplier-a')
    expect(input?.value).toBe('ผู้ขาย A')

    act(() => root.unmount())
  })

  it('does not select an option when the user drags the mobile list to scroll', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onChange = vi.fn()

    act(() => {
      root.render(
        <SearchCombobox
          inputId="product-search"
          label="สินค้า"
          options={[
            { id: 'product-a', label: 'สินค้า A' },
            { id: 'product-b', label: 'สินค้า B' },
          ]}
          value=""
          onChange={onChange}
        />,
      )
    })

    const input = container.querySelector<HTMLInputElement>('[role="combobox"]')
    act(() => input?.focus())
    const list = document.querySelector<HTMLElement>('#product-search-options > div:last-child')
    const option = document.querySelector<HTMLButtonElement>('#product-search-option-0')
    expect(list).not.toBeNull()
    expect(option).not.toBeNull()

    act(() => {
      list?.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [{ clientX: 10, clientY: 100 } as Touch] }))
      list?.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [{ clientX: 10, clientY: 40 } as Touch] }))
      list?.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [{ clientX: 10, clientY: 40 } as Touch] }))
      option?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    expect(onChange).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it('selects an option on the next tap when the scroll gesture emitted no click', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onChange = vi.fn()

    act(() => {
      root.render(
        <SearchCombobox
          inputId="product-search"
          label="สินค้า"
          options={[
            { id: 'product-a', label: 'สินค้า A' },
            { id: 'product-b', label: 'สินค้า B' },
          ]}
          value=""
          onChange={onChange}
        />,
      )
    })

    const input = container.querySelector<HTMLInputElement>('[role="combobox"]')
    act(() => input?.focus())
    const list = document.querySelector<HTMLElement>('#product-search-options > div:last-child')
    const option = document.querySelector<HTMLButtonElement>('#product-search-option-0')
    expect(list).not.toBeNull()
    expect(option).not.toBeNull()

    act(() => {
      list?.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [{ clientX: 10, clientY: 100 } as Touch] }))
      list?.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [{ clientX: 10, clientY: 40 } as Touch] }))
      list?.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [{ clientX: 10, clientY: 40 } as Touch] }))
    })

    vi.advanceTimersByTime(301)

    act(() => option?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))

    expect(onChange).toHaveBeenCalledWith('product-a')
    act(() => root.unmount())
    vi.useRealTimers()
  })

  it('opens a scrollable picker dialog inside an existing modal without using the body dropdown', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onChange = vi.fn()

    act(() => {
      root.render(
        <Dialog open>
          <DialogContent hideClose>
            <SearchCombobox
              inputId="party-dialog-search"
              label="ผู้ขาย"
              options={Array.from({ length: 30 }, (_, index) => ({
                id: `supplier-${index + 1}`,
                label: `ผู้ขาย ${index + 1}`,
              }))}
              pickerMode="auto"
              value=""
              onChange={onChange}
            />
          </DialogContent>
        </Dialog>,
      )
    })

    const input = container.querySelector<HTMLInputElement>('[role="combobox"]')
      ?? document.querySelector<HTMLInputElement>('#party-dialog-search')
    expect(input).not.toBeNull()

    act(() => input?.focus())

    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]')
    const pickerDialog = dialogs.item(dialogs.length - 1)
    const listbox = pickerDialog.querySelector<HTMLElement>('#party-dialog-search-options')

    expect(dialogs).toHaveLength(2)
    expect(listbox).not.toBeNull()
    expect(listbox?.dataset.slot).toBe('option-picker-list')
    expect(listbox?.classList.contains('overflow-y-auto')).toBe(true)

    const pickerSearch = pickerDialog.querySelector<HTMLInputElement>('input[aria-label="ค้นหาผู้ขาย"]')
    act(() => {
      pickerSearch?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      pickerSearch?.focus()
    })
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2)

    const option = Array.from(listbox?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])
      .find((button) => button.textContent?.includes('ผู้ขาย 20'))
    act(() => option?.click())

    expect(onChange).toHaveBeenLastCalledWith('supplier-20')
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(input?.getAttribute('aria-expanded')).toBe('false')

    act(() => root.unmount())
  })

  it('keeps the current value when dialog search is closed without selecting another option', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onChange = vi.fn()

    act(() => {
      root.render(
        <SearchCombobox
          inputId="party-dialog-cancel"
          label="ผู้ขาย"
          options={[
            { id: 'supplier-1', label: 'ผู้ขาย 1' },
            { id: 'supplier-2', label: 'ผู้ขาย 2' },
            { id: 'supplier-3', label: 'ผู้ขาย 3' },
            { id: 'supplier-4', label: 'ผู้ขาย 4' },
            { id: 'supplier-5', label: 'ผู้ขาย 5' },
          ]}
          pickerMode="auto"
          value="supplier-1"
          onChange={onChange}
        />,
      )
    })

    const sourceInput = container.querySelector<HTMLInputElement>('#party-dialog-cancel')
    act(() => sourceInput?.focus())

    const pickerSearch = document.querySelector<HTMLInputElement>('input[aria-label="ค้นหาผู้ขาย"]')
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    act(() => {
      valueSetter?.call(pickerSearch, 'คำค้นที่ไม่เลือก')
      pickerSearch?.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const closeButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'ปิด')
    act(() => closeButton?.click())

    expect(onChange).not.toHaveBeenCalled()
    expect(sourceInput?.value).toBe('ผู้ขาย 1')
    expect(sourceInput?.getAttribute('aria-expanded')).toBe('false')

    act(() => root.unmount())
  })
})
