import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const poBuyPath = fileURLToPath(new URL('./purchase-flow/PoBuyPageClient.tsx', import.meta.url))
const poSellPath = fileURLToPath(new URL('./sales/PoSellPageClient.tsx', import.meta.url))
const billsPath = fileURLToPath(new URL('./daily/TransactionBillsPageClient.tsx', import.meta.url))

describe('VAT form presentation contract', () => {
  it('keeps PO Buy and PO Sell calculation controls compact and visually consistent', async () => {
    const [poBuy, poSell] = await Promise.all([readFile(poBuyPath, 'utf8'), readFile(poSellPath, 'utf8')])

    expect(poBuy).toContain("onUpdate('hasVat', event.target.checked)")
    expect(poSell).toContain("onUpdate('hasVat', event.target.checked)")
    expect(poBuy).toContain('คิด VAT {formatMoney(formTotals.vatRatePercent)}%')
    expect(poSell).toContain('คิด VAT {formatMoney(vatRatePercent)}%')
    expect(poBuy).toContain("border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'")
    expect(poSell).toContain("border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'")
    expect(poBuy).toContain('md:grid-cols-[minmax(0,1fr)_320px]')
    expect(poSell).toContain('md:grid-cols-[minmax(0,1fr)_320px]')
    expect(poBuy).not.toContain("flex h-full items-center gap-3 rounded-xl border p-3 cursor-pointer ${form.hasVat ? 'border-amber-500 bg-amber-50'")
    expect(poSell).not.toContain("rounded-xl border p-3 cursor-pointer select-none transition-colors ${form.hasVat ? 'border-amber-500 bg-amber-50/50'")
  })

  it('keeps bill VAT calculation and Sales tax-invoice issuance as separate controls', async () => {
    const bills = await readFile(billsPath, 'utf8')

    expect(bills.match(/คิด \{vatLabel\}/g)).toHaveLength(2)
    expect(bills.match(/VAT และยอดรวม/g)).toHaveLength(2)
    expect(bills.match(/md:grid-cols-\[minmax\(0,1fr\)_320px\]/g)).toHaveLength(2)
    expect(bills).toContain("updateForm('hasVat', event.target.checked)")
    expect(bills).toContain("updateSalesForm('hasVat', event.target.checked)")
    expect(bills).toContain("updateSalesForm('vatInvoiceIssued', event.target.checked)")
    expect(bills).toContain("key === 'hasVat' ? { vatType: (value ? 'EXCLUDE' : 'NONE') as SalesBillFormValues['vatType'] }")
    expect(bills).toContain("key === 'vatInvoiceIssued' && value === false ? { vatInvoiceDate: null, vatInvoiceNo: null }")
  })
})
