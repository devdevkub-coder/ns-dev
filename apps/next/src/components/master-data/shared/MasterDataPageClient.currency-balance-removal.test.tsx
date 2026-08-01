// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { FormSafetyProvider } from '@/components/ui/FormSafetyProvider'
import type { MasterDataField } from '@/lib/master-data'
import { FormField } from './MasterDataPageClient'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT
const currencyBalanceField: MasterDataField = {
  key: 'accountCurrencyBalances',
  label: 'สกุลเงินเพิ่มเติม',
  options: [{ label: 'ดอลลาร์สหรัฐ', value: 'USD' }],
  type: 'currency-balances',
}

beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
})

describe('FormField currency balance removal', () => {
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

  function button(label: string) {
    const element = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
      (candidate) => candidate.textContent?.trim() === label,
    )
    if (!element) throw new Error(`Expected button: ${label}`)
    return element
  }

  it('keeps a selected additional currency until its deletion is confirmed', async () => {
    const onChange = vi.fn()

    act(() => root.render(
      <FormSafetyProvider>
        <FormField
          field={currencyBalanceField}
          onChange={onChange}
          value={[{ currency: 'USD' }]}
        />
      </FormSafetyProvider>,
    ))

    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="ลบสกุลเงิน"]')?.click())

    expect(document.body.textContent).toContain('ยืนยันการลบรายการสกุลเงิน?')
    expect(onChange).not.toHaveBeenCalled()

    await act(async () => button('ไม่ดำเนินการ').click())
    expect(onChange).not.toHaveBeenCalled()

    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="ลบสกุลเงิน"]')?.click())
    await act(async () => button('ลบรายการ').click())

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('removes a blank new currency balance immediately', async () => {
    const onChange = vi.fn()

    act(() => root.render(
      <FormSafetyProvider>
        <FormField
          field={currencyBalanceField}
          onChange={onChange}
          value={[{ currency: '' }]}
        />
      </FormSafetyProvider>,
    ))

    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="ลบสกุลเงิน"]')?.click())

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([])
    expect(document.body.textContent).not.toContain('ยืนยันการลบรายการสกุลเงิน?')
  })
})
