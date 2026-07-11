'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'

import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

type PrimitiveItem = string | {
  description?: string
  label?: string
  searchText?: string
  value: string
}

type NormalizedItem = {
  description?: string
  label: string
  raw: PrimitiveItem
  searchText: string
  value: string
}

type ComboboxContextValue = {
  disabled: boolean
  filteredItems: NormalizedItem[]
  inputId?: string
  open: boolean
  query: string
  selectValue: (value: string) => void
  selectedValue?: string
  setOpen: (open: boolean) => void
  setQuery: (query: string) => void
}

const ComboboxContext = React.createContext<ComboboxContextValue | null>(null)

function useComboboxContext(componentName: string) {
  const context = React.useContext(ComboboxContext)
  if (!context) throw new Error(`${componentName} must be used within <Combobox>`)
  return context
}

function normalizeItem(item: PrimitiveItem): NormalizedItem {
  if (typeof item === 'string') {
    return {
      label: item,
      raw: item,
      searchText: item.toLowerCase(),
      value: item,
    }
  }
  const label = item.label ?? item.value
  return {
    description: item.description,
    label,
    raw: item,
    searchText: (item.searchText ?? `${item.value} ${label}`).toLowerCase(),
    value: item.value,
  }
}

export function Combobox({
  children,
  disabled = false,
  inputId,
  items,
  value,
  onValueChange,
}: {
  children: React.ReactNode
  disabled?: boolean
  inputId?: string
  items: PrimitiveItem[]
  onValueChange?: (value: string) => void
  value?: string
}) {
  const normalizedItems = React.useMemo(() => items.map(normalizeItem), [items])
  const selectedItem = React.useMemo(() => normalizedItems.find((item) => item.value === value) ?? null, [normalizedItems, value])
  const selectedLabel = selectedItem?.label ?? ''
  const selectedLabelQuery = selectedLabel.trim().toLowerCase()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState(selectedLabel)
  const isSelectedValueQuery = Boolean(selectedItem) && query.trim().toLowerCase() === selectedLabelQuery

  React.useEffect(() => {
    setQuery(selectedLabel)
  }, [selectedLabel])

  const filteredItems = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const rows = normalizedQuery
      ? isSelectedValueQuery
        ? normalizedItems
        : normalizedItems.filter((item) => item.searchText.includes(normalizedQuery) || item.label.toLowerCase().includes(normalizedQuery))
      : normalizedItems
    return rows.slice(0, 80)
  }, [isSelectedValueQuery, normalizedItems, query])

  const selectValue = React.useCallback((nextValue: string) => {
    const item = normalizedItems.find((entry) => entry.value === nextValue)
    onValueChange?.(nextValue)
    setQuery(item?.label ?? '')
    setOpen(false)
  }, [normalizedItems, onValueChange])

  const contextValue = React.useMemo<ComboboxContextValue>(() => ({
    disabled,
    filteredItems,
    inputId,
    open,
    query,
    selectValue,
    selectedValue: value,
    setOpen,
    setQuery,
  }), [disabled, filteredItems, inputId, open, query, selectValue, value])

  return <ComboboxContext.Provider value={contextValue}>{children}</ComboboxContext.Provider>
}

export function ComboboxInput({
  buttonClassName,
  className,
  inputGroupClassName,
  placeholder,
  withDropdownButton = false,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  buttonClassName?: string
  inputGroupClassName?: string
  withDropdownButton?: boolean
}) {
  const { disabled, filteredItems, inputId, open, query, selectValue, selectedValue, setOpen, setQuery } = useComboboxContext('ComboboxInput')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const selectedItem = React.useMemo(() => filteredItems.find((item) => item.value === selectedValue) ?? null, [filteredItems, selectedValue])
  const selectedLabel = selectedItem?.label ?? query
  const isSelectedValueQuery = Boolean(selectedItem) && query.trim().toLowerCase() === selectedLabel.trim().toLowerCase()

  const inputNode = (
    <Input
      ref={inputRef}
      aria-autocomplete="list"
      aria-controls={inputId ? `${inputId}-options` : undefined}
      aria-expanded={open}
      aria-haspopup="listbox"
      className={cn(
        className,
        withDropdownButton ? 'w-full rounded-md-none border-0 bg-transparent pr-8 shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent' : undefined,
      )}
      data-slot={withDropdownButton ? 'input-group-control' : undefined}
      disabled={disabled || props.disabled}
      id={inputId}
      placeholder={placeholder}
      role="combobox"
      type={withDropdownButton ? 'text' : 'search'}
      value={query}
      {...props}
      onBlur={() => {
        if (disabled) return
        window.setTimeout(() => {
          const exactMatch = filteredItems.find((item) => item.label.toLowerCase() === query.trim().toLowerCase())
          if (exactMatch) {
            selectValue(exactMatch.value)
          } else {
            setQuery(selectedLabel)
            setOpen(false)
          }
        }, 120)
      }}
      onChange={(event) => {
        if (disabled) return
        const nextQuery = event.target.value
        setQuery(nextQuery)
        setOpen(true)
        if (selectedValue && nextQuery !== selectedLabel) {
          onValueChangeFallback(selectValue)
        }
      }}
      onClick={() => {
        if (disabled) return
        setOpen(true)
        if (!isSelectedValueQuery) return
        requestAnimationFrame(() => inputRef.current?.select())
      }}
      onFocus={() => {
        if (disabled) return
        setOpen(true)
        if (!isSelectedValueQuery) return
        requestAnimationFrame(() => inputRef.current?.select())
      }}
      onKeyDown={(event) => {
        if (disabled) return
        if (event.key === 'Escape') {
          setOpen(false)
          return
        }
        if (event.key === 'Enter' && open && filteredItems[0]) {
          event.preventDefault()
          selectValue(filteredItems[0].value)
        }
      }}
    />
  )

  if (!withDropdownButton) return inputNode

  return (
    <div
      className={cn(
        'group/input-group relative flex h-8 min-w-0 items-center overflow-hidden rounded-md border border-slate-300 bg-white transition-colors outline-none has-[[data-slot=input-group-control]:focus-visible]:border-blue-500 has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-blue-100 dark:[border-color:var(--ns-dark-border-strong)] dark:[background-color:var(--ns-dark-surface-soft)] dark:has-[[data-slot=input-group-control]:focus-visible]:[border-color:var(--ns-dark-border-strong)] dark:has-[[data-slot=input-group-control]:focus-visible]:ring-0',
        inputGroupClassName,
      )}
      data-slot="input-group"
      role="group"
    >
      {inputNode}
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md border-0 p-0 text-slate-500 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-0',
          buttonClassName,
        )}
        disabled={disabled}
        data-placeholder=""
        data-size="icon-xs"
        data-slot="input-group-button"
        tabIndex={0}
        type="button"
        onMouseDown={(event) => {
          if (disabled) return
          event.preventDefault()
          setOpen(!open)
          inputRef.current?.focus()
        }}
      >
        <ChevronDown className="pointer-events-none size-4 text-slate-400" />
      </button>
    </div>
  )
}

function onValueChangeFallback(selectValue: (value: string) => void) {
  selectValue('')
}

export function ComboboxContent({ children, className }: { children: React.ReactNode; className?: string }) {
  const { inputId, open } = useComboboxContext('ComboboxContent')
  if (!open) return null
  return <div className={className ?? 'absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-xl dark:[border-color:var(--ns-dark-border-strong)] dark:[background-color:var(--ns-dark-surface)]'} data-slot="combobox-content" id={inputId ? `${inputId}-options` : undefined} role="listbox">{children}</div>
}

export function ComboboxEmpty({ children }: { children: React.ReactNode }) {
  const { filteredItems } = useComboboxContext('ComboboxEmpty')
  if (filteredItems.length > 0) return null
  return <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">{children}</div>
}

export function ComboboxList({ children }: { children: (item: PrimitiveItem) => React.ReactNode }) {
  const { filteredItems } = useComboboxContext('ComboboxList')
  if (filteredItems.length === 0) return null
  return <>{filteredItems.map((item) => children(item.raw))}</>
}

export function ComboboxItem({
  children,
  value,
}: {
  children: React.ReactNode
  value: string
}) {
  const { filteredItems, selectValue, selectedValue } = useComboboxContext('ComboboxItem')
  const item = filteredItems.find((entry) => entry.value === value)
  const active = selectedValue === value
  return (
    <button
      aria-selected={active}
      className={`block w-full px-3 py-2 text-left text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:[background-color:var(--ns-dark-surface-hover)] ${active ? 'bg-slate-100 text-slate-900 dark:![background-color:var(--ns-dark-surface-hover)] dark:![color:var(--ns-dark-text)]' : ''}`}
      role="option"
      type="button"
      onMouseDown={(event) => {
        event.preventDefault()
        selectValue(value)
      }}
    >
      <span className="block font-medium">{children}</span>
      {item?.description ? <span className="block text-xs text-slate-500 dark:text-slate-400">{item.description}</span> : null}
    </button>
  )
}
