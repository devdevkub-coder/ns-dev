'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function DualCostingPageSection({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('space-y-4', className)}>{children}</section>
}

export function DualCostingFilterCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-xl bg-white p-3.5 border border-slate-200/80 shadow-sm', className)}>{children}</div>
}

export function DualCostingPanel({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <div className={cn('min-w-0 rounded-xl bg-white p-4 border border-slate-200/80 shadow-sm', className)}>
      {title ? <h3 className="mb-3 text-sm font-bold text-slate-800">{title}</h3> : null}
      {children}
    </div>
  )
}

export function DualCostingStatCard({
  children,
  icon,
  label,
  tone = 'slate',
  value,
}: {
  children?: ReactNode
  icon?: string
  label: string
  tone?: 'amber' | 'blue' | 'emerald' | 'purple' | 'red' | 'slate'
  value: string
}) {
  const tones = {
    amber: 'bg-amber-100 text-amber-700 border-amber-200/50',
    blue: 'bg-blue-100 text-blue-700 border-blue-200/50',
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200/50',
    purple: 'bg-purple-100 text-purple-700 border-purple-200/50',
    red: 'bg-red-100 text-red-700 border-red-200/50',
    slate: 'bg-slate-100 text-slate-700 border-slate-200/50',
  }[tone]

  const textTones = {
    amber: 'text-amber-700',
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
    purple: 'text-purple-700',
    red: 'text-red-600',
    slate: 'text-slate-900',
  }[tone]

  if (icon) {
    return (
      <div className="min-w-0 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl', tones.split(' ')[0])}>{icon}</div>
        <div className="min-w-0">
          <div className={cn('text-xs font-semibold', tones.split(' ')[1])}>{label}</div>
          <div className={cn('truncate font-mono font-bold text-slate-900 text-base sm:text-lg', textTones)}>{value}</div>
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="text-xs text-slate-500 font-semibold">{label}</div>
      <div className={cn('mt-1 truncate text-base sm:text-lg font-bold font-mono', textTones)}>{value}</div>
      {children ? <div className="mt-1">{children}</div> : null}
    </div>
  )
}

export function DualCostingCountRow({
  children,
  countLabel,
  countValue,
}: {
  children?: ReactNode
  countLabel?: string
  countValue: number | string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
      <div>
        {countLabel ?? 'พบทั้งหมด'} <span className="font-semibold text-slate-900">{countValue}</span> รายการ
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}

export function DualCostingErrorBox({ error }: { error: string | null }) {
  return error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null
}

export function DualCostingWorkflowStrip({ active }: { active: 'allocator' | 'ledger' | 'pool' | 'waiting' }) {
  const steps = [
    { key: 'pool', label: 'Cost Pool' },
    { key: 'waiting', label: 'Waiting Allocation' },
    { key: 'allocator', label: 'Cost Allocator' },
    { key: 'ledger', label: 'Allocation Ledger' },
  ] as const

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {steps.map((step, index) => (
        <div key={step.key} className="flex items-center gap-2">
          <span className={cn('rounded-lg border px-3 py-1 font-semibold transition-colors shadow-xs', active === step.key ? 'border-slate-800 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-600')}>{step.label}</span>
          {index < steps.length - 1 ? <span className="text-slate-400">→</span> : null}
        </div>
      ))}
    </div>
  )
}

export function DualCostingHint({
  children,
  tone = 'slate',
}: {
  children: ReactNode
  tone?: 'amber' | 'blue' | 'emerald' | 'indigo' | 'purple' | 'slate'
}) {
  const tones = {
    amber: 'border-amber-200/70 bg-amber-50/50 text-amber-800',
    blue: 'border-blue-200/70 bg-blue-50/50 text-blue-800',
    emerald: 'border-emerald-200/70 bg-emerald-50/50 text-emerald-800',
    indigo: 'border-indigo-200/70 bg-indigo-50/50 text-indigo-800',
    purple: 'border-purple-200/70 bg-purple-50/50 text-purple-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  }[tone]

  return <div className={cn('rounded-xl border p-3.5 text-sm leading-relaxed shadow-xs', tones)}>{children}</div>
}
