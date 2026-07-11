'use client'

import { ChevronDown } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export function PageSizeDropdown({
  className,
  options = [10, 25, 50, 100],
  value,
  onChange,
}: {
  className?: string
  options?: number[]
  value: number
  onChange: (value: number) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="จำนวนรายการต่อหน้า" className={`h-9 min-w-[92px] justify-between gap-2 px-3 font-normal ${className ?? ''}`.trim()} size="sm" type="button" variant="outline">
          <span>{value} / หน้า</span>
          <ChevronDown aria-hidden="true" className="size-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[116px]">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option}
            checked={value === option}
            onCheckedChange={() => onChange(option)}
          >
            {option} / หน้า
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
