'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { Button, type ButtonProps } from '@/components/ui/Button'
import { Input, type InputProps } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

const inputGroupVariants = cva(
  'group/input-group relative flex min-w-0 items-center overflow-hidden rounded-md border border-slate-300 bg-white transition-colors outline-none has-[[data-slot=input-group-control]:focus-visible]:border-blue-500 has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-blue-100 dark:[border-color:var(--ns-dark-border-strong)] dark:[background-color:var(--ns-dark-surface-soft)] dark:has-[[data-slot=input-group-control]:focus-visible]:[border-color:var(--ns-dark-border-strong)] dark:has-[[data-slot=input-group-control]:focus-visible]:ring-0',
  {
    variants: {
      size: {
        default: 'h-10',
        sm: 'h-9',
        xs: 'h-8',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
)

function InputGroup({
  className,
  size,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof inputGroupVariants>) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(inputGroupVariants({ className, size }))}
      {...props}
    />
  )
}

function InputGroupInput({ className, ...props }: InputProps) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(
        'h-full w-full flex-1 rounded-none border-0 bg-transparent pr-8 shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent',
        className,
      )}
      {...props}
    />
  )
}

function InputGroupAddon({
  align = 'inline-end',
  className,
  ...props
}: React.ComponentProps<'div'> & { align?: 'inline-end' | 'inline-start' | 'block-end' | 'block-start' }) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      role="group"
      className={cn(
        'pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center justify-center gap-2 py-1 text-sm font-medium text-slate-400 select-none',
        align === 'inline-end' ? 'right-1.5' : undefined,
        align === 'inline-start' ? 'left-1.5 order-first pl-1.5' : undefined,
        className,
      )}
      {...props}
    />
  )
}

function InputGroupButton({
  className,
  size = 'icon',
  variant = 'ghost',
  ...props
}: ButtonProps) {
  return (
    <Button
      data-slot="input-group-button"
      className={cn('pointer-events-auto rounded-sm border-0 p-0 shadow-none hover:bg-transparent hover:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-100 dark:focus-visible:ring-0', className)}
      size={size}
      variant={variant}
      {...props}
    />
  )
}

export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput }
