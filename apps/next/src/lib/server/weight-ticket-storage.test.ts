import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
}))

vi.mock('@/lib/server/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/server/supabase-admin', () => ({
  getSupabaseAdminClient: () => ({
    storage: {
      from: () => ({ createSignedUrl: mocks.createSignedUrl }),
    },
  }),
}))

import { attachWeightTicketImagePreviewUrls, normalizeWeightTicketImageReferences } from './weight-ticket-storage'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://signed.example/evidence.jpg?token=short-lived' },
    error: null,
  })
})

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

  it('rejects image storage keys outside the attachments namespace', () => {
    for (const storageKey of [
      'weight-ticket-pdfs/secret.jpg',
      'attachments/../secret.jpg',
      'attachments/%2e%2e/secret.jpg',
      'attachments/foo?x=1.jpg',
      'attachments/foo#fragment.jpg',
      'attachments//secret.jpg',
    ]) {
      expect(() => normalizeWeightTicketImageReferences({
        lines: [{ imageNames: [JSON.stringify({
          bucket: 'weight-ticket-images',
          fileName: 'secret.jpg',
          storageKey,
        })] }],
        vehicleImageNames: [],
      }, 'weight-ticket-images')).toThrow('storage key')
    }
  })

  it('fails closed when preview input references another bucket or a legacy value', async () => {
    const wrongBucketReference = JSON.stringify({
      bucket: 'weight-ticket-pdfs',
      fileName: 'public-artifact.jpg',
      storageKey: 'legacy/public-artifact.jpg',
      url: 'https://public.example/public-artifact.jpg',
    })
    const validReference = JSON.stringify({
      bucket: 'weight-ticket-images',
      fileName: 'evidence.jpg',
      storageKey: 'attachments/01/evidence.jpg',
    })

    const result = await attachWeightTicketImagePreviewUrls({
      imageNames: [wrongBucketReference, 'legacy-name.jpg', validReference],
      lines: [{ imageNames: [wrongBucketReference] }],
      vehicleImageNames: [wrongBucketReference],
    }, 'weight-ticket-images')

    expect(result.imageNames).toHaveLength(1)
    expect(JSON.parse(result.imageNames[0] ?? '{}')).toMatchObject({
      bucket: 'weight-ticket-images',
      storageKey: 'attachments/01/evidence.jpg',
      url: 'https://signed.example/evidence.jpg?token=short-lived',
    })
    expect(result.lines[0]?.imageNames).toEqual([])
    expect(result.vehicleImageNames).toEqual([])
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1)
  })

  it('surfaces malformed same-bucket keys instead of silently dropping them from preview', async () => {
    await expect(attachWeightTicketImagePreviewUrls({
      imageNames: [JSON.stringify({
        bucket: 'weight-ticket-images',
        fileName: 'broken.jpg',
        storageKey: 'attachments/%2e%2e/broken.jpg',
      })],
      lines: [],
      vehicleImageNames: [],
    }, 'weight-ticket-images')).rejects.toThrow('storage key')
  })
})
