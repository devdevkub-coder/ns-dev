import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WeightTicketRecord } from '@/lib/weight-tickets'

vi.mock('server-only', () => ({}))

const storage = vi.hoisted(() => ({
  getClient: vi.fn(),
}))

vi.mock('@/lib/server/supabase-admin', () => ({
  getSupabaseAdminClient: storage.getClient,
}))

import {
  buildFlexMessage,
  buildPublicPdfUrl,
  buildWeightTicketPdfActions,
  cleanupWeightTicketLineArtifacts,
  getWeightTicketNotificationLogStatus,
  sendLinePush,
} from './weight-ticket-line-notification'

describe('LINE Push API transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    storage.getClient.mockReset()
  })

  it('applies a default timeout when the caller does not provide a signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      headers: new Headers({ 'x-line-request-id': 'line-request' }),
      ok: true,
      status: 200,
    })
    vi.stubGlobal('fetch', fetchMock)

    await sendLinePush('C-LINE', [{ type: 'text', text: 'test' }], 'token')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.line.me/v2/bot/message/push',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('rejects a 200 response without a LINE request id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      headers: new Headers(),
      ok: true,
      status: 200,
    }))

    await expect(sendLinePush('C-LINE', [{ type: 'text', text: 'test' }], 'token'))
      .rejects.toThrow('LINE Push Message ไม่คืน x-line-request-id')
  })

  it('rejects a retry conflict without an accepted LINE request id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      headers: new Headers(),
      ok: false,
      status: 409,
    }))

    await expect(sendLinePush('C-LINE', [{ type: 'text', text: 'test' }], 'token', 'retry-key'))
      .rejects.toThrow('LINE Push Message ตอบกลับ 409 แต่ไม่คืน accepted request id')
  })

  it('accepts a retry conflict only when LINE confirms the original request id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      headers: new Headers({ 'x-line-accepted-request-id': 'accepted-request' }),
      ok: false,
      status: 409,
    }))

    await expect(sendLinePush('C-LINE', [{ type: 'text', text: 'test' }], 'token', 'retry-key'))
      .resolves.toEqual({ isConflict: true, lineRequestId: 'accepted-request' })
  })
})

describe('LINE outbound artifact lifecycle', () => {
  it('does not mark a retry conflict as a new sent artifact', () => {
    expect(getWeightTicketNotificationLogStatus(false)).toEqual({ status: 'sent' })
    expect(getWeightTicketNotificationLogStatus(true)).toEqual({
      errorMessage: 'LINE retry key conflict: original request was already accepted; this attempt did not send a new artifact',
      status: 'failed',
    })
  })

  it('removes generated PDF and album objects without touching source evidence', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn().mockReturnValue({ remove })
    storage.getClient.mockReturnValue({ storage: { from } })

    await expect(cleanupWeightTicketLineArtifacts([
      { bucket: 'weight-ticket-pdfs', storageKey: 'WTI/pdf.pdf' },
      { bucket: 'weight-ticket-pdfs', storageKey: 'WTI/album/page-1.jpg' },
      { bucket: 'weight-ticket-pdfs', storageKey: 'WTI/pdf.pdf' },
    ])).resolves.toEqual({ cleaned: true })

    expect(from).toHaveBeenCalledWith('weight-ticket-pdfs')
    expect(remove).toHaveBeenCalledWith(['WTI/pdf.pdf', 'WTI/album/page-1.jpg'])
  })

  it('reports cleanup failure so the caller can retain artifact keys for manual recovery', async () => {
    const from = vi.fn().mockReturnValue({
      remove: vi.fn().mockResolvedValue({ error: { message: 'storage unavailable' } }),
    })
    storage.getClient.mockReturnValue({ storage: { from } })

    await expect(cleanupWeightTicketLineArtifacts([
      { bucket: 'weight-ticket-pdfs', storageKey: 'WTO/pdf.pdf' },
    ])).resolves.toEqual({
      cleaned: false,
      error: 'ลบไฟล์ artifact ของ LINE ไม่สำเร็จ: storage unavailable',
    })
  })
})

describe('WTI/WTO PDF LINE actions', () => {
  it('uses the application domain for public PDF links', () => {
    expect(buildPublicPdfUrl('https://ns-erp-sit.vercel.app', 'WTI012608-0383'))
      .toBe('https://ns-erp-sit.vercel.app/download/weight-ticket/WTI012608-0383')
  })

  it('provides anonymous view and download actions when signed URLs are available', () => {
    expect(buildWeightTicketPdfActions(
      'https://storage.example/view.pdf',
      'https://storage.example/download.pdf',
    )).toEqual([
      expect.objectContaining({ action: { label: 'ดู PDF', type: 'uri', uri: 'https://storage.example/view.pdf' } }),
      expect.objectContaining({ action: { label: 'ดาวน์โหลด PDF', type: 'uri', uri: 'https://storage.example/download.pdf' } }),
    ])
  })

  it('does not render PDF actions when PDF generation did not produce links', () => {
    expect(buildWeightTicketPdfActions('', '')).toEqual([])
  })

  it('keeps the LINE eight-image album boundary aligned with Flex payload pages', () => {
    const ticket = {
      createdAt: '2026-08-20T00:00:00.000Z',
      documentDate: '2026-08-20',
      documentNo: 'WTI200826-0001',
      godownName: 'Main',
      imageCount: 9,
      lines: [],
      partyName: 'Supplier',
      productSummaries: [],
      totals: {
        containerDeductionWeight: 0,
        deductionWeight: 0,
        grossWeight: 100,
        netWeight: 100,
      },
      type: 'WTI',
    } as unknown as WeightTicketRecord
    const attachmentImages = Array.from({ length: 9 }, (_, index) => ({
      fileName: `evidence-${index + 1}.jpg`,
      url: `https://private-storage.example/print-${index + 1}.jpg?token=short`,
    }))
    const albumImageUrls = [
      'https://public-storage.example/album/page-1.jpg',
      'https://public-storage.example/album/page-2.jpg',
    ]

    const flex = buildFlexMessage(
      ticket,
      'https://public-storage.example/ticket.pdf',
      '',
      'https://app.example/ticket',
      attachmentImages,
      albumImageUrls,
    )
    const photoBubbles = flex.contents.contents.slice(1)
    const firstPage = JSON.stringify(photoBubbles[0])
    const secondPage = JSON.stringify(photoBubbles[1])

    expect(photoBubbles).toHaveLength(2)
    expect(firstPage).toContain(albumImageUrls[0])
    expect(firstPage).not.toContain(albumImageUrls[1])
    expect(firstPage).toContain('#8')
    expect(firstPage.match(/"type":"image"/g)).toHaveLength(1)
    expect(secondPage).toContain(albumImageUrls[1])
    expect(secondPage).toContain('#9')
    expect(JSON.stringify(flex)).not.toContain('private-storage.example')
  })
})
