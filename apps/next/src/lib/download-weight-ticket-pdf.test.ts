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

  it('retries only when the print derivative is not ready', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'WEIGHT_TICKET_PRINT_IMAGE_NOT_READY', error: 'ยังไม่พร้อม' }), { status: 409 }))
      .mockResolvedValueOnce(new Response('%PDF-test', { status: 200 }))
    const replace = vi.fn()
    const targetWindow = { location: { replace } } as unknown as Window

    const pending = openWeightTicketPdfPrint('WTO012608-0383', targetWindow)
    await vi.advanceTimersByTimeAsync(500)
    await pending

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(replace).toHaveBeenCalledWith('blob:https://sit.example/pdf')
    vi.useRealTimers()
  })
})
