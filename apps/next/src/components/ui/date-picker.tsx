'use client'

import * as React from 'react'
import { CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'

import { Button } from '@/components/ui/Button'
import { Calendar } from '@/components/ui/calendar'
import { Field, FieldLabel } from '@/components/ui/field'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export function DatePicker({
  className,
  fieldClassName,
  id,
  label,
  placeholder = 'Pick a date',
  showClearButton = true,
  showTodayButton = true,
  value,
  onChange,
}: {
  className?: string
  fieldClassName?: string
  id: string
  label?: string
  placeholder?: string
  showClearButton?: boolean
  showTodayButton?: boolean
  value?: Date
  onChange: (date: Date | undefined) => void
}) {
  const [open, setOpen] = React.useState(false)

  const trigger = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          data-empty={!value}
          className={cn(
            'justify-start text-left font-normal data-[empty=true]:text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4" />
          {value ? format(value, 'PPP') : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[20rem] max-w-[calc(100vw_-_1rem)] p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            onChange(date)
            setOpen(false)
          }}
          defaultMonth={value}
        />
        {showTodayButton || showClearButton ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2">
            {showClearButton ? (
              <Button
                size="xs"
                type="button"
                variant="ghost"
                onClick={() => {
                  onChange(undefined)
                  setOpen(false)
                }}
              >
                Clear
              </Button>
            ) : <span />}
            {showTodayButton ? (
              <Button
                size="xs"
                type="button"
                variant="ghost"
                onClick={() => {
                  onChange(new Date())
                  setOpen(false)
                }}
              >
                Today
              </Button>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )

  if (!label) return trigger

  return (
    <Field className={fieldClassName}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {trigger}
    </Field>
  )
}
