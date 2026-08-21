// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { decodeStoredImageAsset, encodeStoredImageReference, isPreviewableStoredImageAsset } from '@/lib/weight-tickets'
import { WeightTicketImageGallery } from './WeightTicketImageGallery'

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element -- test stub for next/image
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}))

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT

function storedReference(fileName: string, originalUrl: string, thumbnailUrl = originalUrl.replace(/\.jpg/, '.thumb.webp')) {
  return encodeStoredImageReference(fileName, originalUrl, `attachments/${fileName}`, 'weight-ticket-images', `attachments/${fileName}.thumb.webp`, thumbnailUrl)
}

beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
})

describe('stored weight ticket image URL contract', () => {
  it('accepts only parseable HTTP(S) assets for previews', () => {
    const assets = [
      storedReference('http.jpg', 'http://storage.example.com/http.jpg'),
      storedReference('https.jpg', 'https://storage.example.com/https.jpg?token=signed'),
      'data:image/png;base64,AAAA',
      'legacy-pipe.jpg|data:image/jpeg;base64,BBBB',
      JSON.stringify({ dataUrl: 'data:image/webp;base64,CCCC', fileName: 'legacy-json.webp' }),
      JSON.stringify({ fileName: 'invalid-url.jpg', url: 'https://' }),
      'legacy-filename-only.jpg',
    ].map(decodeStoredImageAsset)

    expect(assets.filter(isPreviewableStoredImageAsset).map((asset) => asset.url)).toEqual([
      'http://storage.example.com/http.jpg',
      'https://storage.example.com/https.jpg?token=signed',
    ])
  })
})

describe('WeightTicketImageGallery', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders only three preview images and opens the existing gallery for the remaining images', () => {
    const onOpen = vi.fn()
    const imageNames = Array.from({ length: 6 }, (_, index) => (
      storedReference(`evidence-${index + 1}.jpg`, `https://example.com/evidence-${index + 1}.jpg`)
    ))

    act(() => root.render(<WeightTicketImageGallery imageNames={imageNames} onOpen={onOpen} />))

    const buttons = container.querySelectorAll<HTMLButtonElement>('button[aria-label*=" จาก "]')
    expect(container.textContent).toContain('รูปภาพประกอบ')
    expect(container.textContent).toContain('6 รูป')
    expect(buttons).toHaveLength(3)
    const moreButton = container.querySelector<HTMLButtonElement>('button[aria-label="เปิดรูปภาพประกอบอีก 3 รูป"]')
    expect(moreButton).not.toBeNull()
    expect(container.firstElementChild?.className).toContain('min-w-0')
    expect(container.firstElementChild?.className).toContain('overflow-hidden')
    expect(buttons[0]?.parentElement?.className.split(' ')).toContain('grid-cols-3')
    expect(buttons[0]?.parentElement?.className.split(' ')).toContain('md:grid-cols-4')
    expect(buttons[0]?.parentElement?.className.split(' ')).not.toContain('grid-cols-2')

    act(() => moreButton?.click())

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({
      activeIndex: 3,
      images: expect.arrayContaining([
        expect.objectContaining({ fileName: 'evidence-5.jpg', url: 'https://example.com/evidence-5.thumb.webp' }),
      ]),
      title: 'รูปภาพประกอบ',
    }))
  })

  it('does not render a more-images tile when three or fewer previews are available', () => {
    const onOpen = vi.fn()
    const imageNames = Array.from({ length: 3 }, (_, index) => (
      storedReference(`evidence-${index + 1}.jpg`, `https://example.com/evidence-${index + 1}.jpg`)
    ))

    act(() => root.render(<WeightTicketImageGallery imageNames={imageNames} onOpen={onOpen} />))

    expect(container.querySelectorAll<HTMLImageElement>('img')).toHaveLength(3)
    expect(container.querySelector('button[aria-label^="เปิดรูปภาพประกอบอีก"]')).toBeNull()
  })

  it('downloads all previewable images through the document ZIP endpoint', async () => {
    const onOpen = vi.fn()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [{ fileName: 'WTI-001-images.zip', url: 'https://storage.example/signed.zip' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(new Blob(['zip']), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const createObjectUrl = vi.fn().mockReturnValue('blob:weight-ticket-images')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const imageNames = [
      storedReference('evidence.jpg', 'https://example.com/evidence.jpg'),
    ]

    act(() => root.render(
      <WeightTicketImageGallery
        downloadUrl="/api/daily/weight-tickets/WTI-001/images/download"
        imageNames={imageNames}
        onOpen={onOpen}
      />,
    ))

    const downloadButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('ดาวน์โหลดรูปทั้งหมด'))
    expect(downloadButton).not.toBeUndefined()
    await act(async () => {
      downloadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/daily/weight-tickets/WTI-001/images/download', { cache: 'no-store' })
    expect(createObjectUrl).toHaveBeenCalled()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: undefined })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: undefined })
  })

  it('shows a ZIP chooser instead of triggering multiple browser downloads', async () => {
    const onOpen = vi.fn()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [
        { fileName: 'WTI-001-images-part-01.zip', url: 'https://storage.example/signed-01.zip' },
        { fileName: 'WTI-001-images-part-02.zip', url: 'https://storage.example/signed-02.zip' },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn().mockReturnValue('blob:weight-ticket-images') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    const imageNames = [storedReference('evidence.jpg', 'https://example.com/evidence.jpg')]

    act(() => root.render(
      <WeightTicketImageGallery
        downloadUrl="/api/daily/weight-tickets/WTI-001/images/download"
        imageNames={imageNames}
        onOpen={onOpen}
      />,
    ))

    const downloadButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('ดาวน์โหลดรูปทั้งหมด'))
    await act(async () => { downloadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

    expect(document.body.textContent).toContain('เลือกไฟล์ ZIP สำหรับดาวน์โหลด')
    expect(document.body.textContent).toContain('WTI-001-images-part-01.zip')
    expect(document.body.textContent).toContain('WTI-001-images-part-02.zip')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockResolvedValueOnce(new Response(new Blob(['zip-01']), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Blob(['zip-02']), { status: 200 }))
    const allButton = Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent?.includes('ดาวน์โหลดทุกไฟล์'))
    await act(async () => { allButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://storage.example/signed-01.zip')
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'https://storage.example/signed-02.zip')
  })

  it('keeps the download button enabled when only vehicle images are downloadable', () => {
    const onOpen = vi.fn()
    const vehicleImage = storedReference('vehicle.jpg', 'https://example.com/vehicle.jpg')

    act(() => root.render(
      <WeightTicketImageGallery
        downloadImageNames={[vehicleImage]}
        downloadUrl="/api/daily/weight-tickets/WTI-001/images/download"
        imageNames={[]}
        onOpen={onOpen}
      />,
    ))

    const downloadButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('ดาวน์โหลดรูปทั้งหมด'))
    expect(downloadButton).not.toBeUndefined()
    expect(downloadButton?.disabled).toBe(false)
    expect(container.textContent).toContain('1 รูปทั้งหมด')
  })

  it('shows an empty evidence state when the ticket has no images', () => {
    const onOpen = vi.fn()

    act(() => root.render(<WeightTicketImageGallery imageNames={[]} onOpen={onOpen} />))

    expect(container.textContent).toContain('0 รูป')
    expect(container.textContent).toContain('ยังไม่มีรูปภาพประกอบ')
    expect(container.querySelector('button[aria-label^="เปิดรูปภาพประกอบ"]')).toBeNull()
  })

  it('opens a single image as a one-item gallery', () => {
    const onOpen = vi.fn()
    const imageNames = [
      storedReference('single.jpg', 'https://example.com/single.jpg'),
    ]

    act(() => root.render(<WeightTicketImageGallery imageNames={imageNames} onOpen={onOpen} />))

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="เปิดรูปภาพประกอบ 1 จาก 1"]')
    expect(button).not.toBeNull()
    act(() => button?.click())
    expect(onOpen).toHaveBeenCalledWith({
      activeIndex: 0,
      images: [{ bucket: 'weight-ticket-images', fileName: 'single.jpg', originalStorageKey: 'attachments/single.jpg', url: 'https://example.com/single.thumb.webp' }],
      title: 'รูปภาพประกอบ',
    })
  })

  it('keeps legacy filename-only evidence readable without creating a broken preview', () => {
    const onOpen = vi.fn()
    const imageNames = [
      storedReference('preview.jpg', 'https://example.com/preview.jpg'),
      'legacy-camera-01.jpg',
    ]

    act(() => root.render(<WeightTicketImageGallery imageNames={imageNames} onOpen={onOpen} />))

    expect(container.textContent).toContain('2 รูป')
    expect(container.querySelectorAll('button[aria-label^="เปิดรูปภาพประกอบ"]')).toHaveLength(1)
    expect(container.textContent).toContain('มีรูปเดิม 1 รูปที่ยังไม่มี preview ในระบบปัจจุบัน')
  })

  it('shows each unfinished thumbnail as processing without loading the original as fallback', () => {
    const onOpen = vi.fn()
    const pending = encodeStoredImageReference(
      'pending.jpg',
      undefined,
      'attachments/pending/pending.jpg',
      'weight-ticket-images',
      'attachments/pending/pending.thumb.webp',
      undefined,
      'processing',
    )

    act(() => root.render(<WeightTicketImageGallery imageNames={[pending]} onOpen={onOpen} />))

    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('กำลังสร้างภาพตัวอย่าง 1 รูป')
    expect(container.textContent).not.toContain('รูปเดิม')
  })

  it('previews only valid web URLs and keeps every legacy data URL format unavailable', () => {
    const onOpen = vi.fn()
    const imageNames = [
      storedReference('stored.jpg', 'https://storage.example.com/stored.jpg?token=signed', 'https://storage.example.com/stored.thumb.webp?token=signed'),
      'data:image/png;base64,AAAA',
      'legacy-pipe.jpg|data:image/jpeg;base64,BBBB',
      JSON.stringify({ dataUrl: 'data:image/webp;base64,CCCC', fileName: 'legacy-json.webp' }),
      JSON.stringify({ fileName: 'invalid-url.jpg', url: 'https://' }),
      'legacy-filename-only.jpg',
    ]

    act(() => root.render(<WeightTicketImageGallery imageNames={imageNames} onOpen={onOpen} />))

    const images = container.querySelectorAll<HTMLImageElement>('img')
    const buttons = container.querySelectorAll<HTMLButtonElement>('button[aria-label^="เปิดรูปภาพประกอบ"]')
    expect(images).toHaveLength(1)
    expect(images[0]?.getAttribute('src')).toBe('https://storage.example.com/stored.thumb.webp?token=signed')
    expect(buttons).toHaveLength(1)
    expect(container.textContent).toContain('มีรูปเดิม 5 รูปที่ยังไม่มี preview ในระบบปัจจุบัน')

    act(() => buttons[0]?.click())

    expect(onOpen).toHaveBeenCalledWith({
      activeIndex: 0,
      images: [{ bucket: 'weight-ticket-images', fileName: 'stored.jpg', originalStorageKey: 'attachments/stored.jpg', url: 'https://storage.example.com/stored.thumb.webp?token=signed' }],
      title: 'รูปภาพประกอบ',
    })
  })
})
