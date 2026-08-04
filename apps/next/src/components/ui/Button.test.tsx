import { describe, expect, it } from 'vitest'

import { buttonVariants } from './Button'

describe('Button focus style', () => {
  it('uses the shared blue focus ring while preserving every variant and size token', () => {
    const defaultButton = buttonVariants()

    expect(defaultButton).toContain('focus-visible:ring-blue-500')
    expect(defaultButton).not.toContain('focus-visible:ring-emerald-500')

    for (const [variant, expectedToken] of [
      ['default', 'bg-blue-600'],
      ['secondary', 'bg-slate-100'],
      ['outline', 'border-slate-300'],
      ['export', 'bg-emerald-600'],
      ['ghost', 'text-slate-700'],
    ] as const) {
      expect(buttonVariants({ variant })).toContain(expectedToken)
    }

    expect(buttonVariants({ size: 'xs' })).toContain('h-8')
    expect(buttonVariants({ size: 'icon' })).toContain('h-9 w-9')
  })
})
