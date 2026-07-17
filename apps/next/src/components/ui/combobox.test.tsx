// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { BranchSelectCombobox } from './BranchSelectCombobox'
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList } from './combobox'

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
  readOnly = true,
  onValueChange = () => undefined,
}: {
  className?: string
  readOnly?: boolean
  onValueChange?: (value: string) => void
}) {
  const [value, setValue] = React.useState(branchNames[0])

  return (
    <Combobox
      inputId="branch-filter"
      items={branchNames}
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
    expect(document.getElementById('branch-filter-options')?.getAttribute('role')).toBe('listbox')
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
})

describe('shared dropdown height contract', () => {
  it('allows h-9 filter controls while keeping branch form fields at h-10', () => {
    const filterMarkup = renderToStaticMarkup(
      <Combobox inputId="branch-filter-height" items={branchNames} value={branchNames[0]}>
        <ComboboxInput aria-label="เลือกสาขา" className="h-9" readOnly withDropdownButton />
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

    expect(filterMarkup).toMatch(/<input[^>]*class="[^"]*\bh-9\b[^"]*"/)
    expect(filterMarkup).not.toMatch(/<input[^>]*class="[^"]*\bh-10\b[^"]*"/)
    expect(formMarkup).toMatch(/<input[^>]*class="[^"]*\bh-10\b[^"]*"/)
    expect(formMarkup).not.toMatch(/<input[^>]*class="[^"]*\bh-9\b[^"]*"/)
  })
})
