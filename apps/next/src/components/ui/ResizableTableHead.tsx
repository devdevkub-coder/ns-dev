'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Triangle } from 'lucide-react'

type Align = 'center' | 'left' | 'right'
type SortDirection = 'asc' | 'desc'

const alignmentClasses: Record<Align, { justify: string; text: string }> = {
  center: { justify: 'justify-center', text: 'text-center' },
  left: { justify: 'justify-start', text: 'text-left' },
  right: { justify: 'justify-end', text: 'text-right' },
}

export function ResizableTableHead<TSortKey extends string>({
  activeSortKey,
  align = 'left',
  className = '',
  direction,
  label,
  resizeProps,
  sortKey,
  onSort,
}: {
  activeSortKey?: TSortKey
  align?: Align
  className?: string
  direction?: SortDirection
  label: ReactNode
  onSort?: (key: TSortKey) => void
  resizeProps?: ButtonHTMLAttributes<HTMLButtonElement>
  sortKey?: TSortKey
}) {
  const active = Boolean(sortKey && activeSortKey === sortKey)
  const alignment = alignmentClasses[align]
  const contentPadding = align === 'right' ? 'p-2 pr-3' : 'p-2 pr-4'
  const activeSortIconStyle = { color: 'var(--ns-sort-active)' }
  const content = (
    <>
      <span className="min-w-0 whitespace-nowrap leading-snug">{label}</span>
      {sortKey ? (
        <span aria-hidden="true" className="flex h-5 w-3 shrink-0 flex-col items-center justify-center gap-0.5 leading-none">
          <Triangle className={`size-2.5 fill-current stroke-none ${active && direction === 'asc' ? '' : 'text-slate-400'}`} style={active && direction === 'asc' ? activeSortIconStyle : undefined} />
          <Triangle className={`size-2.5 rotate-180 fill-current stroke-none ${active && direction === 'desc' ? '' : 'text-slate-400'}`} style={active && direction === 'desc' ? activeSortIconStyle : undefined} />
        </span>
      ) : null}
    </>
  )

  return (
    <th
      aria-sort={sortKey ? (active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
      data-column-align={align}
      data-resizable-table-head=""
      className={`relative bg-inherit p-0 text-xs font-semibold text-slate-700 ${alignment.text} ${className}`}
    >
      {sortKey && onSort ? (
        <button className={`flex w-full min-w-0 items-center ${alignment.justify} gap-1.5 ${contentPadding} ${alignment.text} hover:bg-slate-200`} type="button" onClick={() => onSort(sortKey)}>
          {content}
        </button>
      ) : (
        <div className={`flex min-w-0 items-center ${alignment.justify} gap-1.5 ${contentPadding} ${alignment.text}`}>
          {content}
        </div>
      )}
      {resizeProps ? (
        <button
          {...resizeProps}
          className="group absolute right-0 top-0 bottom-0 w-3 cursor-col-resize touch-none focus:outline-none"
          type="button"
        >
          <div className="absolute right-1 top-2.5 bottom-2.5 w-[1px] bg-slate-300 opacity-0 transition group-hover:bg-slate-400 group-hover:opacity-100 group-focus-visible:opacity-100 group-active:bg-blue-600 group-active:opacity-100" />
        </button>
      ) : null}
    </th>
  )
}
