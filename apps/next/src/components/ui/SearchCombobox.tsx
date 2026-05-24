'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { Input } from '@/components/ui/Input'

export type SearchComboboxOption = {
  description?: string
  id: string
  label: string
  searchText?: string
}

export function SearchCombobox({
  error,
  inputId,
  label,
  options,
  placeholder,
  value,
  onChange,
}: {
  error?: string
  inputId: string
  label: string
  options: SearchComboboxOption[]
  placeholder?: string
  value: string
  onChange: (optionId: string) => void
}) {
  const hasInlineRequired = label.trim().endsWith('*')
  const labelText = hasInlineRequired ? label.trim().slice(0, -1).trimEnd() : label
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedOption = useMemo(() => options.find((option) => option.id === value) ?? null, [options, value])
  const selectedLabel = selectedOption?.label ?? ''
  const selectedLabelQuery = selectedLabel.trim().toLowerCase()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(selectedLabel)
  const isSelectedValueQuery = Boolean(selectedOption) && query.trim().toLowerCase() === selectedLabelQuery

  useEffect(() => {
    setQuery(selectedLabel)
  }, [selectedLabel])

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const rows = normalizedQuery
      ? isSelectedValueQuery
        ? options
        : options.filter((option) => (option.searchText ?? option.label).toLowerCase().includes(normalizedQuery))
      : options
    return rows.slice(0, 80)
  }, [isSelectedValueQuery, options, query])

  const selectOption = (option: SearchComboboxOption) => {
    onChange(option.id)
    setQuery(option.label)
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className="relative">
      <label className="mb-1 block text-xs" htmlFor={inputId}>{labelText}{hasInlineRequired ? <span className="ml-1 text-red-600">*</span> : null}</label>
      <Input
        ref={inputRef}
        aria-autocomplete="list"
        aria-controls={`${inputId}-options`}
        aria-expanded={open}
        aria-invalid={Boolean(error)}
        className={`h-9 w-full rounded-md border px-2 py-1.5 ${error ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
        id={inputId}
        placeholder={placeholder}
        role="combobox"
        required={hasInlineRequired}
        type="search"
        value={query}
        onClick={() => {
          if (!isSelectedValueQuery) return
          requestAnimationFrame(() => inputRef.current?.select())
        }}
        onBlur={() => {
          window.setTimeout(() => {
            const exactMatch = options.find((option) => option.label.toLowerCase() === query.trim().toLowerCase())
            if (exactMatch) {
              onChange(exactMatch.id)
              setQuery(exactMatch.label)
            } else if (selectedOption) {
              setQuery(selectedOption.label)
            }
            setOpen(false)
          }, 120)
        }}
        onChange={(event) => {
          const nextQuery = event.target.value
          setQuery(nextQuery)
          setOpen(true)
          if (value && nextQuery !== selectedLabel) onChange('')
        }}
        onFocus={() => {
          setOpen(true)
          if (!isSelectedValueQuery) return
          requestAnimationFrame(() => inputRef.current?.select())
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false)
            return
          }
          if (event.key === 'Enter' && open && filteredOptions[0]) {
            event.preventDefault()
            selectOption(filteredOptions[0])
          }
        }}
      />
      {open ? (
        <div id={`${inputId}-options`} className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-xl" role="listbox">
          {filteredOptions.length > 0 ? filteredOptions.map((option) => (
            <button
              key={option.id}
              aria-selected={option.id === value}
              className={`block w-full px-3 py-2 text-left hover:bg-blue-50 ${option.id === value ? 'bg-blue-100 text-blue-800' : ''}`}
              role="option"
              type="button"
              onMouseDown={(event) => {
                event.preventDefault()
                selectOption(option)
              }}
            >
              <span className="block font-medium">{option.label}</span>
              {option.description ? <span className="block text-xs text-slate-500">{option.description}</span> : null}
            </button>
          )) : <div className="px-3 py-2 text-sm text-slate-500">ไม่พบข้อมูลที่ตรงกับคำค้นหา</div>}
        </div>
      ) : null}
    </div>
  )
}
