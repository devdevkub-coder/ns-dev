import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('./TransactionBillsPageClient.tsx', import.meta.url)),
  'utf8',
).replaceAll('\r\n', '\n')
const weightTicketFormSource = readFileSync(
  fileURLToPath(new URL('./WeightTicketFormCore.tsx', import.meta.url)),
  'utf8',
).replaceAll('\r\n', '\n')
const weightTicketListSource = readFileSync(
  fileURLToPath(new URL('./WeightTicketListPageClient.tsx', import.meta.url)),
  'utf8',
).replaceAll('\r\n', '\n')

describe('purchase bill WTI auto-open', () => {
  it('bypasses cached purchase options so a newly confirmed WTI is available immediately', () => {
    expect(source).toContain("const loadPurchaseOptions = useCallback(async ({ bypassCache = false }: { bypassCache?: boolean } = {}) => {")
    expect(source).toContain("purchaseOptionsRequestRef.current = dailyFetchJson<PurchasePayload>('/api/purchase/bills/options')")

    const autoOpenKey = source.indexOf('const autoOpenKey = `${mode}:${targetDocNo}`')
    const autoOpenStart = source.indexOf("if (mode === 'purchase') {", autoOpenKey)
    expect(autoOpenKey).toBeGreaterThan(-1)
    expect(autoOpenStart).toBeGreaterThan(-1)
    expect(source.slice(autoOpenStart, autoOpenStart + 1_500)).toContain('loadPurchaseOptions({ bypassCache: true })')
  })

  it('invalidates purchase-bill options after WTI writes change its availability', () => {
    expect(weightTicketFormSource).toContain("import { invalidatePurchaseBillOptionsCache } from '@/lib/purchase-bill-options-cache'")
      expect(weightTicketFormSource).toContain('const ticket = await saveWeightTicket({')
      expect(weightTicketFormSource).toContain('})\n      invalidatePurchaseBillOptionsCache()')
      expect(weightTicketListSource).toContain('const updated = await confirmWeightTicket(ticket.id)\n      invalidatePurchaseBillOptionsCache()')
      const cancelCall = weightTicketListSource.indexOf('const updated = await cancelWeightTicket(')
      expect(cancelCall).toBeGreaterThan(-1)
      expect(weightTicketListSource.indexOf('invalidatePurchaseBillOptionsCache()', cancelCall)).toBeGreaterThan(cancelCall)
    })
  })
