'use client'

import type { ReactNode } from 'react'
import { useState, type FocusEvent } from 'react'

import { DatePickerInput } from '@/components/ui/date-picker-input'
import { FormSelectField } from '@/components/ui/FormSelectField'
import { Input } from '@/components/ui/Input'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import { Select } from '@/components/ui/Select'
import { formatDecimalDisplay, formatDecimalDraft, sanitizeDecimalInput } from '@/lib/format'
import { cn } from '@/lib/utils'

type Option = {
  code?: string | null
  id: string
  name: string
  unit?: string | null
}

function optionLabel(option: Option) {
  return option.code ? `${option.code} - ${option.name}` : option.name
}

function productOptionLabel(option: Option) {
  const prefix = option.code ? `${option.code} - ` : ''
  return option.unit ? `${prefix}${option.name} - ${option.unit}` : `${prefix}${option.name}`
}

function searchableOptionText(option: Option) {
  return `${option.code ?? ''} ${option.name} ${option.id}`.toLowerCase()
}

function renderFieldLabel(label: string) {
  const hasInlineRequired = label.trim().endsWith('*')
  const labelText = hasInlineRequired ? label.trim().slice(0, -1).trimEnd() : label
  return <>{labelText}{hasInlineRequired ? <span className="ml-1 text-red-600">*</span> : null}</>
}

export function Field({ children, className, error, label }: { children: ReactNode; className?: string; error?: string; label: string }) {
  return (
    <label className={className}>
      <span className="mb-1 block text-xs font-bold text-slate-700">{renderFieldLabel(label)}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  )
}

export function InputField({
  className,
  error,
  inputClassName,
  label,
  onChange,
  placeholder,
  required = false,
  type = 'text',
  value,
  errorKey,
}: {
  className?: string
  error?: string
  errorKey?: string
  inputClassName?: string
  label: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  type?: string
  value: string
}) {
  return (
    <Field className={className} error={error} label={label}>
      {type === 'date' ? (
        <div data-error-key={errorKey}>
          <DatePickerInput className={cn('w-full', error ? '[&_input]:border-red-400 [&_input]:bg-red-50 [&_input]:text-red-700 [&_[data-slot=\"input-group\"]]:border-red-400' : '', inputClassName)} required={required} value={value} onChange={onChange} />
        </div>
      ) : (
        <Input data-error-key={errorKey} className={cn(error ? 'border-red-400 bg-red-50 text-red-700' : '', inputClassName)} placeholder={placeholder} required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </Field>
  )
}

export function MoneyInputField({
  className,
  disabled = false,
  error,
  errorKey,
  inputClassName,
  label,
  onChange,
  placeholder,
  value,
}: {
  className?: string
  disabled?: boolean
  error?: string
  errorKey?: string
  inputClassName?: string
  label: string
  onChange: (value: number) => void
  placeholder?: string
  value: number
}) {
  const [draftValue, setDraftValue] = useState<string | null>(null)

  return (
    <Field className={className} error={error} label={label}>
      <Input
        data-error-key={errorKey}
        inputMode="decimal"
        className={cn('text-right tabular-nums', error ? 'border-red-400 bg-red-50 text-red-700' : '', inputClassName)}
        disabled={disabled}
        placeholder={placeholder}
        type="text"
        value={draftValue ?? formatDecimalDisplay(value || null, 2)}
        onBlur={(event) => {
          const nextValue = sanitizeDecimalInput(event.target.value, 2)
          if (nextValue.trim() === '' || nextValue.trim() === '.') {
            setDraftValue(null)
            onChange(0)
            return
          }
          const parsed = Number(nextValue)
          setDraftValue(null)
          onChange(Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0)
        }}
        onChange={(event) => {
          const nextValue = sanitizeDecimalInput(event.target.value, 2)
          setDraftValue(nextValue)
          if (nextValue.trim() === '' || nextValue.trim() === '.') {
            onChange(0)
            return
          }
          const parsed = Number(nextValue)
          onChange(Number.isFinite(parsed) ? parsed : 0)
        }}
        onFocus={(event: FocusEvent<HTMLInputElement>) => {
          setDraftValue(value > 0 ? formatDecimalDraft(value, 2) : '')
          requestAnimationFrame(() => {
            const end = event.target.value.length
            event.target.setSelectionRange(end, end)
          })
        }}
      />
    </Field>
  )
}

export function SelectField({
  allowEmpty = true,
  className,
  error,
  hideCode = false,
  label,
  onChange,
  options,
  placeholder = 'เลือก',
  value,
  errorKey,
}: {
  allowEmpty?: boolean
  className?: string
  error?: string
  errorKey?: string
  hideCode?: boolean
  label: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  value: string
}) {
  if (!allowEmpty) {
    return (
      <div data-error-key={errorKey}>
        <FormSelectField
          className={className}
          error={error}
          label={label}
          placeholder={placeholder}
          required
          value={value}
          onChange={onChange}
        >
          {options.map((option) => <option key={option.id} value={option.id}>{!hideCode && option.code ? `${option.code} — ` : ''}{option.name}</option>)}
        </FormSelectField>
      </div>
    )
  }

  return (
    <Field className={className} error={error} label={label}>
      <Select data-error-key={errorKey} className={cn('w-full', value ? 'text-slate-900' : 'text-slate-400', error ? 'border-red-400 bg-red-50 text-red-700' : '')} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option.id} value={option.id}>{!hideCode && option.code ? `${option.code} — ` : ''}{option.name}</option>)}
      </Select>
    </Field>
  )
}

export function SupplierSearchCombobox({
  className = '',
  disabled = false,
  error,
  errorKey,
  options,
  placeholder = 'ค้นหาชื่อหรือรหัสผู้ขาย',
  value,
  onChange,
}: {
  className?: string
  disabled?: boolean
  error?: string
  errorKey?: string
  options: Option[]
  placeholder?: string
  value: string
  onChange: (supplierId: string) => void
}) {
  return (
    <div className={`relative ${className}`}>
      <SearchCombobox
        disabled={disabled}
        error={error}
        errorKey={errorKey}
        inputId="purchase-bill-supplier-search"
        label="ผู้ขาย *"
        options={options.map((supplier) => ({
          id: supplier.id,
          label: optionLabel(supplier),
          searchText: searchableOptionText(supplier),
        }))}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
    </div>
  )
}

export function CustomerSearchCombobox({
  className = '',
  disabled = false,
  error,
  errorKey,
  options,
  placeholder = 'ค้นหารหัสหรือชื่อลูกค้า',
  value,
  onChange,
}: {
  className?: string
  disabled?: boolean
  error?: string
  errorKey?: string
  options: Option[]
  placeholder?: string
  value: string
  onChange: (customerId: string) => void
}) {
  return (
    <div className={`relative ${className}`}>
      <SearchCombobox
        disabled={disabled}
        error={error}
        errorKey={errorKey}
        inputId="sales-bill-customer-search"
        label="ลูกค้า *"
        options={options.map((customer) => ({
          id: customer.id,
          label: optionLabel(customer),
          searchText: searchableOptionText(customer),
        }))}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
    </div>
  )
}

export function ProductSearchCombobox({
  error,
  inputId,
  options,
  value,
  onChange,
  errorKey,
}: {
  error?: string
  errorKey?: string
  inputId: string
  options: Option[]
  value: string
  onChange: (productId: string) => void
}) {
  return (
    <SearchCombobox
      error={error}
      errorKey={errorKey}
      inputId={inputId}
      label="สินค้า *"
      options={options.map((product) => ({
        description: undefined,
        id: product.id,
        label: productOptionLabel(product),
        searchText: searchableOptionText(product),
      }))}
      placeholder="ค้นหารหัสหรือชื่อสินค้า"
      value={value}
      onChange={onChange}
    />
  )
}

export function SummaryLine({ label, tone, value }: { label: string; tone?: 'red'; value: string }) {
  return (
    <div className="flex justify-between border-t border-blue-200 py-1 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={`font-mono ${tone === 'red' ? 'text-red-600' : 'text-slate-800'}`}>{value}</span>
    </div>
  )
}
