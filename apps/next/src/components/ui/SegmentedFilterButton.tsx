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
        'inline-flex h-7 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:border-blue-500 focus-visible:ring-[3px] focus-visible:ring-blue-500/30',
        active
          ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700 dark:border-blue-500 dark:bg-blue-600 dark:hover:bg-blue-700'
          : 'border-slate-300 bg-transparent text-slate-600 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
        className,
      )}
    >
      {children}
    </button>
  )
}
