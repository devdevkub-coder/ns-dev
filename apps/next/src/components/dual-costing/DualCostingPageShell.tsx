'use client'

import type { ReactNode } from 'react'
import { KpiCard as SharedKpiCard } from '@/components/ui/KpiCard'
import { cn } from '@/lib/utils'

export function DualCostingPageSection({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('space-y-4', className)}>{children}</section>
}

export function DualCostingFilterCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm', className)}>{children}</div>
}

export function DualCostingPanel({
  children,
  className,
  title,
  titleAction,
}: {
  children: ReactNode
  className?: string
  title?: string
  titleAction?: ReactNode
}) {
  return (
    <div className={cn('min-w-0 rounded-xl bg-white p-4 border border-slate-200/80 shadow-sm', className)}>
      {title || titleAction ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? <h3 className="text-sm font-bold text-slate-800">{title}</h3> : <div />}
          {titleAction}
        </div>
      ) : null}
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
  return <SharedKpiCard icon={icon} label={label} note={children} tone={tone} value={value} />
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
          <span className={cn('rounded-md border px-3 py-1 font-medium transition-colors', active === step.key ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700')}>{step.label}</span>
          {index < steps.length - 1 ? <span className="text-slate-400">→</span> : null}
        </div>
      ))}
    </div>
  )
}
