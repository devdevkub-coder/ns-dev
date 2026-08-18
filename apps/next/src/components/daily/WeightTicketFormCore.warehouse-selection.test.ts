import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const source = (relativePath: string) => readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')

describe('weight ticket warehouse selection contract', () => {
  it('uses the company warehouse names source for the required header selection', () => {
    const form = source('./WeightTicketFormCore.tsx')
    const sourceModule = source('../../lib/company-warehouse-names.ts')

    expect(form).toContain('readCompanyWarehouseNames')
    expect(form).toContain('options={warehouses}')
    expect(form).toContain('required\n                value={form.godownName}')
    expect(form).not.toContain('placeholder="เช่น โกดัง A"')
    expect(sourceModule).toContain("ns-erp-company-warehouse-names")
    expect(sourceModule).not.toContain('โกดัง 1')
  })
})
