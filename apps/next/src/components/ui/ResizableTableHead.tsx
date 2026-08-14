'use client'

import { useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
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
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const divRef = useRef<HTMLDivElement | null>(null)
  const labelRef = useRef<HTMLSpanElement | null>(null)
  const sortRef = useRef<HTMLSpanElement | null>(null)
  const [arrowFits, setArrowFits] = useState(true)

  // Hide the sort arrows when the column is too narrow to fit them next to the
  // full label text — the label is never truncated and never overlaps the arrows.
  useLayoutEffect(() => {
    if (!sortKey) return
    const container = buttonRef.current ?? divRef.current
    const label = labelRef.current
    if (!container || !label) return
    const measure = () => {
      const style = getComputedStyle(container)
      const paddingX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
      const gap = parseFloat(style.gap) || 12
      const sortWidth = sortRef.current ? sortRef.current.offsetWidth : 12
      const available = container.clientWidth - paddingX
      const needed = label.scrollWidth + sortWidth + gap
      setArrowFits(needed <= available)
    }
    measure()
    const timers = [window.setTimeout(measure, 80), window.setTimeout(measure, 300), window.setTimeout(measure, 800)]
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      try {
        observer = new ResizeObserver(measure)
        observer.observe(container)
      } catch {
        observer = null
      }
    }
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      window.removeEventListener('resize', onResize)
      observer?.disconnect()
    }
  }, [sortKey])

  const labelContent = (
    <span
      ref={labelRef}
      className="min-w-0 whitespace-nowrap leading-snug"
      title={typeof label === 'string' ? label : undefined}
    >
      {label}
    </span>
  )
  const sortContent = sortKey && arrowFits ? (
    <span ref={sortRef} aria-hidden="true" className="flex h-5 w-3 shrink-0 flex-col items-center justify-center gap-0.5 leading-none">
      <Triangle className={`size-2.5 fill-current stroke-none ${active && direction === 'asc' ? '' : 'text-slate-400'}`} style={active && direction === 'asc' ? activeSortIconStyle : undefined} />
      <Triangle className={`size-2.5 rotate-180 fill-current stroke-none ${active && direction === 'desc' ? '' : 'text-slate-400'}`} style={active && direction === 'desc' ? activeSortIconStyle : undefined} />
    </span>
  ) : null
  const content = <>{labelContent}{sortContent}</>

  return (
    <th
      aria-sort={sortKey ? (active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
      data-column-align={align}
      data-resizable-table-head=""
      className={`relative bg-inherit p-0 text-xs font-semibold text-slate-700 ${alignment.text} ${className}`}
    >
      {sortKey && onSort ? (
        <button className={`flex w-full min-w-0 items-center ${alignment.justify} gap-3 ${contentPadding} ${alignment.text} hover:bg-slate-200 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-blue-500/40`} ref={buttonRef} type="button" onClick={() => onSort(sortKey)}>
          {content}
        </button>
      ) : (
        <div className={`flex min-w-0 items-center ${alignment.justify} gap-3 ${contentPadding} ${alignment.text}`} ref={divRef}>
          {content}
        </div>
      )}
      {resizeProps ? (
        <button
          {...resizeProps}
          className="group absolute right-0 top-0 bottom-0 w-3 cursor-col-resize touch-none focus:outline-none focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-blue-500/60"
          type="button"
        >
          <div className="absolute right-1 top-2.5 bottom-2.5 w-[1px] bg-slate-300 opacity-0 transition group-hover:bg-slate-400 group-hover:opacity-100 group-focus-visible:bg-blue-500 group-focus-visible:opacity-100 group-active:bg-blue-600 group-active:opacity-100" />
        </button>
      ) : null}
    </th>
  )
}
