'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

export type SearchComboboxOption = {
  description?: string
  id: string
  label: string
  searchText?: string
}

export function SearchCombobox({
  disabled = false,
  error,
  errorKey,
  hideLabel = false,
  hideSelectedOptionFromList = false,
  inputClassName,
  inputId,
  label,
  options,
  optionsPanelClassName,
  openOnFocus = true,
  placeholder,
  value,
  onChange,
}: {
  disabled?: boolean
  error?: string
  errorKey?: string
  hideLabel?: boolean
  hideSelectedOptionFromList?: boolean
  inputClassName?: string
  inputId: string
  label: string
  options: SearchComboboxOption[]
  optionsPanelClassName?: string
  openOnFocus?: boolean
  placeholder?: string
  value: string
  onChange: (optionId: string) => void
}) {
  const shouldAutoSelectText = () => {
    if (typeof window === 'undefined') return true
    return !window.matchMedia('(pointer: coarse)').matches
  }
  const hasInlineRequired = label.trim().endsWith('*')
  const labelText = hasInlineRequired ? label.trim().slice(0, -1).trimEnd() : label
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const portalHostRef = useRef<HTMLElement | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const hasMovedRef = useRef(false)
  const selectedOption = useMemo(() => options.find((option) => option.id === value) ?? null, [options, value])
  const selectedLabel = selectedOption?.label ?? ''
  const selectedLabelQuery = selectedLabel.trim().toLowerCase()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(selectedLabel)
  const [panelRect, setPanelRect] = useState<{ left: number; top: number; width: number } | null>(null)
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const isSelectedValueQuery = Boolean(selectedOption) && query.trim().toLowerCase() === selectedLabelQuery

  const lastEmittedValueRef = useRef<string | null>(null)

  useEffect(() => {
    if (lastEmittedValueRef.current === null || lastEmittedValueRef.current !== value) {
      setQuery(selectedLabel)
    }
    lastEmittedValueRef.current = value
  }, [value, selectedLabel])

  useEffect(() => {
    const input = inputRef.current
    if (!input || typeof document === 'undefined') return
    const scopedPortalHost = input.closest('[role="dialog"]') || input.closest('[data-combobox-portal-root="true"]')
    const resolvedPortalHost = scopedPortalHost instanceof HTMLElement ? scopedPortalHost : document.body
    portalHostRef.current = resolvedPortalHost
    setPortalHost(resolvedPortalHost)
  }, [])

  useEffect(() => {
    if (!open) return

    const updatePanelRect = () => {
      const input = inputRef.current
      if (!input) return
      const inputRect = input.getBoundingClientRect()
      const viewport = window.visualViewport
      const viewportLeft = viewport?.offsetLeft ?? 0
      const viewportWidth = viewport?.width ?? window.innerWidth
      const gutter = 8
      const clampToViewport = (left: number, right: number, width: number) => {
        const availableWidth = Math.max(160, right - left)
        const nextWidth = Math.min(width, availableWidth)
        const nextLeft = Math.min(Math.max(inputRect.left, left), right - nextWidth)
        return {
          left: nextLeft,
          width: nextWidth,
        }
      }
      const host = portalHostRef.current
      if (!host || host === document.body) {
        const clamped = clampToViewport(
          viewportLeft + gutter,
          viewportLeft + viewportWidth - gutter,
          inputRect.width,
        )
        setPanelRect({
          left: clamped.left,
          top: inputRect.bottom + 4,
          width: clamped.width,
        })
        return
      }

      const hostRect = host.getBoundingClientRect()
      const clamped = clampToViewport(
        Math.max(hostRect.left, viewportLeft + gutter),
        Math.min(hostRect.right, viewportLeft + viewportWidth - gutter),
        inputRect.width,
      )
      setPanelRect({
        left: clamped.left - hostRect.left + host.scrollLeft,
        top: inputRect.bottom - hostRect.top + host.scrollTop + 4,
        width: clamped.width,
      })
    }

    updatePanelRect()
    window.addEventListener('resize', updatePanelRect)
    window.addEventListener('scroll', updatePanelRect, true)
    window.visualViewport?.addEventListener('resize', updatePanelRect)
    window.visualViewport?.addEventListener('scroll', updatePanelRect)
    return () => {
      window.removeEventListener('resize', updatePanelRect)
      window.removeEventListener('scroll', updatePanelRect, true)
      window.visualViewport?.removeEventListener('resize', updatePanelRect)
      window.visualViewport?.removeEventListener('scroll', updatePanelRect)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement
      if (containerRef.current?.contains(target)) return

      const optionsPanel = document.getElementById(`${inputId}-options`)
      if (optionsPanel?.contains(target)) return

      const exactMatch = options.find((option) => option.label.toLowerCase() === query.trim().toLowerCase())
      if (exactMatch) {
        lastEmittedValueRef.current = exactMatch.id
        onChange(exactMatch.id)
        setQuery(exactMatch.label)
      } else if (selectedOption) {
        setQuery(selectedOption.label)
      } else {
        setQuery('')
      }
      setOpen(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('touchstart', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('touchstart', handleOutsideClick)
    }
  }, [open, options, query, selectedOption, onChange, inputId])

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const rows = normalizedQuery
      ? isSelectedValueQuery
        ? options
        : options.filter((option) => (option.searchText ?? option.label).toLowerCase().includes(normalizedQuery))
      : options
    return (hideSelectedOptionFromList && value ? rows.filter((option) => option.id !== value) : rows).slice(0, 80)
  }, [hideSelectedOptionFromList, isSelectedValueQuery, options, query, value])

  useEffect(() => {
    if (!open) {
      setHighlightedIndex(-1)
      return
    }

    if (filteredOptions.length === 0) {
      setHighlightedIndex(-1)
      return
    }

    const selectedIndex = filteredOptions.findIndex((option) => option.id === value)
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0)
  }, [filteredOptions, open, value])

  useEffect(() => {
    if (highlightedIndex < 0) return
    optionRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex])

  const selectOption = (option: SearchComboboxOption) => {
    if (disabled) return
    lastEmittedValueRef.current = option.id
    onChange(option.id)
    setQuery(option.label)
    setOpen(false)
    if (shouldAutoSelectText()) inputRef.current?.focus()
  }

  return (
    <div ref={containerRef} className="relative" data-error-key={errorKey}>
      {!hideLabel ? <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor={inputId}>{labelText}{hasInlineRequired ? <span className="ml-1 text-red-600">*</span> : null}</label> : null}
      <Input
        ref={inputRef}
        aria-autocomplete="list"
        aria-activedescendant={open && highlightedIndex >= 0 ? `${inputId}-option-${highlightedIndex}` : undefined}
        aria-controls={`${inputId}-options`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={Boolean(error)}
        className={cn(
          'h-10 w-full rounded-md border px-3 py-2 text-base sm:text-sm',
          error ? 'border-red-400 bg-red-50 dark:border-red-500 dark:bg-red-950/20' : 'border-slate-300 dark:[border-color:var(--ns-dark-border-strong)]',
          inputClassName,
        )}
        disabled={disabled}
        id={inputId}
        placeholder={placeholder}
        role="combobox"
        required={hasInlineRequired}
        type="search"
        value={query}
        onClick={() => {
          if (disabled) return
          setOpen(true)
          if (!isSelectedValueQuery) return
          if (!shouldAutoSelectText()) return
          requestAnimationFrame(() => inputRef.current?.select())
        }}

        onChange={(event) => {
          if (disabled) return
          const nextQuery = event.target.value
          setQuery(nextQuery)
          setOpen(true)
          if (value && nextQuery !== selectedLabel) {
            lastEmittedValueRef.current = ''
            onChange('')
          }
        }}
        onFocus={() => {
          if (disabled) return
          if (openOnFocus) setOpen(true)
          if (!isSelectedValueQuery) return
          if (!shouldAutoSelectText()) return
          requestAnimationFrame(() => inputRef.current?.select())
        }}
        onBlur={() => {
          // Delay close so a click on a portal option (which blurs the input
          // first) still registers. Restores the query like handleOutsideClick
          // does, and prevents multiple combobox popups stacking in forms that
          // render more than one (e.g. production order product pickers).
          window.setTimeout(() => {
            if (!open) return
            const exactMatch = options.find((option) => option.label.toLowerCase() === query.trim().toLowerCase())
            if (exactMatch) {
              lastEmittedValueRef.current = exactMatch.id
              onChange(exactMatch.id)
              setQuery(exactMatch.label)
            } else if (selectedOption) {
              setQuery(selectedOption.label)
            } else {
              setQuery('')
            }
            setOpen(false)
          }, 150)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false)
            return
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (!open) {
              setOpen(true)
              return
            }
            if (filteredOptions.length === 0) return
            setHighlightedIndex((current) => {
              if (current < 0) return 0
              return Math.min(current + 1, filteredOptions.length - 1)
            })
            return
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) {
              setOpen(true)
              return
            }
            if (filteredOptions.length === 0) return
            setHighlightedIndex((current) => {
              if (current < 0) return filteredOptions.length - 1
              return Math.max(current - 1, 0)
            })
            return
          }
          if (event.key === 'Enter' && open && filteredOptions[highlightedIndex >= 0 ? highlightedIndex : 0]) {
            event.preventDefault()
            selectOption(filteredOptions[highlightedIndex >= 0 ? highlightedIndex : 0])
          }
        }}
      />
      {open && panelRect && portalHost
        ? createPortal(
            <div
              id={`${inputId}-options`}
              className={`${portalHost === document.body ? 'fixed' : 'absolute'} z-[80] max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-base shadow-xl sm:text-sm dark:[border-color:var(--ns-dark-border-strong)] dark:[background-color:var(--ns-dark-surface)] ${optionsPanelClassName ?? ''}`.trim()}
              role="listbox"
              style={{ left: panelRect.left, top: panelRect.top, width: panelRect.width }}
            >
              {filteredOptions.length > 0 ? filteredOptions.map((option, index) => (
                <button
                  key={option.id}
                  ref={(element) => {
                    optionRefs.current[index] = element
                  }}
                  id={`${inputId}-option-${index}`}
                  aria-selected={option.id === value}
                  className={`block w-full overflow-hidden px-3 py-2 text-left text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:[background-color:var(--ns-dark-surface-hover)] ${option.id === value ? 'bg-slate-100 text-slate-900 dark:![background-color:var(--ns-dark-surface-hover)] dark:![color:var(--ns-dark-text)]' : highlightedIndex === index ? 'bg-slate-100 text-slate-900 dark:![background-color:var(--ns-dark-surface-hover)] dark:![color:var(--ns-dark-text)]' : ''}`}
                  role="option"
                  type="button"
                  onMouseDownCapture={(event) => {
                    event.stopPropagation()
                    selectOption(option)
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onTouchStartCapture={(event) => {
                    const touch = event.touches[0]
                    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
                    hasMovedRef.current = false
                  }}
                  onTouchMoveCapture={(event) => {
                    if (!touchStartRef.current) return
                    const touch = event.touches[0]
                    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x)
                    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y)
                    if (deltaX > 10 || deltaY > 10) {
                      hasMovedRef.current = true
                    }
                  }}
                  onTouchEndCapture={(event) => {
                    event.stopPropagation()
                    if (!hasMovedRef.current) {
                      event.preventDefault()
                      selectOption(option)
                    }
                    touchStartRef.current = null
                  }}
                  onClick={(event) => {
                    event.preventDefault()
                  }}
                >
                  <span className="block break-words font-medium">{option.label}</span>
                  {option.description ? <span className="block break-words text-sm text-slate-500 sm:text-xs dark:text-slate-400">{option.description}</span> : null}
                </button>
              )) : <div className="px-3 py-2 text-base text-slate-500 sm:text-sm dark:text-slate-400">ไม่พบข้อมูลที่ตรงกับคำค้นหา</div>}
            </div>,
            portalHost,
          )
        : null}
    </div>
  )
}
