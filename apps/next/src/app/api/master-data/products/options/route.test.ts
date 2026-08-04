import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const routeSource = readFileSync(new URL('./route.ts', import.meta.url), 'utf8')

describe('product options response contract', () => {
  it('serializes product type and unit ids as JSON-safe business IDs', () => {
    expect(routeSource).toContain('productTypes.map((row) => ({ id: row.id.toString()')
    expect(routeSource).toContain('productUnits.map((row) => ({ id: row.id.toString()')
  })
})
