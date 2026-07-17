import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type SegmentedFilterButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean
  children: ReactNode
}

export function SegmentedFilterButton({ active, children, className, ...props }: SegmentedFilterButtonProps) {
  return (
    <button
      {...props}
      aria-pressed={props['aria-pressed'] ?? active}
      className={cn(
        'inline-flex h-7 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-neutral-500/20',
        active
          ? 'border-slate-500 bg-slate-600 text-white hover:bg-slate-600'
          : 'border-slate-300 bg-transparent text-slate-600 hover:bg-slate-200',
        className,
      )}
    >
      {children}
    </button>
  )
}
