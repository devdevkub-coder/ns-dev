'use client'

import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { cn } from '@/lib/utils'

export type OptionPickerMode = 'auto' | 'dialog' | 'dropdown'

export function resolveOptionPickerMode(mode: OptionPickerMode, optionCount: number) {
  if (mode !== 'auto') return mode
  return optionCount > 4 ? 'dialog' : 'dropdown'
}

export function OptionPickerDialog({
  children,
  listboxId,
  open,
  search,
  title,
  onCloseAutoFocus,
  onOpenAutoFocus,
  onOpenChange,
}: {
  children: ReactNode
  listboxId?: string
  open: boolean
  search?: ReactNode
  title: string
  onCloseAutoFocus?: ComponentPropsWithoutRef<typeof DialogContent>['onCloseAutoFocus']
  onOpenAutoFocus?: ComponentPropsWithoutRef<typeof DialogContent>['onOpenAutoFocus']
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        mobileAppShell={false}
        fallbackTitle={title}
        onCloseAutoFocus={onCloseAutoFocus}
        onOpenAutoFocus={onOpenAutoFocus}
        className={cn(
          'bottom-0 top-auto h-[85dvh] w-[calc(100%_-_1rem)] max-w-xl translate-y-0 rounded-b-none rounded-t-2xl',
          'sm:bottom-auto sm:top-1/2 sm:h-[75dvh] sm:max-h-[36rem] sm:-translate-y-1/2 sm:rounded-md',
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
          <h2 className="min-w-0 truncate text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <button
            className="h-10 shrink-0 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-100"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            ปิด
          </button>
        </div>
        {search ? <div className="shrink-0 border-b border-slate-200 p-3 dark:border-slate-700">{search}</div> : null}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 [touch-action:pan-y]"
          data-slot="option-picker-list"
          id={listboxId}
          role="listbox"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}
