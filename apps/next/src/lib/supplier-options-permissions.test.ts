import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const optionsRoute = readFileSync(new URL('../app/api/master-data/suppliers/options/route.ts', import.meta.url), 'utf8')

describe('supplier options permission boundary', () => {
  it('uses the supplier page view permission instead of generic reference access', () => {
    expect(optionsRoute).toContain('SUPPLIER_PAGE_PERMISSIONS.view')
    expect(optionsRoute).not.toContain("master.reference.view")
  })
})
