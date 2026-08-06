import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('./WeightTicketListPageClient.tsx', import.meta.url)),
  'utf8',
).replaceAll('\r\n', '\n')

describe('weight-ticket list action contract', () => {
  it('keeps a detail action available in both mobile and desktop menus', () => {
    expect(source.match(/<TableActionMenuItem onSelect=\{\(\) => setActiveDetailId\(ticket\.id\)\}>รายละเอียด<\/TableActionMenuItem>/g)).toHaveLength(2)
  })

  it('renders cancelled status as plain text without a status box', () => {
    expect(source).not.toContain("isCancelled\n                      ? 'bg-red-100 text-red-800 ring-1 ring-red-200'")
    expect(source).not.toContain("isCancelled\n                            ? 'rounded-md bg-red-100 px-2 py-0.5 font-semibold text-red-800 ring-1 ring-red-200'")
  })
})
