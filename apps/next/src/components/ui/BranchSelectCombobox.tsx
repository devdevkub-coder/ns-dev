'use client'

import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'

type BranchOption = {
  id: string
  name: string
}

export function BranchSelectCombobox({
  branches,
  className,
  error,
  inputId,
  label,
  placeholder,
  value,
  widthClassName,
  onChange,
}: {
  branches: BranchOption[]
  className?: string
  error?: string
  inputId: string
  label: string
  placeholder: string
  value: string | null | undefined
  widthClassName?: string
  onChange: (branchId: string | null) => void
}) {
  const hasInlineRequired = label.trim().endsWith('*')
  const labelText = hasInlineRequired ? label.trim().slice(0, -1).trimEnd() : label

  return (
    <div className={`${className ?? ''} ${widthClassName ?? ''}`.trim() || undefined}>
      <label className="mb-1 block text-xs" htmlFor={inputId}>{labelText}{hasInlineRequired ? <span className="ml-1 text-red-600">*</span> : null}</label>
      <div className="relative">
        <Combobox
          inputId={inputId}
          items={branches.map((branch) => branch.name)}
          value={branches.find((branch) => branch.id === value)?.name}
          onValueChange={(branchName) => {
            const branch = branches.find((item) => item.name === branchName)
            onChange(branch?.id ?? null)
          }}
        >
          <ComboboxInput
            className={error ? 'h-9 rounded-md border-red-400 bg-red-50 px-2.5 py-1.5 text-sm' : 'h-9 rounded-md px-2.5 py-1.5 text-sm'}
            inputGroupClassName={error ? 'h-9 rounded-md border-red-400 ring-red-100' : 'h-9 rounded-md border-slate-300'}
            placeholder={placeholder}
            readOnly
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
