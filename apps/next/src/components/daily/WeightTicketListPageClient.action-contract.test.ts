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
})
