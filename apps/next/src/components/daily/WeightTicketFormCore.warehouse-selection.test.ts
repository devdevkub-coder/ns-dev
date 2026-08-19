import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const source = (relativePath: string) => readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')

describe('weight ticket warehouse selection contract', () => {
  it('uses the company warehouse source for the required header selection', () => {
    const form = source('./WeightTicketFormCore.tsx')
    const sourceModule = source('../../lib/company-warehouses.ts')

    expect(form).toContain('readCompanyWarehouses')
    expect(form).toContain('inputId="weight-ticket-godownName"')
    expect(form).toContain('label="โกดัง*"')
    expect(form).toContain('value={form.godownName || null}')
    expect(form).not.toContain('placeholder="เช่น โกดัง A"')
    expect(form).toContain('/api/daily/weight-tickets/options')
    expect(sourceModule).toContain('ns-erp-company-warehouse-names')
    expect(sourceModule).toContain('ns-erp-company-warehouses')
  })
})
