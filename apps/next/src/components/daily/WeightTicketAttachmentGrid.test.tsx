// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { FormSafetyProvider } from '@/components/ui/FormSafetyProvider'
import { WeightTicketAttachmentGrid } from './WeightTicketAttachmentGrid'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT

beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
})

describe('WeightTicketAttachmentGrid', () => {
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

  it('waits for confirmation before removing an attachment', async () => {
    const onRemove = vi.fn()

    act(() => root.render(
      <FormSafetyProvider>
        <WeightTicketAttachmentGrid
          addLabel="เพิ่มรูป"
          emptyLabel="เพิ่มรูป"
          files={[{ id: 'evidence-1', fileName: 'evidence.jpg', rawValue: 'evidence.jpg', url: 'https://example.com/evidence.jpg' }]}
          onAppend={vi.fn()}
          onPreview={vi.fn()}
          onRemove={onRemove}
        />
      </FormSafetyProvider>,
    ))

    await act(async () => button('ลบ').click())

    expect(document.body.textContent).toContain('ยืนยันการลบรูปภาพ')
    expect(onRemove).not.toHaveBeenCalled()

    await act(async () => button('ลบรูปภาพ').click())

    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenCalledWith('evidence-1')
    expect(document.body.textContent).not.toContain('ยืนยันการลบรูปภาพ')
  })

  it('keeps an attachment when its removal confirmation is cancelled', async () => {
    const onRemove = vi.fn()

    act(() => root.render(
      <FormSafetyProvider>
        <WeightTicketAttachmentGrid
          addLabel="เพิ่มรูป"
          emptyLabel="เพิ่มรูป"
          files={[{ id: 'evidence-1', fileName: 'evidence.jpg', rawValue: 'evidence.jpg', url: 'https://example.com/evidence.jpg' }]}
          onAppend={vi.fn()}
          onPreview={vi.fn()}
          onRemove={onRemove}
        />
      </FormSafetyProvider>,
    ))

    await act(async () => button('ลบ').click())
    await act(async () => button('ไม่ลบ').click())

    expect(onRemove).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('ยืนยันการลบรูปภาพ')
  })
})
