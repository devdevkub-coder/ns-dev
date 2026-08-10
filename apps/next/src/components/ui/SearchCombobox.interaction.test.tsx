// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { SearchCombobox } from './SearchCombobox'

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

    expect(listbox?.classList.contains('pointer-events-auto')).toBe(true)
    expect(listbox?.classList.contains('touch-pan-y')).toBe(true)
    expect(listbox?.classList.contains('overscroll-contain')).toBe(true)
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
    expect(optionsPanel?.classList.contains('overflow-y-auto')).toBe(true)
    expect(optionsPanel?.className).not.toContain('!overflow-hidden')
    const resultList = document.querySelector<HTMLElement>('#party-search-options > div:last-child')
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
})
