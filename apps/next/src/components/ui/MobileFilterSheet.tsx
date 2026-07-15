'use client'

import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type MobileFilterSheetProps = {
  bodyClassName?: string
  children: ReactNode
  footer: ReactNode
  onClose: () => void
  title: string
  visibleClassName?: string
}

export function MobileFilterSheet({
  bodyClassName,
  children,
  footer,
  onClose,
  title,
  visibleClassName = 'lg:hidden',
}: MobileFilterSheetProps) {
  return (
    <div className={cn('fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(2,6,23,0.55)]', visibleClassName)} onClick={onClose}>
      <div
        className="flex max-h-[80dvh] w-full flex-col overflow-hidden rounded-t-md bg-slate-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center rounded-t-md bg-slate-900 px-4 py-4 text-white">
          <h4 className="text-sm font-bold text-white">{title}</h4>
        </div>

        <div className={cn('flex-1 space-y-4 overflow-y-auto bg-white p-4', bodyClassName)}>{children}</div>

        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 bg-white p-4 pb-[calc(env(safe-area-inset-bottom)_+_1rem)]">{footer}</div>
      </div>
    </div>
  )
}
