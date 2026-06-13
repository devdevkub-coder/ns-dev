'use client'

import * as React from 'react'
import { sanitizePhoneInput } from '@/lib/format'
import { cn } from '@/lib/utils'

type PhoneInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'inputMode' | 'onChange' | 'type' | 'value'> & {
  error?: boolean
  onChange: (value: string) => void
  value?: string | null
}

export function PhoneInput({
  className,
  error = false,
  onChange,
  placeholder,
  value,
  ...props
}: PhoneInputProps) {
  return (
    <div className={cn('relative w-full', className)}>
      <input
        {...props}
        className={cn(
          'w-full h-10 rounded-md border px-3 py-2 text-sm outline-none transition-all duration-150 focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
          props.disabled || props.readOnly
            ? 'bg-slate-50 text-slate-500 border-slate-200'
            : 'bg-white text-slate-800 border-slate-300 hover:border-slate-400',
          error ? 'border-red-400 bg-red-50/50' : undefined,
        )}
        inputMode="tel"
        placeholder={placeholder ?? 'เช่น 0812345678'}
        type="tel"
        value={value ?? ''}
        onChange={(event) => {
          onChange(sanitizePhoneInput(event.target.value))
        }}
      />
    </div>
  )
}
