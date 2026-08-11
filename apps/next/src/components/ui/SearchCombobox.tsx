'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

import { Input } from '@/components/ui/Input'
import { OptionPickerDialog, resolveOptionPickerMode, type OptionPickerMode } from '@/components/ui/OptionPickerDialog'
import { cn } from '@/lib/utils'

export type SearchComboboxOption = {
  description?: string
  id: string
  label: string
  searchText?: string
}

export function getSearchComboboxPanelPlacement(input: {
  inputRect: Pick<DOMRect, 'bottom' | 'left' | 'top' | 'width'>
  viewport: { height: number; top: number }
  gutter?: number
  maxHeight?: number
}) {
  const gutter = input.gutter ?? 8
  const maxHeight = input.maxHeight ?? 256
  const spaceBelow = Math.max(0, input.viewport.top + input.viewport.height - input.inputRect.bottom - gutter)
  const spaceAbove = Math.max(0, input.inputRect.top - input.viewport.top - gutter)
  const placeAbove = spaceBelow < Math.min(maxHeight, 160) && spaceAbove > spaceBelow
  const availableSpace = placeAbove ? spaceAbove : spaceBelow

  return {
    maxHeight: Math.max(48, Math.min(maxHeight, availableSpace)),
    placement: placeAbove ? 'above' as const : 'below' as const,
    top: placeAbove
      ? input.inputRect.top - Math.max(48, Math.min(maxHeight, availableSpace)) - 4
      : input.inputRect.bottom + 4,
  }
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
  pickerMode = 'dropdown',
  placeholder,
  readOnly = false,
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
  pickerMode?: OptionPickerMode
  placeholder?: string
  readOnly?: boolean
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
  const mobileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<number | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedOption = useMemo(() => options.find((option) => option.id === value) ?? null, [options, value])
  const selectedLabel = selectedOption?.label ?? ''
  const selectedLabelQuery = selectedLabel.trim().toLowerCase()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(selectedLabel)
  const [panelRect, setPanelRect] = useState<{ left: number; maxHeight: number; top: number; width: number } | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [isCoarsePointer, setIsCoarsePointer] = useState(false)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const touchMovedRef = useRef(false)
  const suppressTouchClickUntilRef = useRef(0)
  const suppressOpenOnFocusRef = useRef(false)
  const resolvedPickerMode = resolveOptionPickerMode(pickerMode, options.length)
  const isSelectedValueQuery = Boolean(selectedOption) && query.trim().toLowerCase() === selectedLabelQuery

  const lastEmittedValueRef = useRef<string | null>(null)

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return
    window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
  }, [])

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer])

  useEffect(() => {
    if (lastEmittedValueRef.current === null || lastEmittedValueRef.current !== value) {
      setQuery(selectedLabel)
    }
    lastEmittedValueRef.current = value
  }, [value, selectedLabel])

  useEffect(() => {
    if (!open || resolvedPickerMode === 'dialog') return

    const coarsePointer = window.matchMedia('(pointer: coarse)')
    setIsCoarsePointer(coarsePointer.matches)

    if (coarsePointer.matches) {
      requestAnimationFrame(() => mobileInputRef.current?.focus())
    }

    const updatePanelRect = () => {
      const input = inputRef.current
      if (!input) return
      const inputRect = input.getBoundingClientRect()
      const viewport = window.visualViewport
      const viewportLeft = viewport?.offsetLeft ?? 0
      const viewportWidth = viewport?.width ?? window.innerWidth
      const viewportTop = viewport?.offsetTop ?? 0
      const panelPlacement = getSearchComboboxPanelPlacement({
        inputRect,
        viewport: {
          height: viewport?.height ?? window.innerHeight,
          top: viewportTop,
        },
      })
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
      const clamped = clampToViewport(
        viewportLeft + gutter,
        viewportLeft + viewportWidth - gutter,
        inputRect.width,
      )
      setPanelRect({
        left: clamped.left,
        maxHeight: panelPlacement.maxHeight,
        top: panelPlacement.top,
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
  }, [open, resolvedPickerMode])

  useEffect(() => {
    if (open) return
    setIsCoarsePointer(false)
  }, [open])

  useEffect(() => {
    if (!open || resolvedPickerMode === 'dialog') return

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
      clearCloseTimer()
      setOpen(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('touchstart', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('touchstart', handleOutsideClick)
    }
  }, [clearCloseTimer, open, options, query, resolvedPickerMode, selectedOption, onChange, inputId])

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
    clearCloseTimer()
    lastEmittedValueRef.current = option.id
    onChange(option.id)
    setQuery(option.label)
    setOpen(false)
    if (resolvedPickerMode !== 'dialog' && shouldAutoSelectText()) {
      inputRef.current?.focus()
    }
  }

  const fieldInvalid = Boolean(error && !disabled)

  const closePicker = () => {
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
    clearCloseTimer()
    setOpen(false)
  }

  const handlePickerKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closePicker()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (filteredOptions.length === 0) return
      setHighlightedIndex((current) => current < 0 ? 0 : Math.min(current + 1, filteredOptions.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (filteredOptions.length === 0) return
      setHighlightedIndex((current) => current < 0 ? filteredOptions.length - 1 : Math.max(current - 1, 0))
      return
    }
    if (event.key === 'Enter' && filteredOptions[highlightedIndex >= 0 ? highlightedIndex : 0]) {
      event.preventDefault()
      selectOption(filteredOptions[highlightedIndex >= 0 ? highlightedIndex : 0])
    }
  }

  return (
    <div ref={containerRef} className="relative" data-error-key={errorKey} data-manual-required={hasInlineRequired ? 'true' : undefined}>
      {!hideLabel ? <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={inputId}>{labelText}{hasInlineRequired ? <span className="ml-1 text-red-600">*</span> : null}</label> : null}
      <Input
        ref={inputRef}
        aria-autocomplete="list"
        aria-activedescendant={open && highlightedIndex >= 0 ? `${inputId}-option-${highlightedIndex}` : undefined}
        aria-controls={`${inputId}-options`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={fieldInvalid}
        aria-label={hideLabel ? labelText : undefined}
        className={cn(
          'h-10 w-full rounded-md border px-3 py-2 text-base focus-visible:!border-[var(--ns-field-focus)] focus-visible:!ring-[3px] focus-visible:!ring-[var(--ns-field-focus-ring)] sm:text-sm',
          fieldInvalid ? 'border-red-400 bg-red-50 dark:border-red-500 dark:bg-red-950/20' : 'border-slate-300 dark:[border-color:var(--ns-dark-border-strong)]',
          inputClassName,
        )}
        disabled={disabled}
        id={inputId}
        placeholder={placeholder}
        readOnly={readOnly}
        role="combobox"
        required={hasInlineRequired}
        type="search"
        value={query}
        onClick={() => {
          if (disabled) return
          setOpen(true)
          if (!isSelectedValueQuery) return
          if (readOnly) return
          if (!shouldAutoSelectText()) return
          requestAnimationFrame(() => inputRef.current?.select())
        }}

        onChange={(event) => {
          if (disabled) return
          const nextQuery = event.target.value
          setQuery(nextQuery)
          setOpen(true)
          if (resolvedPickerMode !== 'dialog' && value && nextQuery !== selectedLabel) {
            lastEmittedValueRef.current = ''
            onChange('')
          }
        }}
        onFocus={() => {
          if (disabled) return
          if (suppressOpenOnFocusRef.current) return
          clearCloseTimer()
          if (openOnFocus) setOpen(true)
          if (!isSelectedValueQuery) return
          if (readOnly) return
          if (!shouldAutoSelectText()) return
          requestAnimationFrame(() => inputRef.current?.select())
        }}
        onBlur={() => {
          if (resolvedPickerMode === 'dialog') return
          // Delay close so a click on a portal option (which blurs the input
          // first) still registers. Restores the query like handleOutsideClick
          // does, and prevents multiple combobox popups stacking in forms that
          // render more than one (e.g. production order product pickers).
          clearCloseTimer()
          closeTimerRef.current = window.setTimeout(() => {
            closeTimerRef.current = null
            const activeElement = document.activeElement
            const optionsPanel = document.getElementById(`${inputId}-options`)
            if (activeElement && (containerRef.current?.contains(activeElement) || optionsPanel?.contains(activeElement))) return
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
      {resolvedPickerMode === 'dialog' ? (
        <OptionPickerDialog
          listboxId={`${inputId}-options`}
          open={open}
          title={`เลือก${labelText}`}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            suppressOpenOnFocusRef.current = true
            inputRef.current?.focus({ preventScroll: true })
            suppressOpenOnFocusRef.current = false
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            mobileInputRef.current?.focus({ preventScroll: true })
          }}
          onOpenChange={(nextOpen) => {
            if (nextOpen) {
              setOpen(true)
              return
            }
            closePicker()
          }}
          search={(
            <Input
              ref={mobileInputRef}
              aria-autocomplete="list"
              aria-controls={`${inputId}-options`}
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-label={`ค้นหา${labelText}`}
              className="h-11 w-full rounded-md border-slate-300 text-base dark:[border-color:var(--ns-dark-border-strong)]"
              placeholder={placeholder}
              readOnly={readOnly}
              type="search"
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value
                setQuery(nextQuery)
              }}
              onKeyDown={handlePickerKeyDown}
            />
          )}
        >
          {filteredOptions.length > 0 ? filteredOptions.map((option, index) => (
            <button
              key={option.id}
              ref={(element) => { optionRefs.current[index] = element }}
              id={`${inputId}-option-${index}`}
              aria-selected={option.id === value}
              className={`block w-full overflow-hidden rounded-sm px-3 py-3 text-left text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:[background-color:var(--ns-dropdown-selected)] ${option.id === value || highlightedIndex === index ? 'bg-slate-100 text-slate-900 dark:![background-color:var(--ns-dropdown-selected)] dark:![color:var(--ns-dark-text)]' : ''}`}
              role="option"
              type="button"
              onClick={() => selectOption(option)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <span className="block break-words font-medium">{option.label}</span>
              {option.description ? <span className="block break-words text-sm text-slate-500 dark:text-slate-400">{option.description}</span> : null}
            </button>
          )) : <div className="px-3 py-3 text-base text-slate-500 dark:text-slate-400">ไม่พบข้อมูลที่ตรงกับคำค้นหา</div>}
        </OptionPickerDialog>
      ) : null}
      {resolvedPickerMode === 'dropdown' && open && panelRect
        ? createPortal(
            <div
              id={`${inputId}-options`}
              className={cn(
                'pointer-events-auto fixed z-[80] flex flex-col border-slate-200 bg-white p-1 text-base shadow-xl sm:text-sm dark:[border-color:var(--ns-dark-border-strong)] dark:[background-color:var(--ns-dropdown-surface)]',
                isCoarsePointer
                  ? 'z-[90] h-[100dvh] max-h-[100dvh] w-full overflow-hidden rounded-none border-0 p-4 pt-[calc(env(safe-area-inset-top)+1rem)]'
                  : 'max-h-none overflow-hidden rounded-md border',
                optionsPanelClassName,
              )}
              role="listbox"
              style={isCoarsePointer
                ? { height: '100dvh', inset: 0, maxHeight: '100dvh', overscrollBehavior: 'contain', touchAction: 'pan-y', width: '100%' }
                : { left: panelRect.left, maxHeight: panelRect.maxHeight, overscrollBehavior: 'contain', top: panelRect.top, touchAction: 'pan-y', width: panelRect.width }}
            >
              <div className={cn('mb-3 items-center gap-3', isCoarsePointer ? 'flex' : 'hidden')}>
                <Input
                  ref={mobileInputRef}
                  aria-autocomplete="list"
                  aria-controls={`${inputId}-options`}
                  aria-expanded={open}
                  aria-haspopup="listbox"
                  aria-label={labelText}
                  className="h-11 min-w-0 flex-1 rounded-md border-slate-300 text-base dark:[border-color:var(--ns-dark-border-strong)]"
                  placeholder={placeholder}
                  readOnly={readOnly}
                  type="search"
                  value={query}
                  onChange={(event) => {
                    const nextQuery = event.target.value
                    setQuery(nextQuery)
                    setOpen(true)
                    if (value && nextQuery !== selectedLabel) {
                      lastEmittedValueRef.current = ''
                      onChange('')
                    }
                  }}
                  onFocus={clearCloseTimer}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setOpen(false)
                      return
                    }
                    if (event.key === 'Enter' && filteredOptions[highlightedIndex >= 0 ? highlightedIndex : 0]) {
                      event.preventDefault()
                      selectOption(filteredOptions[highlightedIndex >= 0 ? highlightedIndex : 0])
                    }
                  }}
                />
                <button
                  aria-label="ปิดรายการ"
                  className="h-11 shrink-0 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-100"
                  type="button"
                  onClick={() => {
                    clearCloseTimer()
                    setOpen(false)
                  }}
                >
                  ปิด
                </button>
              </div>
              <div
                className={cn(
                  'overscroll-contain touch-pan-y',
                  'min-h-0 flex-1 overflow-y-auto',
                )}
                style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', touchAction: 'pan-y' }}
                onTouchStartCapture={(event) => {
                  const touch = event.touches[0]
                  touchStartRef.current = { x: touch.clientX, y: touch.clientY }
                  touchMovedRef.current = false
                }}
                onTouchMoveCapture={(event) => {
                  if (!touchStartRef.current) return
                  const touch = event.touches[0]
                  const deltaX = Math.abs(touch.clientX - touchStartRef.current.x)
                  const deltaY = Math.abs(touch.clientY - touchStartRef.current.y)
                  if (deltaX > 10 || deltaY > 10) touchMovedRef.current = true
                }}
                onTouchEndCapture={(event) => {
                  if (touchMovedRef.current) {
                    event.stopPropagation()
                    suppressTouchClickUntilRef.current = Date.now() + 300
                  }
                  touchStartRef.current = null
                  touchMovedRef.current = false
                }}
              >
              {filteredOptions.length > 0 ? filteredOptions.map((option, index) => (
                <button
                  key={option.id}
                  ref={(element) => {
                    optionRefs.current[index] = element
                  }}
                  id={`${inputId}-option-${index}`}
                  aria-selected={option.id === value}
                  className={`block w-full overflow-hidden rounded-sm px-3 py-2 text-left text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:[background-color:var(--ns-dropdown-selected)] ${option.id === value ? 'bg-slate-100 text-slate-900 dark:![background-color:var(--ns-dropdown-selected)] dark:![color:var(--ns-dark-text)]' : highlightedIndex === index ? 'bg-slate-100 text-slate-900 dark:![background-color:var(--ns-dropdown-selected)] dark:![color:var(--ns-dark-text)]' : ''}`}
                  role="option"
                  type="button"
                  onMouseDownCapture={(event) => {
                    event.stopPropagation()
                    if (shouldAutoSelectText()) selectOption(option)
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={(event) => {
                    event.preventDefault()
                    if (Date.now() < suppressTouchClickUntilRef.current) {
                      suppressTouchClickUntilRef.current = 0
                      return
                    }
                    if (!shouldAutoSelectText()) selectOption(option)
                  }}
                >
                  <span className="block break-words font-medium">{option.label}</span>
                  {option.description ? <span className="block break-words text-sm text-slate-500 sm:text-xs dark:text-slate-400">{option.description}</span> : null}
                </button>
              )) : <div className="px-3 py-2 text-base text-slate-500 sm:text-sm dark:text-slate-400">ไม่พบข้อมูลที่ตรงกับคำค้นหา</div>}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
