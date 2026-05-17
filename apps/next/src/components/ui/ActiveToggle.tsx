'use client'

type ActiveToggleProps = {
  checked: boolean
  label?: string
  onChange: (checked: boolean) => void
}

export function ActiveToggle({ checked, label = 'ใช้งาน', onChange }: ActiveToggleProps) {
  return (
    <button
      aria-checked={checked}
      className="inline-flex items-center gap-2 rounded-full px-1 py-1 text-sm text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
      role="switch"
      type="button"
      onClick={() => onChange(!checked)}
    >
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors ${
          checked ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-slate-200'
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </span>
      <span className="font-medium">{label}</span>
    </button>
  )
}
