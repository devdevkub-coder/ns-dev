// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { Select } from './Select'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT
const previousScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')

beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => undefined,
  })
})

afterAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
  if (previousScrollIntoView) Object.defineProperty(Element.prototype, 'scrollIntoView', previousScrollIntoView)
  else Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
})

describe('shared Select behavior', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  function trigger() {
    const element = container.querySelector<HTMLButtonElement>('[role="combobox"]')
    if (!element) throw new Error('Expected Select trigger')
    return element
  }

  async function openSelect() {
    await act(async () => {
      trigger().click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  function option(label: string) {
    const element = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (candidate) => candidate.textContent === label,
    )
    if (!element) throw new Error(`Expected option: ${label}`)
    return element
  }

  it('keeps controlled usage compatible with onChange event.target.value', async () => {
    const observedValues: string[] = []

    function Harness() {
      const [value, setValue] = React.useState('draft')

      return (
        <Select
          aria-label="สถานะบิล"
          name="billStatus"
          value={value}
          onChange={(event) => {
            observedValues.push(event.target.value)
            setValue(event.target.value)
          }}
        >
          <option value="draft">ฉบับร่าง</option>
          <option value="approved">อนุมัติแล้ว</option>
        </Select>
      )
    }

    act(() => root.render(<Harness />))
    await openSelect()
    act(() => option('อนุมัติแล้ว').click())

    expect(observedValues).toEqual(['approved'])
    expect(trigger().textContent).toContain('อนุมัติแล้ว')
    expect(container.querySelector<HTMLInputElement>('input[name="billStatus"]')?.value).toBe('approved')
  })

  it('keeps an empty option selectable and reports an empty string', async () => {
    const onChange = vi.fn()

    function Harness() {
      const [value, setValue] = React.useState('active')

      return (
        <Select
          aria-label="ตัวกรองสถานะ"
          name="statusFilter"
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            setValue(event.target.value)
          }}
        >
          <option value="">ทุกสถานะ</option>
          <option value="active">ใช้งาน</option>
        </Select>
      )
    }

    act(() => root.render(<Harness />))
    await openSelect()
    act(() => option('ทุกสถานะ').click())

    expect(onChange).toHaveBeenCalledWith('')
    expect(trigger().textContent).toContain('ทุกสถานะ')
    expect(container.querySelector<HTMLInputElement>('input[name="statusFilter"]')?.value).toBe('')
  })

  it('uses a disabled hidden empty option as the required placeholder only', async () => {
    act(() =>
      root.render(
        <Select aria-label="วิธีชำระเงิน" required>
          <option disabled hidden value="">
            เลือกวิธีชำระเงิน
          </option>
          <option value="cash">เงินสด</option>
        </Select>,
      ),
    )

    expect(trigger().getAttribute('aria-required')).toBe('true')
    expect(trigger().getAttribute('data-placeholder')).toBe('')
    expect(trigger().textContent).toContain('เลือกวิธีชำระเงิน')

    await openSelect()

    expect(option('เงินสด')).toBeTruthy()
    expect(
      Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).some(
        (candidate) => candidate.textContent === 'เลือกวิธีชำระเงิน',
      ),
    ).toBe(false)
  })

  it('preserves optgroup labels and their options', async () => {
    act(() =>
      root.render(
        <Select aria-label="บัญชีรับเงิน" value="bank-a">
          <optgroup label="บัญชีธนาคาร">
            <option value="bank-a">ธนาคาร A</option>
            <option value="bank-b">ธนาคาร B</option>
          </optgroup>
          <optgroup label="เงินสด">
            <option value="cash">เงินสดหน้าร้าน</option>
          </optgroup>
        </Select>,
      ),
    )

    await openSelect()

    const groups = Array.from(document.body.querySelectorAll<HTMLElement>('[role="group"]'))
    expect(groups).toHaveLength(2)
    expect(groups[0]?.textContent).toContain('บัญชีธนาคาร')
    expect(groups[0]?.textContent).toContain('ธนาคาร A')
    expect(groups[0]?.textContent).toContain('ธนาคาร B')
    expect(groups[1]?.textContent).toContain('เงินสด')
    expect(groups[1]?.textContent).toContain('เงินสดหน้าร้าน')
  })

  it('exposes invalid and disabled states on the trigger', async () => {
    act(() =>
      root.render(
        <>
          <Select aria-invalid aria-label="สาขาที่ไม่ถูกต้อง" value="branch-a">
            <option value="branch-a">สาขา A</option>
          </Select>
          <Select aria-label="สาขาที่ปิดใช้งาน" disabled value="branch-b">
            <option value="branch-b">สาขา B</option>
          </Select>
        </>,
      ),
    )

    const invalid = container.querySelector<HTMLButtonElement>('[aria-label="สาขาที่ไม่ถูกต้อง"]')
    const disabled = container.querySelector<HTMLButtonElement>('[aria-label="สาขาที่ปิดใช้งาน"]')
    if (!invalid || !disabled) throw new Error('Expected both Select triggers')

    expect(invalid.getAttribute('aria-invalid')).toBe('true')
    expect(disabled.disabled).toBe(true)
    expect(disabled.getAttribute('data-disabled')).toBe('')

    await act(async () => {
      disabled.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.body.querySelector('[role="listbox"]')).toBeNull()
  })

  it('omits a disabled named value from FormData', () => {
    act(() =>
      root.render(
        <form>
          <Select aria-label="บัญชีที่ปิดใช้งาน" disabled name="accountId" value="account-a">
            <option value="account-a">บัญชี A</option>
          </Select>
        </form>,
      ),
    )

    const form = container.querySelector('form')
    if (!form) throw new Error('Expected form')
    expect(new FormData(form).has('accountId')).toBe(false)
  })

  it('restores an uncontrolled value when its form resets', async () => {
    act(() =>
      root.render(
        <form>
          <Select aria-label="สถานะเอกสาร" defaultValue="draft" name="status">
            <option value="draft">ฉบับร่าง</option>
            <option value="approved">อนุมัติแล้ว</option>
          </Select>
        </form>,
      ),
    )

    await openSelect()
    act(() => option('อนุมัติแล้ว').click())
    expect(trigger().textContent).toContain('อนุมัติแล้ว')

    const form = container.querySelector('form')
    if (!form) throw new Error('Expected form')
    act(() => form.reset())

    expect(trigger().textContent).toContain('ฉบับร่าง')
    expect(new FormData(form).get('status')).toBe('draft')
  })

  it('uses the first enabled visible option when uncontrolled', () => {
    act(() =>
      root.render(
        <form>
          <Select aria-label="Warehouse" name="warehouse">
            <option disabled value="disabled">Disabled warehouse</option>
            <option hidden value="hidden">Hidden warehouse</option>
            <option value="main">Main warehouse</option>
          </Select>
        </form>,
      ),
    )

    const form = container.querySelector('form')
    if (!form) throw new Error('Expected form')
    expect(trigger().textContent).toContain('Main warehouse')
    expect(new FormData(form).get('warehouse')).toBe('main')
  })

  it('keeps an uncontrolled empty option and initializes options loaded later', async () => {
    function Harness() {
      const [loaded, setLoaded] = React.useState(false)

      return (
        <>
          <Select aria-label="Status filter">
            <option value="">All statuses</option>
            <option value="active">Active</option>
          </Select>
          <Select aria-label="Delayed warehouse">
            {loaded ? <option value="main">Main warehouse</option> : null}
          </Select>
          <button type="button" onClick={() => setLoaded(true)}>Load options</button>
        </>
      )
    }

    act(() => root.render(<Harness />))
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Status filter"]')?.textContent).toContain('All statuses')

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button:not([role="combobox"])')?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.querySelector<HTMLButtonElement>('[aria-label="Delayed warehouse"]')?.textContent).toContain('Main warehouse')
  })

  it('supports keyboard typeahead without opening the menu', () => {
    const onChange = vi.fn()
    act(() =>
      root.render(
        <Select
          aria-label="เลือกคลังสินค้า"
          defaultValue="alpha"
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="alpha">Alpha Warehouse</option>
          <option value="beta">Beta Warehouse</option>
          <option value="gamma">Gamma Warehouse</option>
        </Select>,
      ),
    )

    act(() => {
      trigger().focus()
      trigger().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'b' }))
    })

    expect(onChange).toHaveBeenCalledWith('beta')
    expect(trigger().textContent).toContain('Beta Warehouse')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
  })
})
