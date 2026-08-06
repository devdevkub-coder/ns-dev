import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/server/supabase-admin', () => ({ getSupabaseAdminClient: () => null }))

import { normalizeWeightTicketImageReferences } from './weight-ticket-storage'

describe('WTI/WTO private image reference contract', () => {
  it('strips a preview-only signed URL before persistence', () => {
    const signedReference = JSON.stringify({
      bucket: 'weight-ticket-images',
      fileName: 'evidence.jpg',
      storageKey: 'attachments/pending/evidence.jpg',
      url: 'https://signed.example/evidence.jpg?token=short-lived',
    })
    const values = normalizeWeightTicketImageReferences({
      lines: [{ imageNames: [signedReference] }],
      vehicleImageNames: [],
    }, 'weight-ticket-images')

    expect(JSON.parse(values.lines[0].imageNames[0] ?? '{}')).toEqual({
      bucket: 'weight-ticket-images',
      fileName: 'evidence.jpg',
      storageKey: 'attachments/pending/evidence.jpg',
    })
  })

  it('rejects legacy data URLs instead of uploading them during LINE/PDF or save', () => {
    expect(() => normalizeWeightTicketImageReferences({
      lines: [{ imageNames: ['data:image/jpeg;base64,AAAA'] }],
      vehicleImageNames: [],
    }, 'weight-ticket-images')).toThrow('รูปหลักฐานรูปแบบเก่า')
  })

  it('rejects references from the public PDF/artifact bucket', () => {
    expect(() => normalizeWeightTicketImageReferences({
      lines: [{ imageNames: [JSON.stringify({
        bucket: 'weight-ticket-pdfs',
        fileName: 'evidence.jpg',
        storageKey: 'legacy/evidence.jpg',
      })] }],
      vehicleImageNames: [],
    }, 'weight-ticket-images')).toThrow('bucket ไม่ตรง')
  })
})
