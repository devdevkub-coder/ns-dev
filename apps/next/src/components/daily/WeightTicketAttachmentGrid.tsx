'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Camera, ImagePlus, Images, Trash2 } from 'lucide-react'
import { useActionConfirmation } from '@/components/ui/FormSafetyProvider'
import { cn } from '@/lib/utils'
import { recordImageDelivery } from '@/lib/client-image-delivery-telemetry'

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'
const SOURCE_CHOOSER_TRANSITION_MS = 400
const focusableSelector = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
const scrollableOverflow = /^(auto|overlay|scroll)$/

function requestFrame(callback: FrameRequestCallback) {
  if (typeof window.requestAnimationFrame === 'function') return window.requestAnimationFrame(callback)
  return window.setTimeout(() => callback(performance.now()), 0)
}

function cancelFrame(frameId: number) {
  if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frameId)
  else window.clearTimeout(frameId)
}

function getScrollableAncestors(element: HTMLElement | null) {
  const ancestors: HTMLElement[] = []
  let current = element?.parentElement ?? null

  while (current && current !== document.body) {
    const style = window.getComputedStyle(current)
    const scrollsHorizontally = scrollableOverflow.test(style.overflowX) && current.scrollWidth > current.clientWidth
    const scrollsVertically = scrollableOverflow.test(style.overflowY) && current.scrollHeight > current.clientHeight
    if (scrollsHorizontally || scrollsVertically) ancestors.push(current)
    current = current.parentElement
  }

  return ancestors
}

function captureScrollLocks(element: HTMLElement | null) {
  return getScrollableAncestors(element).map((scrollElement) => ({
    element: scrollElement,
    overflowX: scrollElement.style.overflowX,
    overflowY: scrollElement.style.overflowY,
    scrollLeft: scrollElement.scrollLeft,
    scrollTop: scrollElement.scrollTop,
  }))
}

export type WeightTicketAttachmentPreview = {
  fileName: string
  id: string
  rawValue: string
  url: string
}

function AttachmentImage({ file }: { file: WeightTicketAttachmentPreview }) {
  const startedAt = useRef(0)
  useEffect(() => {
    startedAt.current = performance.now()
  }, [])

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={file.fileName}
      className="h-full w-full object-cover"
      src={file.url}
      onError={() => recordImageDelivery({ outcome: 'error', startedAt: startedAt.current, url: file.url })}
      onLoad={() => recordImageDelivery({ outcome: 'loaded', startedAt: startedAt.current, url: file.url })}
    />
  )
}

export function WeightTicketAttachmentGrid({
  id,
  addLabel,
  disabled = false,
  emptyLabel,
  files,
  onAppend,
  onPreview,
  onRemove,
  noWrapper = false,
}: {
  id?: string
  addLabel: string
  disabled?: boolean
  emptyLabel: string
  files: WeightTicketAttachmentPreview[]
  onAppend: (files: FileList | null) => void
  onPreview: (file: WeightTicketAttachmentPreview) => void
  onRemove: (fileId: string) => void
  noWrapper?: boolean
}) {
  const { requestConfirmation } = useActionConfirmation()
  const chooserTitleId = useId()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const chooserRef = useRef<HTMLDivElement>(null)
  const openFrameRef = useRef<number | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const pendingPointerScrollLocksRef = useRef<ReturnType<typeof captureScrollLocks> | null>(null)
  const scrollLocksRef = useRef<ReturnType<typeof captureScrollLocks> | null>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [chooserMounted, setChooserMounted] = useState(false)
  const [chooserVisible, setChooserVisible] = useState(false)

  function captureTriggerScroll() {
    if (!disabled) {
      pendingPointerScrollLocksRef.current = captureScrollLocks(triggerRef.current)
    }
  }

  function openChooser(event: ReactMouseEvent<HTMLButtonElement>) {
    if (disabled) return
    scrollLocksRef.current = event.detail > 0
      ? pendingPointerScrollLocksRef.current ?? captureScrollLocks(triggerRef.current)
      : captureScrollLocks(triggerRef.current)
    pendingPointerScrollLocksRef.current = null
    setPortalTarget(triggerRef.current?.closest<HTMLElement>('[role="dialog"]') ?? document.body)
    setChooserMounted(true)
  }

  const closeChooser = useCallback(() => {
    if (openFrameRef.current !== null) {
      cancelFrame(openFrameRef.current)
      openFrameRef.current = null
    }
    setChooserVisible(false)
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      setChooserMounted(false)
      closeTimerRef.current = null
    }, SOURCE_CHOOSER_TRANSITION_MS)
  }, [])

  function chooseSource(input: HTMLInputElement | null) {
    input?.click()
    closeChooser()
  }

  function appendSelectedFiles(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = event.target.files
    if (selectedFiles?.length) onAppend(selectedFiles)
    event.target.value = ''
  }

  useLayoutEffect(() => {
    if (!chooserMounted) return
    setChooserVisible(false)
    openFrameRef.current = requestFrame(() => {
      openFrameRef.current = requestFrame(() => {
        openFrameRef.current = null
        setChooserVisible(true)
      })
    })

    return () => {
      if (openFrameRef.current !== null) cancelFrame(openFrameRef.current)
      openFrameRef.current = null
    }
  }, [chooserMounted])

  useEffect(() => () => {
    if (openFrameRef.current !== null) cancelFrame(openFrameRef.current)
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
  }, [])

  useLayoutEffect(() => {
    if (!chooserMounted) return
    const previousOverflow = document.body.style.overflow
    const restoreFocus = triggerRef.current
    const scrollLocks = scrollLocksRef.current ?? captureScrollLocks(restoreFocus)
    const restoreScrollPositions = () => {
      for (const { element, scrollLeft, scrollTop } of scrollLocks) {
        element.scrollLeft = scrollLeft
        element.scrollTop = scrollTop
      }
    }
    const getFocusableElements = () => Array.from(chooserRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
    const focusWithoutScroll = (element: HTMLElement | null | undefined) => element?.focus({ preventScroll: true })
    const focusFirstElement = () => focusWithoutScroll(getFocusableElements()[0] ?? chooserRef.current)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeChooser()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = getFocusableElements()
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return

      if (!chooserRef.current?.contains(document.activeElement)) {
        event.preventDefault()
        focusWithoutScroll(event.shiftKey ? last : first)
        return
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        focusWithoutScroll(last)
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        focusWithoutScroll(first)
      }
    }
    const handleFocusIn = (event: FocusEvent) => {
      if (chooserRef.current?.contains(event.target as Node)) return
      focusFirstElement()
    }

    document.body.style.overflow = 'hidden'
    for (const { element } of scrollLocks) {
      element.style.overflowX = 'hidden'
      element.style.overflowY = 'hidden'
    }
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('focusin', handleFocusIn)
    focusFirstElement()
    restoreScrollPositions()

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('focusin', handleFocusIn)
      document.body.style.overflow = previousOverflow
      for (const { element, overflowX, overflowY } of scrollLocks) {
        element.style.overflowX = overflowX
        element.style.overflowY = overflowY
      }
      if (restoreFocus?.isConnected) focusWithoutScroll(restoreFocus)
      restoreScrollPositions()
      scrollLocksRef.current = null
    }
  }, [chooserMounted, closeChooser])

  function requestRemove(fileId: string) {
    requestConfirmation({
      title: 'ยืนยันการลบรูปภาพ',
      description: 'ต้องการนำรูปภาพนี้ออกจากรายการที่กำลังแก้ไขหรือไม่?',
      cancelLabel: 'ไม่ลบ',
      confirmLabel: 'ลบรูปภาพ',
      destructive: true,
      onConfirm: () => onRemove(fileId),
    })
  }

  const content = (
    <div className="flex flex-wrap gap-3" id={id}>
      {files.map((file) => (
        <div className="w-28 min-w-0" key={file.id}>
          <button
            className="group relative block h-28 w-28 overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 hover:border-slate-400"
            disabled={!file.url}
            title={file.fileName}
            type="button"
            onClick={() => file.url ? onPreview(file) : undefined}
          >
            {file.url ? (
              <>
                <AttachmentImage file={file} />
                <span className="absolute inset-x-0 bottom-0 bg-slate-950/70 px-2 py-1.5 text-center text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                  เปิดรูปภาพ
                </span>
              </>
            ) : (
              <span className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-slate-400">รูปเดิม</span>
            )}
          </button>
          <div className="mt-2 truncate text-xs text-slate-600" title={file.fileName}>{file.fileName}</div>
          <button className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline" disabled={disabled} type="button" onClick={() => requestRemove(file.id)}>
            <Trash2 className="h-3 w-3" />
            ลบ
          </button>
        </div>
      ))}
      <button
        ref={triggerRef}
        aria-haspopup="dialog"
        className={cn(
          'flex h-28 w-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-3 text-center text-xs font-medium text-slate-500 shadow-sm hover:border-slate-400 hover:bg-slate-50',
          disabled ? 'cursor-not-allowed opacity-60 hover:border-slate-300 hover:bg-white' : 'cursor-pointer',
        )}
        disabled={disabled}
        type="button"
        onPointerDown={captureTriggerScroll}
        onPointerCancel={() => { pendingPointerScrollLocksRef.current = null }}
        onClick={openChooser}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
          <ImagePlus className="h-5 w-5" />
        </span>
        {files.length === 0 ? emptyLabel : addLabel}
      </button>
      <input
        ref={cameraInputRef}
        accept={IMAGE_ACCEPT}
        capture="environment"
        className="hidden"
        data-image-source="camera"
        disabled={disabled}
        type="file"
        onChange={appendSelectedFiles}
      />
      <input
        ref={galleryInputRef}
        accept={IMAGE_ACCEPT}
        className="hidden"
        data-image-source="gallery"
        disabled={disabled}
        multiple
        type="file"
        onChange={appendSelectedFiles}
      />
    </div>
  )

  return (
    <>
      {noWrapper ? content : (
        <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
          {content}
        </div>
      )}
      {chooserMounted && portalTarget ? createPortal(
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(2,6,23,0.55)]"
          data-testid="attachment-source-backdrop"
          onClick={closeChooser}
        >
          <div
            ref={chooserRef}
            aria-labelledby={chooserTitleId}
            aria-modal="true"
            className={cn(
              'w-full sm:max-w-lg overflow-hidden rounded-t-[1.5rem] bg-white shadow-2xl transition-transform duration-[400ms] ease-[cubic-bezier(.32,.72,0,1)] dark:bg-slate-900',
              chooserVisible ? 'translate-y-0' : 'translate-y-full',
            )}
            data-testid="attachment-source-dialog"
            role="dialog"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 bg-white px-4 pb-3 pt-2 dark:border-slate-700 dark:bg-slate-900">
              <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-slate-300" />
              <h4 className="text-base font-bold text-slate-900 dark:text-slate-100" id={chooserTitleId}>เพิ่มรูปภาพ</h4>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">เลือกวิธีเพิ่มรูปภาพหลักฐาน</p>
            </div>
            <div className="grid gap-3 bg-white p-4 dark:bg-slate-900">
              <button
                className="flex h-14 items-center gap-3 rounded-xl border border-blue-200 px-4 text-left text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                data-image-source-action="camera"
                disabled={disabled}
                type="button"
                onClick={() => chooseSource(cameraInputRef.current)}
              >
                <Camera className="size-5" />
                ถ่ายรูป
              </button>
              <button
                className="flex h-14 items-center gap-3 rounded-xl border border-slate-200 px-4 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                data-image-source-action="gallery"
                disabled={disabled}
                type="button"
                onClick={() => chooseSource(galleryInputRef.current)}
              >
                <Images className="size-5" />
                เลือกจากแกลเลอรี
              </button>
            </div>
            <div className="border-t border-slate-100 bg-white p-4 pb-[calc(env(safe-area-inset-bottom)_+_1rem)] dark:border-slate-800 dark:bg-slate-900">
              <button
                className="h-10 w-full rounded-md border border-slate-300 bg-white text-sm font-normal text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                type="button"
                onClick={closeChooser}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>,
        portalTarget,
      ) : null}
    </>
  )
}
