'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { Select as SelectPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

const EMPTY_OPTION_VALUE = '__ns_empty_option__'

type SelectOption = {
  disabled: boolean
  hidden: boolean
  label: React.ReactNode
  textValue: string
  value: string
}

type SelectGroup = {
  label?: React.ReactNode
  options: SelectOption[]
}

type SelectValue = React.SelectHTMLAttributes<HTMLSelectElement>['value']

export type SelectValueChangeEvent = {
  currentTarget: { name: string; value: string }
  target: { name: string; value: string }
}

export type SelectProps = Omit<
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>,
  'children' | 'defaultValue' | 'form' | 'name' | 'onBlur' | 'onChange' | 'onFocus' | 'required' | 'value'
> & {
  children?: React.ReactNode
  defaultValue?: SelectValue
  form?: string
  name?: string
  onBlur?: React.FocusEventHandler<HTMLButtonElement>
  onChange?: (event: SelectValueChangeEvent) => void
  onFocus?: React.FocusEventHandler<HTMLButtonElement>
  required?: boolean
  value?: SelectValue
}

function optionText(value: React.ReactNode): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(optionText).join('')
  return ''
}

function normalizeValue(value: SelectValue): string {
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : ''
  return value === undefined || value === null ? '' : String(value)
}

function normalizeOptions(children: React.ReactNode): SelectGroup[] {
  const groups: SelectGroup[] = []
  let looseOptions: SelectOption[] = []

  const pushLooseOptions = () => {
    if (looseOptions.length === 0) return
    groups.push({ options: looseOptions })
    looseOptions = []
  }

  const readOptions = (nodes: React.ReactNode, target: SelectOption[]) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) return
      if (child.type === React.Fragment) {
        readOptions((child as React.ReactElement<{ children?: React.ReactNode }>).props.children, target)
        return
      }
      if (child.type !== 'option') return

      const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement>
      const label = props.label ?? props.children
      target.push({
        disabled: Boolean(props.disabled),
        hidden: Boolean(props.hidden),
        label,
        textValue: optionText(label),
        value: props.value === undefined ? optionText(label) : String(props.value),
      })
    })
  }

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    if (child.type === React.Fragment) {
      readOptions((child as React.ReactElement<{ children?: React.ReactNode }>).props.children, looseOptions)
      return
    }
    if (child.type === 'optgroup') {
      pushLooseOptions()
      const props = child.props as React.OptgroupHTMLAttributes<HTMLOptGroupElement>
      const options: SelectOption[] = []
      readOptions(props.children, options)
      groups.push({ label: props.label, options })
      return
    }
    readOptions(child, looseOptions)
  })
  pushLooseOptions()
  return groups
}

function changeEvent(value: string, name?: string): SelectValueChangeEvent {
  const target = { name: name ?? '', value }
  return { currentTarget: target, target }
}

export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      'aria-invalid': ariaInvalid,
      children,
      className,
      defaultValue,
      disabled,
      form,
      name,
      onBlur,
      onChange,
      onFocus,
      required,
      value,
      ...triggerProps
    },
    ref,
  ) => {
    const triggerRef = React.useRef<HTMLButtonElement | null>(null)
    const groups = React.useMemo(() => normalizeOptions(children), [children])
    const options = React.useMemo(() => groups.flatMap((group) => group.options), [groups])
    const emptyOption = options.find((option) => option.value === '')
    const hasEmptyOption = Boolean(emptyOption)
    const selectableEmptyOption = Boolean(emptyOption && !emptyOption.disabled && !emptyOption.hidden)
    const firstSelectableOption = options.find((option) => !option.disabled && !option.hidden)
    const controlled = value !== undefined
    const initialUncontrolledValue = defaultValue !== undefined
      ? normalizeValue(defaultValue)
      : hasEmptyOption
        ? ''
        : firstSelectableOption?.value ?? ''
    const [uncontrolledValue, setUncontrolledValue] = React.useState(initialUncontrolledValue)
    const hasInitializedOptions = React.useRef(
      defaultValue !== undefined || hasEmptyOption || Boolean(firstSelectableOption),
    )
    const selectedValue = controlled ? normalizeValue(value) : uncontrolledValue
    const selectedOption = options.find((option) => option.value === selectedValue)
    const radixValue = selectedValue === '' && selectableEmptyOption ? EMPTY_OPTION_VALUE : selectedValue
    const placeholder = emptyOption?.label ?? ''

    React.useEffect(() => {
      if (controlled || hasInitializedOptions.current) return
      if (hasEmptyOption) {
        hasInitializedOptions.current = true
        return
      }
      if (!firstSelectableOption) return
      hasInitializedOptions.current = true
      setUncontrolledValue(firstSelectableOption.value)
    }, [controlled, firstSelectableOption, hasEmptyOption])

    React.useEffect(() => {
      if (controlled) return
      const formElement = triggerRef.current?.form
      if (!formElement) return
      const resetValue = () => {
        const nextValue = defaultValue !== undefined
          ? normalizeValue(defaultValue)
          : hasEmptyOption
            ? ''
            : firstSelectableOption?.value ?? ''
        hasInitializedOptions.current = defaultValue !== undefined || hasEmptyOption || Boolean(firstSelectableOption)
        setUncontrolledValue(nextValue)
      }
      formElement.addEventListener('reset', resetValue)
      return () => formElement.removeEventListener('reset', resetValue)
    }, [controlled, defaultValue, firstSelectableOption, hasEmptyOption])

    const handleValueChange = (nextValue: string) => {
      const decodedValue = nextValue === EMPTY_OPTION_VALUE ? '' : nextValue
      if (!controlled) setUncontrolledValue(decodedValue)
      onChange?.(changeEvent(decodedValue, name))
    }

    return (
      <>
        <SelectPrimitive.Root
          disabled={disabled}
          required={required}
          value={radixValue}
          onValueChange={handleValueChange}
        >
          <SelectPrimitive.Trigger
            {...triggerProps}
            ref={(node) => {
              triggerRef.current = node
              if (typeof ref === 'function') ref(node)
              else if (ref) ref.current = node
            }}
            aria-invalid={ariaInvalid}
            className={cn(
              'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-base text-slate-800 transition-colors focus-visible:!border-[#737373] focus-visible:outline-none focus-visible:!ring-[3px] focus-visible:!ring-neutral-500/20 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm dark:[border-color:var(--ns-dark-border-strong)] dark:[background-color:var(--ns-dark-surface-soft)] dark:text-slate-100',
              ariaInvalid ? 'border-red-400 bg-red-50 text-red-700 focus-visible:!border-red-500 focus-visible:!ring-red-500/20 dark:border-red-500 dark:bg-red-950/20' : null,
              className,
            )}
            form={form}
            onBlur={onBlur}
            onFocus={onFocus}
          >
            <SelectPrimitive.Value
              className={cn('min-w-0 flex-1 truncate', selectedValue === '' ? 'text-slate-400 dark:text-slate-400' : null)}
              placeholder={placeholder}
            >
              {selectedOption?.label}
            </SelectPrimitive.Value>
            <SelectPrimitive.Icon asChild>
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>

          <SelectPrimitive.Portal>
            <SelectPrimitive.Content
              className="z-[80] max-h-64 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-slate-200 bg-white text-slate-900 shadow-xl dark:[border-color:var(--ns-dark-border-strong)] dark:[background-color:var(--ns-dropdown-surface)] dark:text-slate-100"
              position="popper"
              sideOffset={4}
            >
              <SelectPrimitive.Viewport className="max-h-64 p-1">
                {groups.map((group, groupIndex) => {
                  const visibleOptions = group.options.filter((option) => !option.hidden)
                  if (visibleOptions.length === 0) return null
                  return (
                    <SelectPrimitive.Group key={`${optionText(group.label)}-${groupIndex}`}>
                      {group.label ? (
                        <SelectPrimitive.Label className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                          {group.label}
                        </SelectPrimitive.Label>
                      ) : null}
                      {visibleOptions.map((option, optionIndex) => (
                        <SelectPrimitive.Item
                          key={`${option.value}-${optionIndex}`}
                          className="relative flex w-full cursor-default select-none items-center rounded-sm px-3 py-2 text-sm text-slate-800 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-slate-100 data-[state=checked]:bg-slate-100 dark:text-slate-100 dark:data-[highlighted]:[background-color:var(--ns-dropdown-selected)] dark:data-[state=checked]:[background-color:var(--ns-dropdown-selected)]"
                          disabled={option.disabled}
                          textValue={option.textValue}
                          value={option.value === '' ? EMPTY_OPTION_VALUE : option.value}
                        >
                          <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                        </SelectPrimitive.Item>
                      ))}
                    </SelectPrimitive.Group>
                  )
                })}
              </SelectPrimitive.Viewport>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
        {name ? <input readOnly disabled={disabled} form={form} name={name} type="hidden" value={selectedValue} /> : null}
      </>
    )
  },
)
Select.displayName = 'Select'
