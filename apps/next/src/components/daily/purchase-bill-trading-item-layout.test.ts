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
    expect(pageSource).toContain('mx-auto my-4 flex max-h-[94vh] w-full max-w-[1480px] flex-col')
    expect(pageSource).toContain('flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4 text-sm sm:p-5')
    expect(pageSource).toContain('lg:min-w-[1200px] lg:table lg:table-fixed')
    expect(pageSource).toContain('<col className="w-[64px]" />')
    expect(pageSource).toContain('w-full whitespace-nowrap rounded-md')
    expect(pageSource).toContain('grid grid-cols-2 gap-2')
    expect(pageSource).not.toContain('rowSpan={2}')
  })
})
