'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function DualCostingPageSection({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('space-y-4', className)}>{children}</section>
}

export function DualCostingFilterCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-md bg-white p-3 shadow', className)}>{children}</div>
}

export function DualCostingPanel({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <div className={cn('rounded-md bg-white p-4 shadow', className)}>
      {title ? <h3 className="mb-3 text-sm font-semibold text-slate-800">{title}</h3> : null}
      {children}
    </div>
  )
}

export function DualCostingStatCard({
  children,
  label,
  tone = 'slate',
  value,
}: {
  children?: ReactNode
  label: string
  tone?: 'amber' | 'blue' | 'emerald' | 'purple' | 'red' | 'slate'
  value: string
}) {
  const tones = {
    amber: 'text-amber-700',
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
    purple: 'text-purple-700',
    red: 'text-red-600',
    slate: 'text-slate-900',
  }[tone]

  return (
    <div className="rounded-md bg-white p-3 shadow">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn('mt-1 text-lg font-bold', tones)}>{value}</div>
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
  return error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null
}

export function DualCostingHint({
  children,
  tone = 'slate',
}: {
  children: ReactNode
  tone?: 'amber' | 'blue' | 'emerald' | 'indigo' | 'purple' | 'slate'
}) {
  const tones = {
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    purple: 'border-purple-200 bg-purple-50 text-purple-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  }[tone]

  return <div className={cn('rounded-md border p-3 text-sm', tones)}>{children}</div>
}
