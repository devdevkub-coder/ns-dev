'use client'

import type { ReactNode } from 'react'
import { ImagePlus } from 'lucide-react'

import { SearchCombobox } from '@/components/ui/SearchCombobox'
import type { OptionItem } from '@/lib/weight-tickets'

type ProductFieldProps = {
  disabled: boolean
  error?: string
  inputId: string
  lineId: string
  options: OptionItem[]
  picker: ReactNode
  placeholder: string
  selectedProduct?: OptionItem
  value: string
  onChange: (value: string) => void
}

type WarehouseFieldProps = {
  disabled: boolean
  error?: string
  inputId: string
  options: OptionItem[]
  placeholder: string
  selectedWarehouse?: {
    availableQty: string
    onHandQty: string
    onHoldQty: string
  }
  selectedWarehouseLabel: string
  value: string
  onChange: (value: string) => void
}

type WeightTicketWtiFormSectionProps = {
  product: ProductFieldProps
}

type WeightTicketWtoFormSectionProps = WeightTicketWtiFormSectionProps & {
  warehouse: WarehouseFieldProps
}

function FieldShell({
  children,
  error,
  label,
}: {
  children: ReactNode
  error?: string
  label: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        <span className="ml-1 text-red-600">*</span>
      </label>
      {children}
      {error ? <div className="mt-1 text-xs text-red-600">{error}</div> : null}
    </div>
  )
}

function ProductField({
  disabled,
  error,
  inputId,
  lineId,
  options,
  picker,
  placeholder,
  selectedProduct,
  value,
  onChange,
}: ProductFieldProps) {
  const selectedProductLabel = options.find((option) => option.id === value)?.label ?? ''

  return (
    <FieldShell error={error} label="สินค้า">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <SearchCombobox
            hideLabel
            key={`${lineId}:${value}:${selectedProductLabel}`}
            disabled={disabled}
            inputId={inputId}
            label="สินค้า*"
            options={options}
            placeholder={placeholder}
            value={value}
            onChange={onChange}
          />
        </div>
        <div className="shrink-0">{picker}</div>
      </div>
      {selectedProduct ? (
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-2 shadow-sm">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded border border-slate-100 bg-slate-100">
            {selectedProduct.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={selectedProduct.name ?? selectedProduct.label}
                className="h-full w-full object-cover"
                src={selectedProduct.imageUrl}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-400">
                <ImagePlus className="h-4 w-4" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {selectedProduct.category || 'ทั่วไป'}
            </div>
            <div className="truncate text-sm font-bold text-slate-900">
              {selectedProduct.name ?? selectedProduct.label}
            </div>
          </div>
          {!disabled ? (
            <button
              className="px-2 py-1 text-sm font-semibold text-rose-600 outline-none transition hover:text-rose-700"
              type="button"
              onClick={() => onChange('')}
            >
              ล้าง
            </button>
          ) : null}
        </div>
      ) : null}
    </FieldShell>
  )
}

function WarehouseField({
  disabled,
  error,
  inputId,
  options,
  placeholder,
  selectedWarehouse,
  selectedWarehouseLabel,
  value,
  onChange,
}: WarehouseFieldProps) {
  return (
    <div className="min-w-0">
      <SearchCombobox
        key={`${inputId}:${value}:${selectedWarehouseLabel}`}
        disabled={disabled}
        error={error}
        inputId={inputId}
        label="คลัง*"
        options={options}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
      {selectedWarehouse ? (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-slate-500">
          <span>คงเหลือ {selectedWarehouse.onHandQty} กก.</span>
          <span>จอง {selectedWarehouse.onHoldQty} กก.</span>
          <span>พร้อมส่ง {selectedWarehouse.availableQty} กก.</span>
        </div>
      ) : null}
    </div>
  )
}

export function WeightTicketWtiFormSection({ product }: WeightTicketWtiFormSectionProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-4">
      <ProductField {...product} />
    </div>
  )
}

export function WeightTicketWtoFormSection({ product, warehouse }: WeightTicketWtoFormSectionProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
      <ProductField {...product} />
      <WarehouseField {...warehouse} />
    </div>
  )
}
