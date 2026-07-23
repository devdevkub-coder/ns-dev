'use client'

import * as React from 'react'
import { Check, Circle, CircleX, Eye, FileText, MoreHorizontal, Pencil, Printer, RotateCcw, Send, Share2, Trash2, type LucideIcon } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/Button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type TableActionButtonProps = Omit<ButtonProps, 'children'> & {
  busy?: boolean
  children?: React.ReactNode
  label?: string
  menu?: React.ReactNode
  mobileLabel?: boolean
}

export const tableActionButtonClassName =
  'h-12 rounded-xl border border-slate-300/90 bg-white px-4 text-base font-semibold text-slate-700 shadow-[0_2px_8px_rgba(15,23,42,0.08)] hover:bg-slate-50 hover:text-slate-900'

const tableActionTriggerClassName =
  'h-9 w-9 rounded-md border-0 bg-transparent p-0 text-slate-600 shadow-none hover:bg-transparent hover:text-slate-900'

const mobileTableActionTriggerClassName =
  'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-none hover:bg-slate-50 hover:text-slate-900'

export const TableActionButton = React.forwardRef<HTMLButtonElement, TableActionButtonProps>(function TableActionButton(
  {
    'aria-label': ariaLabel,
    busy = false,
    children,
    className,
    label = 'จัดการ',
    menu,
    mobileLabel = false,
    title,
    type = 'button',
    variant = 'ghost',
    ...props
  },
  ref,
) {
  const trigger = (
    <Button
      aria-busy={busy || undefined}
      aria-label={ariaLabel ?? (busy ? 'กำลังทำ...' : label)}
      className={cn(mobileLabel ? mobileTableActionTriggerClassName : tableActionTriggerClassName, className)}
      ref={ref}
      size={undefined}
      title={title ?? label}
      type={type}
      variant={variant}
      {...props}
    >
      {mobileLabel ? label : <MoreHorizontal aria-hidden="true" className="size-5 shrink-0" />}
    </Button>
  )
  if (!menu) return trigger
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-56 w-[var(--radix-dropdown-menu-trigger-width)]"
        onClick={(event) => event.stopPropagation()}
      >
        {menu}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

export const TableActionMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuItem>
>(function TableActionMenuItem({ children, className, ...props }, ref) {
  const text = typeof children === 'string' ? children : ''
  const isCancel = text.includes('ยกเลิก') || text.includes('ลบ')
  const normalizedText = text.toLowerCase()
  let Icon: LucideIcon = Circle
  if (text.includes('ลบ')) Icon = Trash2
  else if (text.includes('ยกเลิก') || text.includes('ปิด')) Icon = CircleX
  else if (text.includes('แก้ไข')) Icon = Pencil
  else if (text.includes('พิมพ์')) Icon = Printer
  else if (text.includes('แชร์')) Icon = Share2
  else if (text.includes('ส่ง')) Icon = Send
  else if (text.includes('ย้อนกลับ') || text.includes('คืน') || normalizedText.includes('reverse')) Icon = RotateCcw
  else if (text.includes('รายละเอียด')) Icon = Eye
  else if (text.includes('เปิด')) Icon = FileText
  else if (text.includes('บันทึก') || text.includes('ยืนยัน') || text.includes('รับเงิน') || text.includes('ทำจ่าย')) Icon = Check

  return (
    <DropdownMenuItem
      className={cn(
        'grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)_1rem] items-center gap-2 rounded-none border-b border-slate-200/80 px-2 py-1.5 text-sm font-normal last:border-b-0 first:rounded-t-sm last:rounded-b-sm dark:border-slate-700/80',
        isCancel ? 'text-red-600 focus:bg-red-50 focus:text-red-700' : 'text-slate-700 focus:text-slate-950',
        className,
      )}
      ref={ref}
      {...props}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 text-center">{children}</span>
      <span aria-hidden="true" className="size-4" />
    </DropdownMenuItem>
  )
})
