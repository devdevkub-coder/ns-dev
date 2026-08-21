import { beforeEach, describe, expect, it, vi } from 'vitest'

import { openWeightTicketPdfPrint } from './download-weight-ticket-pdf'

describe('openWeightTicketPdfPrint', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('%PDF-test', {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    })))
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn().mockReturnValue('blob:https://sit.example/pdf'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
  })

  it('opens the same PDF endpoint used by Download PDF in the print window', async () => {
    const replace = vi.fn()
    const targetWindow = { location: { replace } } as unknown as Window

    await openWeightTicketPdfPrint('WTI012608-0383', targetWindow)

    expect(fetch).toHaveBeenCalledWith('/api/daily/weight-tickets/WTI012608-0383/pdf', {
      credentials: 'same-origin',
    })
    expect(replace).toHaveBeenCalledWith('blob:https://sit.example/pdf')
  })
})
