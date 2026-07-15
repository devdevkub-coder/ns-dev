'use client'

import { ChevronDown } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export function PageSizeDropdown({
  className,
  disabled = false,
  options = [10, 25, 50, 100],
  value,
  onChange,
}: {
  className?: string
  disabled?: boolean
  options?: readonly number[]
  value: number
  onChange: (value: number) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="จำนวนรายการต่อหน้า" className={`h-9 min-w-[92px] justify-between gap-2 px-3 font-normal focus-visible:ring-slate-400 focus-visible:ring-offset-0 ${className ?? ''}`.trim()} disabled={disabled} size="sm" type="button" variant="outline">
          <span>{value} / หน้า</span>
          <ChevronDown aria-hidden="true" className="size-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[116px]">
        {options.map((option) => (
          <DropdownMenuItem
            data-page-size-option=""
            key={option}
            onSelect={() => onChange(option)}
          >
            {option} / หน้า
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
