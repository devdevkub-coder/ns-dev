'use client'

import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'

type BranchOption = {
  id: string
  name: string
}

export function BranchSelectCombobox({
  allOptionLabel = 'ทุกสาขา',
  branches,
  className,
  controlSize = 'form',
  disabled = false,
  error,
  errorKey,
  includeAllOption = false,
  inputId,
  label,
  placeholder,
  value,
  widthClassName,
  onChange,
}: {
  allOptionLabel?: string
  branches: BranchOption[]
  className?: string
  controlSize?: 'filter' | 'form'
  disabled?: boolean
  error?: string
  errorKey?: string
  includeAllOption?: boolean
  inputId: string
  label?: string
  placeholder: string
  value: string | null | undefined
  widthClassName?: string
  onChange: (branchId: string | null) => void
}) {
  const safeLabel = label?.trim() ?? ''
  const hasInlineRequired = safeLabel.endsWith('*')
  const labelText = hasInlineRequired ? safeLabel.slice(0, -1).trimEnd() : safeLabel
  const options = includeAllOption
    ? [{ id: '__all__', name: allOptionLabel }, ...branches]
    : branches
  const selectedName = value ? branches.find((branch) => branch.id === value)?.name : includeAllOption ? allOptionLabel : undefined
  const controlHeight = controlSize === 'filter' ? 'h-9' : 'h-10'

  return (
    <div className={`${className ?? ''} ${widthClassName ?? ''}`.trim() || undefined} data-error-key={errorKey} data-manual-required={hasInlineRequired ? 'true' : undefined}>
      {safeLabel ? <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={inputId}>{labelText}{hasInlineRequired ? <span className="ml-1 text-red-600">*</span> : null}</label> : null}
      <div className="relative">
        <Combobox
          disabled={disabled}
          inputId={inputId}
          items={options.map((branch) => branch.name)}
          value={selectedName}
          onValueChange={(branchName) => {
            if (includeAllOption && branchName === allOptionLabel) {
              onChange(null)
              return
            }
            const branch = branches.find((item) => item.name === branchName)
            onChange(branch?.id ?? null)
          }}
        >
          <ComboboxInput
            aria-invalid={Boolean(error)}
            aria-label={safeLabel || placeholder}
            className={error ? `${controlHeight} rounded-md border-red-400 bg-red-50 px-3 py-2 text-sm` : `${controlHeight} rounded-md px-3 py-2 text-sm`}
            inputGroupClassName={error ? `${controlHeight} rounded-md border-red-400 ring-red-100 has-[[data-slot=input-group-control]:focus-visible]:border-red-500 has-[[data-slot=input-group-control]:focus-visible]:ring-red-500/20` : `${controlHeight} rounded-md border-slate-300`}
            placeholder={placeholder}
            readOnly
            required={hasInlineRequired}
            withDropdownButton
          />
          <ComboboxContent>
            <ComboboxEmpty>ไม่พบข้อมูลที่ตรงกับคำค้นหา</ComboboxEmpty>
            <ComboboxList>
              {(branchName) => (
                <ComboboxItem key={String(branchName)} value={String(branchName)}>
                  {String(branchName)}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </div>
  )
}
