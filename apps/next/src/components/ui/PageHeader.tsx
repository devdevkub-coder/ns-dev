import * as React from 'react'

import { cn } from '@/lib/utils'

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  icon?: React.ReactNode
  actions?: React.ReactNode
}

export function PageHeader({ title, icon, actions, className, ...props }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between',
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-3">
        {icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-base text-slate-700">
            {icon}
          </div>
        )}
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            {title}
          </h1>
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
