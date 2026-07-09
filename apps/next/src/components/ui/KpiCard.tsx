import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type KpiCardTone =
  | 'amber'
  | 'allocated'
  | 'blue'
  | 'cyan'
  | 'danger'
  | 'emerald'
  | 'gain'
  | 'gradient'
  | 'indigo'
  | 'loss'
  | 'net'
  | 'normal'
  | 'orange'
  | 'pending'
  | 'purple'
  | 'red'
  | 'rose'
  | 'slate'
  | 'violet'
  | 'yellow'

const toneStyles: Record<KpiCardTone, { icon: string; label: string; value: string }> = {
  amber: { icon: 'bg-amber-100 text-amber-700', label: 'text-amber-600', value: 'text-amber-700' },
  allocated: { icon: 'bg-emerald-100 text-emerald-700', label: 'text-emerald-600', value: 'text-emerald-700' },
  blue: { icon: 'bg-blue-100 text-blue-700', label: 'text-blue-600', value: 'text-blue-700' },
  cyan: { icon: 'bg-cyan-100 text-cyan-700', label: 'text-cyan-600', value: 'text-cyan-700' },
  danger: { icon: 'bg-red-100 text-red-700', label: 'text-red-600', value: 'text-red-700' },
  emerald: { icon: 'bg-emerald-100 text-emerald-700', label: 'text-emerald-600', value: 'text-emerald-700' },
  gain: { icon: 'bg-emerald-100 text-emerald-700', label: 'text-emerald-600', value: 'text-emerald-700' },
  gradient: { icon: 'bg-indigo-100 text-indigo-700', label: 'text-indigo-600', value: 'text-indigo-700' },
  indigo: { icon: 'bg-indigo-100 text-indigo-700', label: 'text-indigo-600', value: 'text-indigo-700' },
  loss: { icon: 'bg-red-100 text-red-700', label: 'text-red-600', value: 'text-red-700' },
  net: { icon: 'bg-blue-100 text-blue-700', label: 'text-blue-600', value: 'text-blue-700' },
  normal: { icon: 'bg-slate-100 text-slate-700', label: 'text-slate-600', value: 'text-slate-800' },
  orange: { icon: 'bg-orange-100 text-orange-700', label: 'text-orange-600', value: 'text-orange-700' },
  pending: { icon: 'bg-amber-100 text-amber-700', label: 'text-amber-600', value: 'text-amber-700' },
  purple: { icon: 'bg-purple-100 text-purple-700', label: 'text-purple-600', value: 'text-purple-700' },
  red: { icon: 'bg-red-100 text-red-700', label: 'text-red-600', value: 'text-red-700' },
  rose: { icon: 'bg-rose-100 text-rose-700', label: 'text-rose-600', value: 'text-rose-700' },
  slate: { icon: 'bg-slate-100 text-slate-700', label: 'text-slate-600', value: 'text-slate-800' },
  violet: { icon: 'bg-violet-100 text-violet-700', label: 'text-violet-600', value: 'text-violet-700' },
  yellow: { icon: 'bg-amber-100 text-amber-700', label: 'text-amber-600', value: 'text-amber-700' },
}

const defaultIcons: Record<KpiCardTone, ReactNode> = {
  amber: '●',
  allocated: '●',
  blue: '●',
  cyan: '●',
  danger: '●',
  emerald: '●',
  gain: '●',
  gradient: '●',
  indigo: '●',
  loss: '●',
  net: '●',
  normal: '●',
  orange: '●',
  pending: '●',
  purple: '●',
  red: '●',
  rose: '●',
  slate: '●',
  violet: '●',
  yellow: '●',
}

export function KpiCard({
  className,
  icon,
  label,
  note,
  tone = 'slate',
  value,
}: {
  className?: string
  icon?: ReactNode
  label: ReactNode
  note?: ReactNode
  tone?: KpiCardTone
  value: ReactNode
}) {
  const style = toneStyles[tone] ?? toneStyles.slate

  return (
    <div className={cn('flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-5', className)}>
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg sm:h-12 sm:w-12 sm:text-xl', style.icon)}>
        {icon ?? defaultIcons[tone] ?? defaultIcons.slate}
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-xs font-medium', style.label)}>{label}</div>
        <div className={cn('mt-0.5 break-words font-mono text-base font-bold leading-tight tabular-nums sm:text-xl', style.value)}>{value}</div>
        {note ? <div className="mt-1 truncate text-xs font-medium text-slate-500">{note}</div> : null}
      </div>
    </div>
  )
}

export function KpiCardGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5', className)}>{children}</div>
}
