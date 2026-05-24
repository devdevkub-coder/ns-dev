'use client'

import type { ReactNode } from 'react'

import { DatePickerInput } from '@/components/ui/date-picker-input'
import { FormSelectField } from '@/components/ui/FormSelectField'
import { Input } from '@/components/ui/Input'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import { Select } from '@/components/ui/Select'

type Option = {
  code?: string | null
  id: string
  name: string
  unit?: string | null
}

function optionLabel(option: Option) {
  return option.code ? `${option.code} - ${option.name}` : option.name
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
  type = 'text',
  value,
}: {
  className?: string
  error?: string
  inputClassName?: string
  label: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  value: string
}) {
  return (
    <Field className={className} error={error} label={label}>
      {type === 'date' ? (
        <DatePickerInput className={inputClassName ?? 'w-full'} value={value} onChange={onChange} />
      ) : (
        <Input className={inputClassName} placeholder={placeholder} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
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
}: {
  allowEmpty?: boolean
  className?: string
  error?: string
  hideCode?: boolean
  label: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  value: string
}) {
  if (!allowEmpty) {
    return (
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
    )
  }

  return (
    <Field className={className} error={error} label={label}>
      <Select className="w-full" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option.id} value={option.id}>{!hideCode && option.code ? `${option.code} — ` : ''}{option.name}</option>)}
      </Select>
    </Field>
  )
}

export function SupplierSearchCombobox({
  className = '',
  error,
  options,
  value,
  onChange,
}: {
  className?: string
  error?: string
  options: Option[]
  value: string
  onChange: (supplierId: string) => void
}) {
  return (
    <div className={`relative ${className}`}>
      <SearchCombobox
        error={error}
        inputId="purchase-bill-supplier-search"
        label="ผู้ขาย *"
        options={options.map((supplier) => ({
          description: `${supplier.code ? `${supplier.code} · ` : ''}${supplier.id}`,
          id: supplier.id,
          label: optionLabel(supplier),
          searchText: searchableOptionText(supplier),
        }))}
        placeholder="ค้นหาชื่อหรือรหัสผู้ขาย"
        value={value}
        onChange={onChange}
      />
    </div>
  )
}

export function ProductSearchCombobox({
  inputId,
  options,
  value,
  onChange,
}: {
  inputId: string
  options: Option[]
  value: string
  onChange: (productId: string) => void
}) {
  return (
    <SearchCombobox
      inputId={inputId}
      label="สินค้า *"
      options={options.map((product) => ({
        description: product.unit ? `(${product.unit})` : undefined,
        id: product.id,
        label: optionLabel(product),
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
