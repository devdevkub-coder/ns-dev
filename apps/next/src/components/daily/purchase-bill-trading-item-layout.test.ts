import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(
  fileURLToPath(new URL('./TransactionBillsPageClient.tsx', import.meta.url)),
  'utf8',
).replaceAll('\r\n', '\n')

describe('purchase bill Trading item layout', () => {
  it('keeps every Trading item in one responsive row', () => {
    expect(pageSource).toContain('data-testid={`purchase-bill-trading-item-${index}`}')
    expect(pageSource).toContain('lg:min-w-[1180px] lg:table lg:table-fixed')
    expect(pageSource).toContain('grid grid-cols-2 gap-2')
    expect(pageSource).not.toContain('rowSpan={2}')
  })
})
