import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8').replaceAll('\r\n', '\n')
}

function desktopFilterBlock(clientSource: string) {
  return clientSource.slice(
    clientSource.indexOf('{/* Filters Toolbar */}'),
    clientSource.indexOf('{/* Mobile View (Collapsible Filters) */}'),
  )
}

describe('AR/AP aging filter layout', () => {
  const arSource = source('src/components/finance/AccountsReceivablePageClient.tsx')
  const apSource = source('src/components/purchase-flow/AccountsPayablePageClient.tsx')

  it.each([
    ['AR', arSource, 'Accounts Receivable', 'accounts-receivable-branch-filter'],
    ['AP', apSource, 'Accounts Payable', 'accounts-payable-branch-filter'],
  ])('preserves the SIT dashboard and approved compact filters for %s', (_label, clientSource, heroTitle, branchInputId) => {
    const filterBlock = desktopFilterBlock(clientSource)

    expect(clientSource).toContain(heroTitle)
    expect(clientSource).toContain('bg-gradient-to-r')
    expect(filterBlock).toContain('flex flex-wrap items-center gap-2')
    expect(filterBlock).toContain(`inputId="${branchInputId}"`)
    expect(filterBlock).toContain('placeholder="ทุกสาขา"')
    expect(filterBlock.indexOf('วันที่บิล:')).toBeLessThan(filterBlock.indexOf('สถานะ:'))
    expect(filterBlock).toContain('>ล้างตัวกรอง</button>')
    expect(filterBlock).toContain('<Download aria-hidden="true" className="size-4" />')
    expect(filterBlock).toContain('flex h-9 items-center gap-2 rounded-md bg-emerald-600')
    expect(filterBlock).not.toContain('✕ ล้าง')
    expect(filterBlock).not.toContain('พบ {data?.pagination.totalRows')
  })
})
