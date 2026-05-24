'use client'

import * as React from 'react'
import { format, parse } from 'date-fns'
import { CalendarIcon } from 'lucide-react'

import { Calendar } from '@/components/ui/calendar'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

function formatDate(date: Date | undefined) {
  if (!date) return ''
  return format(date, 'yyyy-MM-dd')
}

function formatDisplayDate(date: Date | undefined) {
  if (!date) return ''
  return format(date, 'dd/MM/yyyy')
}

function parseDate(value: string) {
  if (!value.trim()) return undefined

  const trimmed = value.trim()
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? parse(trimmed, 'yyyy-MM-dd', new Date())
    : parse(trimmed, 'dd/MM/yyyy', new Date())

  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export function DatePickerInput({
  ariaLabel,
  className,
  disabled = false,
  id,
  placeholder = '24/05/2026',
  readOnly = false,
  required = false,
  showClearButton = true,
  showTodayButton = true,
  title,
  value,
  onChange,
}: {
  ariaLabel?: string
  className?: string
  disabled?: boolean
  id?: string
  placeholder?: string
  readOnly?: boolean
  required?: boolean
  showClearButton?: boolean
  showTodayButton?: boolean
  title?: string
  value: string
  onChange: (value: string) => void
}) {
  const generatedId = React.useId()
  const resolvedId = id ?? generatedId
  const [open, setOpen] = React.useState(false)
  const selectedDate = React.useMemo(() => parseDate(value), [value])
  const [month, setMonth] = React.useState<Date | undefined>(selectedDate)
  const [inputValue, setInputValue] = React.useState(formatDisplayDate(selectedDate))

  React.useEffect(() => {
    const nextDate = parseDate(value)
    setInputValue(formatDisplayDate(nextDate))
    if (nextDate) setMonth(nextDate)
  }, [value])

  return (
    <InputGroup className={className ?? 'w-[130px]'}>
      <InputGroupInput
        aria-label={ariaLabel}
        disabled={disabled}
        id={resolvedId}
        placeholder={placeholder}
        readOnly={readOnly}
        required={required}
        title={title}
        value={inputValue}
        onBlur={() => {
          if (readOnly) return

          const nextDate = parseDate(inputValue)
          if (nextDate) {
            setInputValue(formatDisplayDate(nextDate))
            onChange(formatDate(nextDate))
            return
          }

          if (!inputValue.trim()) {
            onChange('')
            return
          }

          setInputValue(formatDisplayDate(parseDate(value)))
        }}
        onChange={(event) => {
          if (readOnly) return

          const nextValue = event.target.value
          setInputValue(nextValue)
          const nextDate = parseDate(nextValue)
          if (nextDate) {
            setMonth(nextDate)
            onChange(formatDate(nextDate))
            return
          }
          if (!nextValue.trim()) onChange('')
        }}
        onKeyDown={(event) => {
          if (readOnly || disabled) return
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      />
      <InputGroupAddon align="inline-end">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <InputGroupButton aria-label="เลือกวันที่" disabled={disabled} size="icon" type="button" variant="ghost">
              <CalendarIcon className="h-4 w-4" />
              <span className="sr-only">Select date</span>
            </InputGroupButton>
          </PopoverTrigger>
          <PopoverContent align="end" alignOffset={-8} className="w-auto overflow-hidden p-0" sideOffset={10}>
            <Calendar
              mode="single"
              month={month}
              selected={selectedDate}
              onMonthChange={setMonth}
              onSelect={(date) => {
                const nextValue = formatDate(date)
                setInputValue(formatDisplayDate(date))
                onChange(nextValue)
                setOpen(false)
              }}
            />
            {showTodayButton || showClearButton ? (
              <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2">
                {showClearButton ? (
                  <button
                    className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    disabled={disabled || readOnly}
                    type="button"
                    onClick={() => {
                      setInputValue('')
                      onChange('')
                      setOpen(false)
                    }}
                  >
                    Clear
                  </button>
                ) : <span />}
                {showTodayButton ? (
                  <button
                    className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    disabled={disabled || readOnly}
                    type="button"
                    onClick={() => {
                      const today = new Date()
                      setInputValue(formatDisplayDate(today))
                      setMonth(today)
                      onChange(formatDate(today))
                      setOpen(false)
                    }}
                  >
                    Today
                  </button>
                ) : null}
              </div>
            ) : null}
          </PopoverContent>
        </Popover>
      </InputGroupAddon>
    </InputGroup>
  )
}
