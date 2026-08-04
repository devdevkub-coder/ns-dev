// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { FormSafetyProvider, useActionConfirmation, useUnsavedChangesGuard } from './FormSafetyProvider'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT

beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
})

describe('FormSafetyProvider', () => {
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

  function setInputValue(input: HTMLInputElement, value: string) {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (!valueSetter) throw new Error('Expected input value setter')
    valueSetter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  it('runs a clean form discard action without showing a prompt', async () => {
    const onDiscard = vi.fn()

    function Harness() {
      const { requestDiscard } = useUnsavedChangesGuard(false)
      return <button type="button" onClick={() => requestDiscard(onDiscard)}>Close form</button>
    }

    act(() => root.render(<FormSafetyProvider><Harness /></FormSafetyProvider>))
    await act(async () => button('Close form').click())

    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).not.toContain('ละทิ้งการแก้ไขหรือไม่?')
  })

  it('keeps a dirty form open when the discard confirmation is cancelled', async () => {
    const onDiscard = vi.fn()

    function Harness() {
      const { requestDiscard } = useUnsavedChangesGuard(true)
      return <button type="button" onClick={() => requestDiscard(onDiscard)}>Close form</button>
    }

    act(() => root.render(<FormSafetyProvider><Harness /></FormSafetyProvider>))
    await act(async () => button('Close form').click())

    expect(document.body.textContent).toContain('ละทิ้งการแก้ไขหรือไม่?')
    expect(onDiscard).not.toHaveBeenCalled()

    await act(async () => button('แก้ไขต่อ').click())

    expect(onDiscard).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('ละทิ้งการแก้ไขหรือไม่?')
  })

  it('keeps a typed cancellation reason when its close is cancelled', async () => {
    function Harness() {
      const [open, setOpen] = React.useState(true)
      const [reason, setReason] = React.useState('')
      const { requestDiscard } = useUnsavedChangesGuard(open && reason.trim().length > 0)

      if (!open) return <p>Reason dialog closed</p>
      return (
        <>
          <input aria-label="เหตุผลยกเลิก" value={reason} onChange={(event) => setReason(event.target.value)} />
          <button type="button" onClick={() => requestDiscard(() => setOpen(false))}>Close reason</button>
        </>
      )
    }

    act(() => root.render(<FormSafetyProvider><Harness /></FormSafetyProvider>))
    const input = container.querySelector<HTMLInputElement>('input[aria-label="เหตุผลยกเลิก"]')
    if (!input) throw new Error('Expected reason input')

    await act(async () => {
      setInputValue(input, 'กรอกผิด')
    })
    await act(async () => button('Close reason').click())

    expect(document.body.textContent).toContain('ละทิ้งการแก้ไขหรือไม่?')
    await act(async () => button('แก้ไขต่อ').click())
    expect(input.value).toBe('กรอกผิด')

    await act(async () => button('Close reason').click())
    await act(async () => button('ละทิ้งการแก้ไข').click())
    expect(document.body.textContent).toContain('Reason dialog closed')
  })

  it('runs a dirty form discard action exactly once after confirmation and closes the prompt', async () => {
    const onDiscard = vi.fn()

    function Harness() {
      const { requestDiscard } = useUnsavedChangesGuard(true)
      return <button type="button" onClick={() => requestDiscard(onDiscard)}>Close form</button>
    }

    act(() => root.render(<FormSafetyProvider><Harness /></FormSafetyProvider>))
    await act(async () => button('Close form').click())
    await act(async () => button('ละทิ้งการแก้ไข').click())

    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).not.toContain('ละทิ้งการแก้ไขหรือไม่?')
  })

  it('waits for confirmation before navigating away from a dirty form', async () => {
    const onNavigate = vi.fn()

    function Harness() {
      const { requestNavigation } = useActionConfirmation()
      useUnsavedChangesGuard(true)
      return <button type="button" onClick={() => requestNavigation(onNavigate)}>Navigate away</button>
    }

    act(() => root.render(<FormSafetyProvider><Harness /></FormSafetyProvider>))
    await act(async () => button('Navigate away').click())

    expect(onNavigate).not.toHaveBeenCalled()

    await act(async () => button('ละทิ้งการแก้ไข').click())

    expect(onNavigate).toHaveBeenCalledTimes(1)
  })

  it('requires explicit confirmation before running a destructive action', async () => {
    const onConfirm = vi.fn()

    function Harness() {
      const { requestConfirmation } = useActionConfirmation()
      return (
        <button
          type="button"
          onClick={() => requestConfirmation({
            title: 'ยืนยันการยกเลิกเอกสาร',
            description: 'รายการจะถูกยกเลิก',
            confirmLabel: 'ยืนยันยกเลิก',
            destructive: true,
            onConfirm,
          })}
        >
          Cancel document
        </button>
      )
    }

    act(() => root.render(<FormSafetyProvider><Harness /></FormSafetyProvider>))
    await act(async () => button('Cancel document').click())

    expect(document.body.textContent).toContain('ยืนยันการยกเลิกเอกสาร')
    expect(onConfirm).not.toHaveBeenCalled()

    await act(async () => button('ยืนยันยกเลิก').click())

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).not.toContain('ยืนยันการยกเลิกเอกสาร')
  })

  it('renders global confirmations as a compact dialog instead of a mobile app shell', async () => {
    function Harness() {
      const { requestConfirmation } = useActionConfirmation()
      return (
        <button
          type="button"
          onClick={() => requestConfirmation({
            title: 'ยืนยันการลบข้อมูล',
            description: 'รายการนี้จะถูกลบ',
            confirmLabel: 'ยืนยันลบ',
            destructive: true,
            onConfirm: () => undefined,
          })}
        >
          Delete record
        </button>
      )
    }

    act(() => root.render(<FormSafetyProvider><Harness /></FormSafetyProvider>))
    await act(async () => button('Delete record').click())

    expect(document.body.querySelector('[data-ns-dialog-content]')?.getAttribute('data-ns-dialog-content')).toBe('dialog')
  })

  it('does not submit a typed cancellation reason before the final confirmation', async () => {
    const onSubmit = vi.fn()

    function Harness() {
      const [reason, setReason] = React.useState('')
      const { requestConfirmation } = useActionConfirmation()
      return (
        <>
          <input aria-label="เหตุผลยกเลิกเอกสาร" value={reason} onChange={(event) => setReason(event.target.value)} />
          <button
            type="button"
            onClick={() => requestConfirmation({
              title: 'ยืนยันยกเลิกเอกสาร',
              description: 'รายการจะถูกยกเลิก',
              confirmLabel: 'ยืนยันยกเลิก',
              destructive: true,
              onConfirm: () => onSubmit(reason),
            })}
          >
            Submit cancellation
          </button>
        </>
      )
    }

    act(() => root.render(<FormSafetyProvider><Harness /></FormSafetyProvider>))
    const input = container.querySelector<HTMLInputElement>('input[aria-label="เหตุผลยกเลิกเอกสาร"]')
    if (!input) throw new Error('Expected cancellation reason input')

    await act(async () => {
      setInputValue(input, 'ข้อมูลไม่ถูกต้อง')
    })
    await act(async () => button('Submit cancellation').click())
    expect(onSubmit).not.toHaveBeenCalled()

    await act(async () => button('ยืนยันยกเลิก').click())
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('ข้อมูลไม่ถูกต้อง')
  })

  it('keeps a destructive confirmation open and shows its failure', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('ดำเนินการไม่สำเร็จ'))

    function Harness() {
      const { requestConfirmation } = useActionConfirmation()
      return (
        <button
          type="button"
          onClick={() => requestConfirmation({
            title: 'ยืนยันการลบข้อมูล',
            description: 'รายการนี้จะถูกลบ',
            confirmLabel: 'ยืนยันลบ',
            destructive: true,
            onConfirm,
          })}
        >
          Delete record
        </button>
      )
    }

    act(() => root.render(<FormSafetyProvider><Harness /></FormSafetyProvider>))
    await act(async () => button('Delete record').click())
    await act(async () => button('ยืนยันลบ').click())

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('ยืนยันการลบข้อมูล')
    expect(document.body.textContent).toContain('ดำเนินการไม่สำเร็จ')
  })

  it('registers beforeunload only while at least one form is dirty', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener')

    function Harness() {
      const [dirty, setDirty] = React.useState(false)
      useUnsavedChangesGuard(dirty)
      return <button type="button" onClick={() => setDirty(true)}>Make dirty</button>
    }

    act(() => root.render(<FormSafetyProvider><Harness /></FormSafetyProvider>))
    expect(addEventListener.mock.calls.some(([eventName]) => eventName === 'beforeunload')).toBe(false)

    act(() => button('Make dirty').click())
    expect(addEventListener.mock.calls.filter(([eventName]) => eventName === 'beforeunload')).toHaveLength(1)
  })
})
