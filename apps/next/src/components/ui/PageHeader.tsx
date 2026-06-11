import * as React from 'react'

import { cn } from '@/lib/utils'

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  description?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
}

export function PageHeader({ title, description, icon, actions, className, ...props }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'bg-[#F8FAFC] border border-slate-200/60 rounded-2xl p-6 shadow-sm shadow-slate-200/50 flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8',
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 text-xl border border-indigo-100">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            {title}
          </h1>
          {description && <p className="text-slate-500 text-sm mt-1">{description}</p>}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  )
}
