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
    container.setAttribute('role', 'dialog')
    container.setAttribute('aria-modal', 'true')
    container.dataset.testid = 'weight-ticket-document-dialog'
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

  function renderGrid(overrides: Partial<React.ComponentProps<typeof WeightTicketAttachmentGrid>> = {}) {
    const onAppend = vi.fn()

    act(() => root.render(
      <FormSafetyProvider>
        <WeightTicketAttachmentGrid
          addLabel="เพิ่มรูป"
          emptyLabel="ยังไม่มีรูปภาพ"
          files={[]}
          onAppend={onAppend}
          onPreview={vi.fn()}
          onRemove={vi.fn()}
          {...overrides}
        />
      </FormSafetyProvider>,
    ))

    return { onAppend }
  }

  function click(element: Element | null) {
    if (!(element instanceof HTMLElement)) throw new Error('Expected clickable element')
    act(() => element.click())
  }

  function uploadTrigger() {
    return Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (candidate) => candidate.textContent?.trim() === 'ยังไม่มีรูปภาพ',
    ) ?? null
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

  it('offers a single-shot rear camera and multi-select gallery', () => {
    renderGrid()
    const trigger = uploadTrigger()

    expect(trigger).toBeInstanceOf(HTMLButtonElement)
    click(trigger)

    const camera = container.querySelector<HTMLInputElement>('input[data-image-source="camera"]')
    const gallery = container.querySelector<HTMLInputElement>('input[data-image-source="gallery"]')

    expect(container.textContent).toContain('ถ่ายรูป')
    expect(container.textContent).toContain('เลือกจากแกลเลอรี')
    expect(container.textContent).toContain('ยกเลิก')
    expect(camera?.accept).toBe('image/jpeg,image/png,image/webp')
    expect(camera?.getAttribute('capture')).toBe('environment')
    expect(camera?.multiple).toBe(false)
    expect(gallery?.accept).toBe('image/jpeg,image/png,image/webp')
    expect(gallery?.hasAttribute('capture')).toBe(false)
    expect(gallery?.multiple).toBe(true)
  })

  it.each(['camera', 'gallery'] as const)('passes %s files to the existing callback and clears the input', (source) => {
    const { onAppend } = renderGrid()
    const input = container.querySelector<HTMLInputElement>(`input[data-image-source="${source}"]`)
    if (!input) throw new Error(`Expected ${source} input`)
    const file = new File(['image'], 'proof.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: Object.assign([file], { item: (index: number) => index === 0 ? file : null }),
    })

    act(() => input.dispatchEvent(new Event('change', { bubbles: true })))

    expect(onAppend).toHaveBeenCalledTimes(1)
    expect(onAppend.mock.calls[0]?.[0]?.[0]).toBe(file)
    expect(input.value).toBe('')
  })

  it('ignores a cancelled native picker', () => {
    const { onAppend } = renderGrid()
    const camera = container.querySelector<HTMLInputElement>('input[data-image-source="camera"]')
    if (!camera) throw new Error('Expected camera input')

    act(() => camera.dispatchEvent(new Event('change', { bubbles: true })))

    expect(onAppend).not.toHaveBeenCalled()
    expect(camera.value).toBe('')
  })

  it.each([
    ['camera', 'camera'],
    ['gallery', 'gallery'],
  ] as const)('routes the %s source action to its matching input and closes the chooser', (source, action) => {
    vi.useFakeTimers()
    const { onAppend } = renderGrid()
    const trigger = uploadTrigger()
    if (!(trigger instanceof HTMLButtonElement)) throw new Error('Expected upload trigger')

    const camera = container.querySelector<HTMLInputElement>('input[data-image-source="camera"]')
    const gallery = container.querySelector<HTMLInputElement>('input[data-image-source="gallery"]')
    if (!camera || !gallery) throw new Error('Expected source inputs')
    const cameraClick = vi.spyOn(camera, 'click').mockImplementation(() => undefined)
    const galleryClick = vi.spyOn(gallery, 'click').mockImplementation(() => undefined)

    try {
      click(trigger)
      click(container.querySelector(`[data-image-source-action="${action}"]`))
      expect(source === 'camera' ? cameraClick : galleryClick).toHaveBeenCalledTimes(1)
      expect(source === 'camera' ? galleryClick : cameraClick).not.toHaveBeenCalled()
      expect(container.querySelector('[data-testid="attachment-source-dialog"]')?.className).toContain('translate-y-full')
      act(() => vi.advanceTimersByTime(400))
      expect(container.querySelector('[data-testid="attachment-source-dialog"]')).toBeNull()
      expect(onAppend).not.toHaveBeenCalled()
    } finally {
      cameraClick.mockRestore()
      galleryClick.mockRestore()
      vi.useRealTimers()
    }
  })

  it('does not reopen when cancelled before the opening animation frame', () => {
    vi.useFakeTimers()
    renderGrid()

    try {
      click(uploadTrigger())
      click(container.querySelector('[data-image-source-action="camera"]'))
      act(() => vi.runOnlyPendingTimers())

      expect(container.querySelector('[data-testid="attachment-source-dialog"]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('closes with Escape or backdrop, keeps the parent dialog open, and restores trigger focus after the slide', () => {
    vi.useFakeTimers()
    const { onAppend } = renderGrid()
    const trigger = uploadTrigger()
    if (!(trigger instanceof HTMLButtonElement)) throw new Error('Expected upload trigger')
    const parentKeyDown = vi.fn()
    container.addEventListener('keydown', parentKeyDown)

    try {
      click(trigger)
      const chooser = container.querySelector<HTMLElement>('[data-testid="attachment-source-dialog"]')
      if (!chooser) throw new Error('Expected source chooser')
      act(() => chooser.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })))
      expect(container.querySelector('[data-testid="attachment-source-dialog"]')?.className).toContain('translate-y-full')
      expect(parentKeyDown).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(400))
      expect(container.querySelector('[data-testid="attachment-source-dialog"]')).toBeNull()
      expect(document.activeElement).toBe(trigger)
      expect(onAppend).not.toHaveBeenCalled()

      click(trigger)
      const cancelButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((candidate) => candidate.textContent?.trim() === 'ยกเลิก')
      click(cancelButton ?? null)
      act(() => vi.advanceTimersByTime(400))
      expect(container.querySelector('[data-testid="attachment-source-dialog"]')).toBeNull()
      expect(document.activeElement).toBe(trigger)

      click(trigger)
      click(container.querySelector('[data-testid="attachment-source-backdrop"]'))
      act(() => vi.advanceTimersByTime(400))
      expect(container.querySelector('[data-testid="attachment-source-dialog"]')).toBeNull()
      expect(document.activeElement).toBe(trigger)
    } finally {
      container.removeEventListener('keydown', parentKeyDown)
      vi.useRealTimers()
    }
  })

  it('keeps the chooser inside the document modal and does not animate opacity', () => {
    renderGrid()
    click(uploadTrigger())

    const chooser = container.querySelector<HTMLElement>('[data-testid="attachment-source-dialog"]')
    expect(chooser).not.toBeNull()
    expect(container.contains(chooser)).toBe(true)
    expect(chooser?.parentElement?.dataset.testid).toBe('attachment-source-backdrop')
    expect(chooser?.parentElement?.className).toContain('z-[80]')
    expect(chooser?.className).toContain('transition-transform')
    expect(chooser?.className).toContain('duration-[400ms]')
    expect(chooser?.className).not.toContain('transition-opacity')
    expect(document.activeElement?.textContent).toContain('ถ่ายรูป')
  })

  it('does not open the chooser when disabled', () => {
    renderGrid({ disabled: true })
    const trigger = uploadTrigger()

    expect(trigger).toBeInstanceOf(HTMLButtonElement)
    expect((trigger as HTMLButtonElement).disabled).toBe(true)
    click(trigger)
    expect(container.querySelector('[data-testid="attachment-source-dialog"]')).toBeNull()
  })
})
