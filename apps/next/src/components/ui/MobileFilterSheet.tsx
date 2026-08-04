'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

type MobileFilterSheetProps = {
  bodyClassName?: string
  children: ReactNode
  footer: ReactNode
  onClose: () => void
  title: string
  visibleClassName?: string
}

const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const floatingContentSelector = '[data-radix-popper-content-wrapper], [data-slot="popover-content"]'

export function MobileFilterSheet({
  bodyClassName,
  children,
  footer,
  onClose,
  title,
  visibleClassName = 'lg:hidden',
}: MobileFilterSheetProps) {
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousBodyOverflow = document.body.style.overflow
    const isWithinManagedSurface = (element: Element | null) => Boolean(
      element && (sheetRef.current?.contains(element) || element.closest(floatingContentSelector)),
    )
    const getFocusableElements = () => Array.from(document.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => isWithinManagedSurface(element))
    const focusFirstElement = () => {
      const first = getFocusableElements()[0]
      if (first) first.focus()
      else sheetRef.current?.focus()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = getFocusableElements()
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return

      if (!isWithinManagedSurface(document.activeElement)) {
        event.preventDefault()
        if (event.shiftKey) last.focus()
        else first.focus()
        return
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    const handleFocusIn = (event: FocusEvent) => {
      const focusTarget = event.target instanceof Element ? event.target : null
      if (isWithinManagedSurface(focusTarget)) return
      focusFirstElement()
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('focusin', handleFocusIn)
    focusFirstElement()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('focusin', handleFocusIn)
      document.body.style.overflow = previousBodyOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  return (
    <div className={cn('fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(2,6,23,0.55)]', visibleClassName)} onClick={onClose}>
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex max-h-[80dvh] w-full flex-col overflow-hidden rounded-t-md bg-slate-900 shadow-2xl"
        data-ns-field-scope="filter"
        onClick={(event) => event.stopPropagation()}
        ref={sheetRef}
        role="dialog"
        tabIndex={-1}
      >
        <div data-ns-dialog-header className="flex items-center rounded-t-md border-b border-slate-200 bg-slate-100 px-4 py-4 text-slate-700">
          <h4 className="text-sm font-bold text-slate-700" id={titleId}>{title}</h4>
        </div>

        <div className={cn('flex-1 space-y-4 overflow-y-auto bg-white p-4', bodyClassName)}>{children}</div>

        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 bg-white p-4 pb-[calc(env(safe-area-inset-bottom)_+_1rem)]">{footer}</div>
      </div>
    </div>
  )
}
