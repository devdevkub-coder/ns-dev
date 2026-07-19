'use client'

import Image from 'next/image'

import { Card } from '@/components/ui/Card'
import { decodeStoredImageAsset, isPreviewableStoredImageAsset } from '@/lib/weight-tickets'

export type WeightTicketGalleryImage = {
  fileName: string
  url: string
}

export type WeightTicketGalleryOpenPayload = {
  activeIndex: number
  images: WeightTicketGalleryImage[]
  title: string
}

export function WeightTicketImageGallery({
  imageNames,
  onOpen,
}: {
  imageNames: string[]
  onOpen: (payload: WeightTicketGalleryOpenPayload) => void
}) {
  const decodedImages = imageNames.map(decodeStoredImageAsset)
  const images = decodedImages
    .filter(isPreviewableStoredImageAsset)
    .map(({ fileName, url }) => ({ fileName, url }))
  const legacyImageCount = decodedImages.length - images.length

  return (
    <Card aria-labelledby="weight-ticket-image-gallery-title" className="min-w-0 overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
        <h2 className="text-base font-bold text-slate-900 sm:text-lg" id="weight-ticket-image-gallery-title">
          รูปภาพประกอบ
        </h2>
        <span className="shrink-0 text-sm text-slate-500">{imageNames.length} รูป</span>
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        {images.length > 0 ? (
          <div className="grid min-w-0 grid-cols-3 gap-3">
            {images.map((image, index) => (
              <button
                aria-label={`เปิดรูปภาพประกอบ ${index + 1} จาก ${images.length}`}
                className="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-left transition hover:border-slate-300 hover:bg-slate-100"
                key={`${image.url}-${index}`}
                type="button"
                onClick={() => onOpen({ activeIndex: index, images, title: 'รูปภาพประกอบ' })}
              >
                <div className="relative aspect-[4/3] bg-slate-200">
                  <Image
                    alt={image.fileName}
                    className="object-cover"
                    fill
                    sizes="33vw"
                    src={image.url}
                    unoptimized
                  />
                </div>
                <div className="truncate px-3 py-2 text-xs text-slate-600">{image.fileName}</div>
              </button>
            ))}
          </div>
        ) : imageNames.length === 0 ? (
          <div className="text-sm text-slate-400">ยังไม่มีรูปภาพประกอบ</div>
        ) : null}
        {legacyImageCount > 0 ? (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            มีรูปเดิม {legacyImageCount} รูปที่ยังไม่มี preview ในระบบปัจจุบัน
          </div>
        ) : null}
      </div>
    </Card>
  )
}
