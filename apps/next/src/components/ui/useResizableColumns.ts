'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'

export type ResizableColumnDefinition<TKey extends string> = {
  defaultWidth: number
  key: TKey
  maxWidth?: number
  minWidth?: number
}

const STORAGE_PREFIX = 'ns_erp_table_columns'

function clamp(value: number, min: number, max?: number) {
  return Math.min(Math.max(value, min), max ?? Number.POSITIVE_INFINITY)
}

export function useResizableColumns<TKey extends string>(
  tableKey: string,
  columns: Array<ResizableColumnDefinition<TKey>>,
) {
  const storageKey = `${STORAGE_PREFIX}:${tableKey}`
  const [isLoaded, setIsLoaded] = useState(false)

  const defaultWidths = useMemo(() => Object.fromEntries(columns.map((column) => [column.key, column.defaultWidth])) as Record<TKey, number>, [columns])
  const columnByKey = useMemo(() => new Map(columns.map((column) => [column.key, column])), [columns])
  const [widths, setWidths] = useState<Record<TKey, number>>(defaultWidths)
  const widthsRef = useRef(widths)

  useEffect(() => {
    widthsRef.current = widths
  }, [widths])

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey)
      if (!saved) {
        setWidths(defaultWidths)
        return
      }
      const parsed = JSON.parse(saved) as Partial<Record<TKey, number>>
      setWidths(Object.fromEntries(columns.map((column) => {
        const savedWidth = parsed[column.key]
        const nextWidth = typeof savedWidth === 'number'
          ? clamp(savedWidth, column.minWidth ?? 80, column.maxWidth)
          : column.defaultWidth
        return [column.key, nextWidth]
      })) as Record<TKey, number>)
    } catch {
      setWidths(defaultWidths)
    } finally {
      setIsLoaded(true)
    }
  }, [columns, defaultWidths, storageKey])

  useEffect(() => {
    if (!isLoaded) return
    window.localStorage.setItem(storageKey, JSON.stringify(widths))
  }, [isLoaded, storageKey, widths])

  const beginResize = useCallback((key: TKey, event: PointerEvent<HTMLElement>) => {
    const column = columnByKey.get(key)
    if (!column) return

    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = widthsRef.current[key] ?? column.defaultWidth
    const minWidth = column.minWidth ?? 80
    const maxWidth = column.maxWidth
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const move = (moveEvent: globalThis.PointerEvent) => {
      const nextWidth = clamp(startWidth + moveEvent.clientX - startX, minWidth, maxWidth)
      setWidths((current) => ({ ...current, [key]: nextWidth }))
    }

    const stop = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', stop)
      document.removeEventListener('pointercancel', stop)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }

    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', stop, { once: true })
    document.addEventListener('pointercancel', stop, { once: true })
  }, [columnByKey])

  const getColumnStyle = useCallback((key: TKey): CSSProperties => {
    const column = columnByKey.get(key)
    const width = widths[key] ?? column?.defaultWidth ?? 120
    return {
      minWidth: column?.minWidth ?? 80,
      width,
    }
  }, [columnByKey, widths])

  const getResizeHandleProps = useCallback((key: TKey, label: string) => ({
    'aria-label': `ปรับความกว้างคอลัมน์ ${label}`,
    onClick: (event: MouseEvent<HTMLElement>) => {
      event.preventDefault()
      event.stopPropagation()
    },
    onPointerDown: (event: PointerEvent<HTMLElement>) => beginResize(key, event),
    title: `ลากเพื่อปรับความกว้างคอลัมน์ ${label}`,
  }), [beginResize])

  const resetColumnWidths = useCallback(() => {
    window.localStorage.removeItem(storageKey)
    setWidths(defaultWidths)
  }, [defaultWidths, storageKey])

  const hasCustomWidths = useMemo(
    () => columns.some((column) => (widths[column.key] ?? column.defaultWidth) !== column.defaultWidth),
    [columns, widths],
  )
  const tableMinWidth = useMemo(() => {
    const contentWidth = columns.reduce((sum, column) => sum + (widths[column.key] ?? column.defaultWidth), 0)
    return `max(${contentWidth}px, 100%)`
  }, [columns, widths])

  /** Exact pixel sum of all column widths — use this with `tableLayout: 'fixed'` to avoid stretching gaps. */
  const tableContentWidth = useMemo(() => {
    return columns.reduce((sum, column) => sum + (widths[column.key] ?? column.defaultWidth), 0)
  }, [columns, widths])

  return {
    getColumnStyle,
    getResizeHandleProps,
    hasCustomWidths,
    resetColumnWidths,
    tableContentWidth,
    tableMinWidth,
  }
}
