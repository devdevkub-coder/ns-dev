'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'

type Align = 'center' | 'left' | 'right'
type SortDirection = 'asc' | 'desc'

export function ResizableTableHead<TSortKey extends string>({
  activeSortKey,
  align = 'left',
  direction,
  label,
  resizeProps,
  sortKey,
  onSort,
}: {
  activeSortKey?: TSortKey
  align?: Align
  direction?: SortDirection
  label: ReactNode
  onSort?: (key: TSortKey) => void
  resizeProps?: ButtonHTMLAttributes<HTMLButtonElement>
  sortKey?: TSortKey
}) {
  const alignClass = align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : 'justify-start text-left'
  const active = Boolean(sortKey && activeSortKey === sortKey)
  const content = (
    <>
      <span className="truncate">{label}</span>
      {sortKey ? (
        <span className="shrink-0">
          {active ? (
            direction === 'asc' ? (
              <ChevronUp className="size-3.5 text-slate-800" />
            ) : (
              <ChevronDown className="size-3.5 text-slate-800" />
            )
          ) : (
            <ChevronsUpDown className="size-3.5 text-slate-400" />
          )}
        </span>
      ) : null}
    </>
  )

  return (
    <th className={`relative p-0 text-xs font-semibold text-slate-700 bg-inherit ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}>
      {sortKey && onSort ? (
        <button className={`flex w-full min-w-0 items-center gap-1 p-2 pr-4 hover:bg-slate-200 ${alignClass}`} type="button" onClick={() => onSort(sortKey)}>
          {content}
        </button>
      ) : (
        <div className={`flex min-w-0 items-center gap-1 p-2 pr-4 ${alignClass}`}>
          {content}
        </div>
      )}
      {resizeProps ? (
        <button
          {...resizeProps}
          className="group absolute right-0 top-0 bottom-0 w-3 cursor-col-resize touch-none focus:outline-none"
          type="button"
        >
          <div className="absolute right-1 top-2.5 bottom-2.5 w-[1px] bg-slate-300 transition-colors group-hover:bg-slate-500 group-active:bg-blue-600" />
        </button>
      ) : null}
    </th>
  )
}
