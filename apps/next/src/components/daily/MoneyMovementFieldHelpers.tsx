'use client'

import { DatePickerInput } from '@/components/ui/date-picker-input'
import { FormSelectField } from '@/components/ui/FormSelectField'
import { Input as UiInput } from '@/components/ui/Input'
import { Select as UiSelect } from '@/components/ui/Select'
import { formatMoney } from '@/lib/daily'

type Bill = {
  customerId?: string | null
  docNo: string
  id: string
  payableBalance?: number
  receivableBalance?: number
  supplierId?: string | null
}

function renderFieldLabel(label: string) {
  const hasInlineRequired = label.trim().endsWith('*')
  const labelText = hasInlineRequired ? label.trim().slice(0, -1).trimEnd() : label
  return <>{labelText}{hasInlineRequired ? <span className="ml-1 text-red-600">*</span> : null}</>
}

export function BillSelect(props: {
  bills: Bill[]
  label: string
  mode: 'payment' | 'receipt'
  onChange: (value: string) => void
  partyMap: Map<string, string>
  required?: boolean
  value: string
}) {
  const placeholder = props.required ? 'เลือกบิล' : 'ไม่ระบุ'

  if (props.required) {
    return (
      <FormSelectField
        label={props.label}
        placeholder={placeholder}
        required
        value={props.value}
        onChange={props.onChange}
      >
        {props.bills.map((bill) => {
          const partyId = props.mode === 'payment' ? bill.supplierId ?? '' : bill.customerId ?? ''
          const balance = props.mode === 'payment' ? bill.payableBalance ?? 0 : bill.receivableBalance ?? 0
          return <option key={bill.id} value={bill.id}>{bill.docNo} · {(props.partyMap.get(partyId) ?? partyId) || '-'} · {formatMoney(balance)}</option>
        })}
      </FormSelectField>
    )
  }

  return (
    <label className="block text-sm font-medium">
      {props.label ? <span>{renderFieldLabel(props.label)}{props.required && !props.label.trim().endsWith('*') ? <span className="text-red-600"> *</span> : null}</span> : null}
      <UiSelect className={`${props.label ? 'mt-1.5' : ''} w-full`} required={props.required} value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {props.bills.map((bill) => {
          const partyId = props.mode === 'payment' ? bill.supplierId ?? '' : bill.customerId ?? ''
          const balance = props.mode === 'payment' ? bill.payableBalance ?? 0 : bill.receivableBalance ?? 0
          return <option key={bill.id} value={bill.id}>{bill.docNo} · {(props.partyMap.get(partyId) ?? partyId) || '-'} · {formatMoney(balance)}</option>
        })}
      </UiSelect>
    </label>
  )
}

export function Field(props: { label: string; onChange: (value: string) => void; readOnly?: boolean; type?: string; value: string }) {
  const required = props.label.trim().endsWith('*')
  return <label className="block text-sm font-medium" data-manual-required={required && !props.readOnly ? 'true' : undefined}>{renderFieldLabel(props.label)}{props.type === 'date' ? <DatePickerInput className="mt-1.5 w-full" readOnly={props.readOnly} required={required} value={props.value} onChange={props.onChange} /> : <UiInput className="mt-1.5 w-full" readOnly={props.readOnly} required={required} type={props.type ?? 'text'} value={props.value} onChange={(event) => props.onChange(event.target.value)} />}</label>
}

export function SelectField(props: { allowEmpty?: boolean; label: string; onChange: (value: string) => void; options: Array<{ id: string; name: string }>; placeholder?: string; required?: boolean; value: string }) {
  const allowEmpty = props.allowEmpty ?? true

  if (!allowEmpty) {
    return (
      <FormSelectField
        label={props.label}
        placeholder={props.placeholder ?? 'เลือกข้อมูล'}
        required={props.required ?? true}
        value={props.value}
        onChange={props.onChange}
      >
        {props.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </FormSelectField>
    )
  }

  return (
    <label className="block text-sm font-medium">
      {renderFieldLabel(props.label)}{props.required && !props.label.trim().endsWith('*') ? <span className="text-red-600"> *</span> : null}
      <UiSelect className="mt-1.5 w-full" required={props.required ?? !allowEmpty} value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option value="">ไม่ระบุ</option>
        {props.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </UiSelect>
    </label>
  )
}

export function SummaryPill({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-slate-200 bg-white px-3 py-2"><div className="text-xs text-slate-500">{label}</div><div className="font-bold text-slate-900">{value}</div></div>
}
