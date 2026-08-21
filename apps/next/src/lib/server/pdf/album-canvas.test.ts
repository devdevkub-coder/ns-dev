import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createCanvas: vi.fn(),
  encode: vi.fn(),
  existsSync: vi.fn(),
  loadImage: vi.fn(),
  registerFromPath: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('node:fs', () => ({ existsSync: mocks.existsSync }))
vi.mock('@napi-rs/canvas', () => ({
  GlobalFonts: { registerFromPath: mocks.registerFromPath },
  createCanvas: mocks.createCanvas,
  loadImage: mocks.loadImage,
}))

import { renderAlbumImages } from './album-canvas'

function createContext() {
  return {
    arcTo: vi.fn(),
    beginPath: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 20 })),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.existsSync.mockReturnValue(true)
  mocks.loadImage.mockResolvedValue({ height: 3, width: 4 })
  mocks.encode.mockResolvedValue(Buffer.from('album'))
  mocks.createCanvas.mockImplementation(() => ({
    encode: mocks.encode,
    getContext: () => createContext(),
  }))
})

describe('formal weight-ticket album renderer', () => {
  it('fails closed when any formal image cannot be loaded', async () => {
    mocks.loadImage.mockRejectedValueOnce(new Error('signed URL expired'))

    await expect(renderAlbumImages({
      documentNo: 'WTI012608-0351',
      images: [{ fileName: 'evidence-01.jpg', url: 'https://example.test/evidence-01' }],
      isWti: true,
      partyName: 'Supplier',
      ticketCreatedAt: '2026-08-20T00:00:00.000Z',
    })).rejects.toThrow('โหลดรูปสำหรับสร้างอัลบั้มไม่สำเร็จ (evidence-01.jpg): signed URL expired')

    expect(mocks.encode).not.toHaveBeenCalled()
  })
})
