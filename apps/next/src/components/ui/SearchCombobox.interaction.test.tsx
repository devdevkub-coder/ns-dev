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
    expect(option).toBeDefined()

    act(() => {
      option?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    })

    expect(onChange).toHaveBeenLastCalledWith('supplier-b')
    expect(input?.value).toBe('ผู้ขาย B')
    expect(input?.getAttribute('aria-expanded')).toBe('false')

    act(() => root.unmount())
  })
})
