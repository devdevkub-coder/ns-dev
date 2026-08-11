// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { BranchSelectCombobox } from './BranchSelectCombobox'
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList } from './combobox'
import type { OptionPickerMode } from './OptionPickerDialog'

const branchNames = ['ทุกสาขา', 'สาขา A', 'สาขา B']
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT

beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
})

function ComboboxHarness({
  className = 'h-9',
  items = branchNames,
  pickerMode = 'dropdown',
  readOnly = true,
  onValueChange = () => undefined,
}: {
  className?: string
  items?: string[]
  pickerMode?: OptionPickerMode
  readOnly?: boolean
  onValueChange?: (value: string) => void
}) {
  const [value, setValue] = React.useState(items[0])

  return (
    <Combobox
      inputId="branch-filter"
      items={items}
      pickerMode={pickerMode}
      value={value}
      onValueChange={(nextValue) => {
        setValue(nextValue)
        onValueChange(nextValue)
      }}
    >
      <ComboboxInput
        aria-label="เลือกสาขา"
        className={className}
        readOnly={readOnly}
        withDropdownButton
      />
      <ComboboxContent>
        <ComboboxList>
          {(branchName) => (
            <ComboboxItem key={String(branchName)} value={String(branchName)}>
              {String(branchName)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

function pressKey(input: HTMLInputElement, key: string) {
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }))
  })
}

describe('shared combobox behavior', () => {
  let container: HTMLDivElement
  let root: Root
  let scrollIntoViewSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    scrollIntoViewSpy = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewSpy,
    })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.style.pointerEvents = ''
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function renderHarness(props: React.ComponentProps<typeof ComboboxHarness> = {}) {
    act(() => root.render(<ComboboxHarness {...props} />))
    const input = container.querySelector<HTMLInputElement>('[role="combobox"]')
    if (!input) throw new Error('Expected combobox input')
    return input
  }

  it('opens a labelled and controlled listbox without selecting read-only text on focus', () => {
    const selectSpy = vi.spyOn(HTMLInputElement.prototype, 'select')
    const input = renderHarness()

    act(() => input.focus())

    expect(selectSpy).not.toHaveBeenCalled()
    expect(input.getAttribute('aria-label')).toBe('เลือกสาขา')
    expect(input.getAttribute('aria-controls')).toBe('branch-filter-options')
    expect(input.getAttribute('aria-expanded')).toBe('true')
    const listbox = document.getElementById('branch-filter-options')
    expect(listbox?.getAttribute('role')).toBe('listbox')
    expect(listbox?.classList.contains('pointer-events-auto')).toBe(true)
  })

  it('selects a branch from the portalled list with a mouse click while a modal disables outside pointer events', () => {
    const onValueChange = vi.fn()
    document.body.style.pointerEvents = 'none'
    const input = renderHarness({ onValueChange })

    act(() => input.focus())
    const listbox = document.getElementById('branch-filter-options')
    const option = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]'))
      .find((button) => button.textContent?.includes('สาขา B'))

    expect(listbox?.classList.contains('pointer-events-auto')).toBe(true)
    expect(option).toBeDefined()

    act(() => {
      option?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    })

    expect(onValueChange).toHaveBeenLastCalledWith('สาขา B')
    expect(input.value).toBe('สาขา B')
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('navigates options with arrows, chooses the highlighted option with Enter, and closes with Escape', () => {
    const onValueChange = vi.fn()
    const input = renderHarness({ onValueChange })

    act(() => input.focus())
    pressKey(input, 'ArrowDown')
    pressKey(input, 'ArrowDown')
    pressKey(input, 'ArrowUp')

    const activeOptionId = input.getAttribute('aria-activedescendant')
    expect(activeOptionId).toBeTruthy()
    expect(document.getElementById(activeOptionId ?? '')?.textContent).toContain('สาขา A')
    expect(scrollIntoViewSpy).toHaveBeenCalled()

    pressKey(input, 'Enter')
    expect(onValueChange).toHaveBeenLastCalledWith('สาขา A')
    expect(input.value).toBe('สาขา A')
    expect(input.getAttribute('aria-expanded')).toBe('false')

    act(() => input.click())
    expect(input.getAttribute('aria-expanded')).toBe('true')
    pressKey(input, 'Escape')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById('branch-filter-options')).toBeNull()
  })

  it('selects a branch from the portalled list with a mobile tap', () => {
    const onValueChange = vi.fn()
    const input = renderHarness({ onValueChange })

    act(() => input.focus())
    const option = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]'))
      .find((button) => button.textContent?.includes('สาขา B'))
    expect(option).toBeDefined()

    act(() => {
      const touchStart = new Event('touchstart', { bubbles: true, cancelable: true })
      Object.defineProperty(touchStart, 'touches', { value: [{ clientX: 20, clientY: 20 }] })
      option?.dispatchEvent(touchStart)
      const touchEnd = new Event('touchend', { bubbles: true, cancelable: true })
      Object.defineProperty(touchEnd, 'changedTouches', { value: [{ clientX: 20, clientY: 20 }] })
      option?.dispatchEvent(touchEnd)
    })

    expect(onValueChange).toHaveBeenLastCalledWith('สาขา B')
    expect(input.value).toBe('สาขา B')
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps auto mode as the original dropdown when there are at most four options', () => {
    const input = renderHarness({ pickerMode: 'auto' })

    act(() => input.focus())

    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.getElementById('branch-filter-options')?.classList.contains('pointer-events-auto')).toBe(true)
  })

  it('uses a scrollable picker dialog in auto mode when there are more than four options', () => {
    const input = renderHarness({
      items: ['รายการ 1', 'รายการ 2', 'รายการ 3', 'รายการ 4', 'รายการ 5'],
      pickerMode: 'auto',
    })

    act(() => input.focus())

    const pickerDialog = document.querySelector<HTMLElement>('[role="dialog"]')
    const listbox = pickerDialog?.querySelector<HTMLElement>('#branch-filter-options')
    expect(pickerDialog).not.toBeNull()
    expect(listbox?.dataset.slot).toBe('option-picker-list')
    expect(listbox?.classList.contains('overflow-y-auto')).toBe(true)
  })

})

describe('shared dropdown height contract', () => {
  it('defaults dropdown controls to h-10 while allowing explicit h-9 filters', () => {
    const defaultMarkup = renderToStaticMarkup(
      <Combobox inputId="branch-default-height" items={branchNames} value={branchNames[0]}>
        <ComboboxInput aria-label="เลือกสาขา" readOnly withDropdownButton />
      </Combobox>,
    )
    const filterMarkup = renderToStaticMarkup(
      <Combobox inputId="branch-filter-height" items={branchNames} value={branchNames[0]}>
        <ComboboxInput aria-label="เลือกสาขา" className="h-9" inputGroupClassName="h-9" readOnly withDropdownButton />
      </Combobox>,
    )
    const formMarkup = renderToStaticMarkup(
      <BranchSelectCombobox
        branches={[{ id: 'branch-a', name: 'สาขา A' }]}
        inputId="branch-form-height"
        label="สาขา"
        placeholder="เลือกสาขา"
        value="branch-a"
        onChange={() => undefined}
      />,
    )

    expect(defaultMarkup).toMatch(/class="[^"]*\bh-10\b[^"]*"[^>]*data-slot="input-group"/)
    expect(filterMarkup).toMatch(/<input[^>]*class="[^"]*\bh-9\b[^"]*"/)
    expect(filterMarkup).toMatch(/class="[^"]*\bh-9\b[^"]*"[^>]*data-slot="input-group"/)
    expect(filterMarkup).not.toMatch(/<input[^>]*class="[^"]*\bh-10\b[^"]*"/)
    expect(formMarkup).toMatch(/<input[^>]*class="[^"]*\bh-10\b[^"]*"/)
    expect(formMarkup).not.toMatch(/<input[^>]*class="[^"]*\bh-9\b[^"]*"/)
  })
})
