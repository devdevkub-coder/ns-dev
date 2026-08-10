'use client'

import Image from 'next/image'
import { Download } from 'lucide-react'
import { useState } from 'react'

import { Card } from '@/components/ui/Card'
import { decodeStoredImageAsset, isThumbnailPreviewableStoredImageAsset } from '@/lib/weight-tickets'

export type WeightTicketGalleryImage = {
  fileName: string
  originalStorageKey: string
  bucket: string
  url: string
}

export type WeightTicketGalleryOpenPayload = {
  activeIndex: number
  images: WeightTicketGalleryImage[]
  title: string
}

export function WeightTicketImageGallery({
  downloadUrl,
  downloadFileName,
  downloadImageNames,
  imageNames,
  isLoadingPreview = false,
  onOpen,
  previewError = '',
}: {
  downloadUrl?: string
  downloadFileName?: string
  downloadImageNames?: string[]
  imageNames: string[]
  isLoadingPreview?: boolean
  onOpen: (payload: WeightTicketGalleryOpenPayload) => void
  previewError?: string
}) {
  const [downloadError, setDownloadError] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)
  const decodedImages = imageNames.map(decodeStoredImageAsset)
  const decodedDownloadImages = (downloadImageNames ?? imageNames).map(decodeStoredImageAsset)
  const images = decodedImages
    .filter(isThumbnailPreviewableStoredImageAsset)
    .map(({ bucket, fileName, storageKey, thumbnailUrl }) => ({ bucket, fileName, originalStorageKey: storageKey, url: thumbnailUrl }))
  const downloadableImages = decodedDownloadImages.filter((image) => Boolean(
    image.bucket && image.storageKey,
  ))
  const legacyImageCount = isLoadingPreview || previewError ? 0 : decodedImages.length - images.length

  async function handleDownloadAll() {
    if (!downloadUrl || downloadableImages.length === 0 || isDownloading) return
    setIsDownloading(true)
    setDownloadError('')
    try {
      const response = await fetch(downloadUrl, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error('ดาวน์โหลดรูปภาพไม่สำเร็จ')
      }
      const objectUrl = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      if (downloadFileName) anchor.download = downloadFileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (caught) {
      setDownloadError(caught instanceof Error ? caught.message : 'ดาวน์โหลดรูปภาพไม่สำเร็จ')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Card aria-labelledby="weight-ticket-image-gallery-title" className="min-w-0 overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
        <h2 className="text-base font-bold text-slate-900 sm:text-lg" id="weight-ticket-image-gallery-title">
          รูปภาพประกอบ
        </h2>
        <div className="flex shrink-0 items-center gap-3">
          {downloadUrl ? (
            <button
              aria-label="ดาวน์โหลดรูปภาพประกอบทั้งหมด"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={downloadableImages.length === 0 || isDownloading}
              type="button"
              onClick={() => void handleDownloadAll()}
            >
              <Download className="size-4" />
              {isDownloading ? 'กำลังดาวน์โหลด...' : 'ดาวน์โหลดรูปทั้งหมด'}
            </button>
          ) : null}
          <span className="text-sm text-slate-500">{downloadImageNames ? `${downloadableImages.length} รูปทั้งหมด` : `${imageNames.length} รูป`}</span>
        </div>
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        {downloadError ? <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{downloadError}</div> : null}
        {previewError ? <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">{previewError}</div> : null}
        {isLoadingPreview && imageNames.length > 0 ? (
          <div className="text-sm text-slate-400" role="status">กำลังเตรียม preview รูปภาพ...</div>
        ) : images.length > 0 ? (
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
        {!isLoadingPreview && !previewError && legacyImageCount > 0 ? (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            มีรูปเดิม {legacyImageCount} รูปที่ยังไม่มี preview ในระบบปัจจุบัน
          </div>
        ) : null}
      </div>
    </Card>
  )
}
