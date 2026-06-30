'use client'

import * as React from 'react'
import { Select } from '@/components/ui/Select'

type FormSelectFieldProps = {
  children: React.ReactNode
  className?: string
  disabled?: boolean
  error?: string
  hidePlaceholderWhenSelected?: boolean
  label: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  value: string
}

export function FormSelectField({
  children,
  className = '',
  disabled = false,
  error,
  hidePlaceholderWhenSelected = true,
  label,
  onChange,
  placeholder,
  required = false,
  value,
}: FormSelectFieldProps) {
  const hasInlineRequired = label.trim().endsWith('*')
  const labelText = hasInlineRequired ? label.trim().slice(0, -1).trimEnd() : label

  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
        {labelText}{required || hasInlineRequired ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      <Select
        className={`w-full h-10 rounded-md border text-sm outline-none transition-all duration-150 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${disabled ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-white text-slate-800 border-slate-300 hover:border-slate-400 dark:hover:[border-color:var(--ns-dark-border-strong)]'} ${error ? 'border-red-400 bg-red-50/50' : ''}`}
        disabled={disabled}
        required={required || hasInlineRequired}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {placeholder ? <option disabled={required || hasInlineRequired} hidden={hidePlaceholderWhenSelected} value="">{placeholder}</option> : null}
        {children}
      </Select>
      {error ? <span className="mt-1 block text-xs text-red-700">{error}</span> : null}
    </label>
  )
}
