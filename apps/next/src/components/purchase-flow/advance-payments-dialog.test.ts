import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const source = readFileSync(fileURLToPath(new URL('./AdvancePaymentsPageClient.tsx', import.meta.url)), 'utf8')

describe('advance payment dialog actions', () => {
  it('keeps the create dialog close button visible on the light header', () => {
    expect(source).toContain('h-9 border-rose-600 bg-rose-600 font-normal text-white')
    expect(source).toContain('hover:border-rose-700 hover:bg-rose-700 hover:text-white')
    expect(source).not.toContain('bg-white/10 text-white hover:bg-white/20 hover:text-white')
  })
})
