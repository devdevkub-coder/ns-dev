'use client'

type ActiveToggleProps = {
  checked: boolean
  disabled?: boolean
  label?: string | null
  labelClassName?: string
  onChange: (checked: boolean) => void
}

export function ActiveToggle({ checked, disabled = false, label, labelClassName = 'text-sm font-medium text-slate-600', onChange }: ActiveToggleProps) {
  const displayLabel = label !== undefined ? label : (checked ? 'ใช้งาน' : 'ปิด')

  return (
    <div className="inline-flex items-center gap-2">
      <button
        aria-checked={checked}
        className={`peer group/switch relative inline-flex h-[18.4px] w-8 shrink-0 items-center rounded-full border border-transparent outline-none transition-all after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-emerald-500 focus-visible:ring-3 focus-visible:ring-emerald-100 ${
          checked ? 'bg-emerald-600' : 'bg-slate-300'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
        disabled={disabled}
        role="switch"
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onChange(!checked)
        }}
      >
        <span
          className={`pointer-events-none block size-4 rounded-full bg-white ring-0 transition-transform ${
            checked ? 'translate-x-[14px]' : 'translate-x-0'
          }`}
        />
      </button>
      {displayLabel ? <span className={labelClassName}>{displayLabel}</span> : null}
    </div>
  )
}
