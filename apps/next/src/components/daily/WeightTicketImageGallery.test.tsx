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

beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
})

describe('stored weight ticket image URL contract', () => {
  it('accepts only parseable HTTP(S) assets for previews', () => {
    const assets = [
      encodeStoredImageReference('http.jpg', 'http://storage.example.com/http.jpg', 'weight-ticket/http.jpg'),
      encodeStoredImageReference('https.jpg', 'https://storage.example.com/https.jpg?token=signed', 'weight-ticket/https.jpg'),
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
  })

  it('renders the combined ticket images and opens the existing gallery at the clicked image', () => {
    const onOpen = vi.fn()
    const imageNames = Array.from({ length: 6 }, (_, index) => (
      encodeStoredImageReference(`evidence-${index + 1}.jpg`, `https://example.com/evidence-${index + 1}.jpg`, `weight-ticket/evidence-${index + 1}.jpg`)
    ))

    act(() => root.render(<WeightTicketImageGallery imageNames={imageNames} onOpen={onOpen} />))

    const buttons = container.querySelectorAll<HTMLButtonElement>('button[aria-label^="เปิดรูปภาพประกอบ"]')
    expect(container.textContent).toContain('รูปภาพประกอบ')
    expect(container.textContent).toContain('6 รูป')
    expect(buttons).toHaveLength(6)
    expect(container.firstElementChild?.className).toContain('min-w-0')
    expect(container.firstElementChild?.className).toContain('overflow-hidden')
    expect(buttons[0]?.parentElement?.className.split(' ')).toContain('grid-cols-3')
    expect(buttons[0]?.parentElement?.className.split(' ')).not.toContain('grid-cols-2')

    act(() => buttons[4]?.click())

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({
      activeIndex: 4,
      images: expect.arrayContaining([
        expect.objectContaining({ fileName: 'evidence-5.jpg', url: 'https://example.com/evidence-5.jpg' }),
      ]),
      title: 'รูปภาพประกอบ',
    }))
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
      encodeStoredImageReference('single.jpg', 'https://example.com/single.jpg', 'weight-ticket/single.jpg'),
    ]

    act(() => root.render(<WeightTicketImageGallery imageNames={imageNames} onOpen={onOpen} />))

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="เปิดรูปภาพประกอบ 1 จาก 1"]')
    expect(button).not.toBeNull()
    act(() => button?.click())
    expect(onOpen).toHaveBeenCalledWith({
      activeIndex: 0,
      images: [{ fileName: 'single.jpg', url: 'https://example.com/single.jpg' }],
      title: 'รูปภาพประกอบ',
    })
  })

  it('keeps legacy filename-only evidence readable without creating a broken preview', () => {
    const onOpen = vi.fn()
    const imageNames = [
      encodeStoredImageReference('preview.jpg', 'https://example.com/preview.jpg', 'weight-ticket/preview.jpg'),
      'legacy-camera-01.jpg',
    ]

    act(() => root.render(<WeightTicketImageGallery imageNames={imageNames} onOpen={onOpen} />))

    expect(container.textContent).toContain('2 รูป')
    expect(container.querySelectorAll('button[aria-label^="เปิดรูปภาพประกอบ"]')).toHaveLength(1)
    expect(container.textContent).toContain('มีรูปเดิม 1 รูปที่ยังไม่มี preview ในระบบปัจจุบัน')
  })

  it('previews only valid web URLs and keeps every legacy data URL format unavailable', () => {
    const onOpen = vi.fn()
    const imageNames = [
      encodeStoredImageReference('stored.jpg', 'https://storage.example.com/stored.jpg?token=signed', 'weight-ticket/stored.jpg'),
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
    expect(images[0]?.getAttribute('src')).toBe('https://storage.example.com/stored.jpg?token=signed')
    expect(buttons).toHaveLength(1)
    expect(container.textContent).toContain('มีรูปเดิม 5 รูปที่ยังไม่มี preview ในระบบปัจจุบัน')

    act(() => buttons[0]?.click())

    expect(onOpen).toHaveBeenCalledWith({
      activeIndex: 0,
      images: [{ fileName: 'stored.jpg', url: 'https://storage.example.com/stored.jpg?token=signed' }],
      title: 'รูปภาพประกอบ',
    })
  })
})
