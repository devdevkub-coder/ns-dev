import { createClient } from '@supabase/supabase-js'

export const PRODUCT_IMAGE_BUCKET = 'product-images'
export const PRODUCT_IMAGE_MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const PRODUCT_IMAGE_MAX_UPLOAD_PIXELS = 25_000_000
const PRODUCT_IMAGE_ORIGINAL_MAX_SIZE = 1600
const PRODUCT_IMAGE_THUMBNAIL_SIZE = 320
const PRODUCT_IMAGE_ORIGINAL_QUALITY = 0.82
const PRODUCT_IMAGE_THUMBNAIL_QUALITY = 0.78

function createPublicSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    return null
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
}

function sanitizeSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'image'
}

function buildProductImageStorageKey(productCode: string, variant: 'original' | 'thumb', fileName: string) {
  const normalizedCode = sanitizeSegment(productCode)
  const cleanedFileName = fileName.trim()
  const baseName = sanitizeSegment(cleanedFileName.replace(/\.[^.]+$/, ''))
  return `products/${normalizedCode}/${variant}/${Date.now()}-${baseName}.webp`
}

export function buildProductOriginalImageStorageKey(productCode: string, fileName: string) {
  return buildProductImageStorageKey(productCode, 'original', fileName)
}

export function buildProductThumbnailStorageKey(productCode: string, fileName: string) {
  return buildProductImageStorageKey(productCode, 'thumb', fileName)
}

export function getProductImageFileName(storageKey: string) {
  const trimmed = storageKey.trim()
  if (!trimmed) return ''
  const segments = trimmed.split('/')
  return segments[segments.length - 1] ?? trimmed
}

export function getProductImagePublicUrl(storageKey: string | null | undefined) {
  const trimmed = typeof storageKey === 'string' ? storageKey.trim() : ''
  if (!trimmed) return null

  const supabase = createPublicSupabaseClient()
  if (!supabase) return null

  const { data } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(trimmed)

  return data.publicUrl || null
}

export function getProductImageDisplay(imageStorageKey: string | null | undefined, imageThumbnailStorageKey: string | null | undefined) {
  const trimmedOriginalKey = typeof imageStorageKey === 'string' ? imageStorageKey.trim() : ''
  const trimmedThumbKey = typeof imageThumbnailStorageKey === 'string' ? imageThumbnailStorageKey.trim() : ''
  if (trimmedOriginalKey || trimmedThumbKey) {
    return {
      imageNames: trimmedOriginalKey ? [getProductImageFileName(trimmedOriginalKey)] : [],
      imageStorageKey: trimmedOriginalKey || null,
      imageThumbnailStorageKey: trimmedThumbKey || null,
      originalUrl: getProductImagePublicUrl(trimmedOriginalKey),
      thumbnailUrl: getProductImagePublicUrl(trimmedThumbKey),
    }
  }

  return {
    imageNames: [],
    imageStorageKey: null,
    imageThumbnailStorageKey: null,
    originalUrl: null,
    thumbnailUrl: null,
  }
}

export async function validateProductImageUpload(file: File) {
  if (!file.type.startsWith('image/')) {
    return 'อัปโหลดได้เฉพาะไฟล์รูปภาพ'
  }
  if (file.size <= 0 || file.size > PRODUCT_IMAGE_MAX_UPLOAD_BYTES) {
    return 'รูปสินค้าต้องมีขนาดไม่เกิน 20 MB'
  }

  const sourceUrl = window.URL.createObjectURL(file)
  try {
    const image = await loadImage(sourceUrl)
    if (image.width * image.height > PRODUCT_IMAGE_MAX_UPLOAD_PIXELS) {
      return 'รูปสินค้าต้องมีพื้นที่ภาพไม่เกิน 25 ล้านพิกเซล'
    }
    return null
  } catch {
    return 'ไม่สามารถอ่านไฟล์รูปสินค้าได้'
  } finally {
    window.URL.revokeObjectURL(sourceUrl)
  }
}

function loadImage(sourceUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('โหลดรูปภาพเพื่อเตรียมไฟล์อัปโหลดไม่สำเร็จ'))
    image.src = sourceUrl
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('แปลงรูปภาพไม่สำเร็จ'))
        return
      }
      resolve(blob)
    }, 'image/webp', quality)
  })
}

async function resizeImageFile(file: File, options: { height: number; quality: number; width: number }) {
  if (typeof window === 'undefined') {
    throw new Error('การย่อรูปภาพทำได้เฉพาะบน browser')
  }

  const sourceUrl = window.URL.createObjectURL(file)
  try {
    const image = await loadImage(sourceUrl)
    const scale = Math.min(options.width / image.width, options.height / image.height)
    const targetWidth = Math.max(1, Math.round(image.width * scale))
    const targetHeight = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('สร้าง image canvas ไม่สำเร็จ')
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight)
    const blob = await canvasToBlob(canvas, options.quality)
    const nextName = `${file.name.replace(/\.[^.]+$/, '')}.webp`
    return new File([blob], nextName, { type: 'image/webp' })
  } finally {
    window.URL.revokeObjectURL(sourceUrl)
  }
}

export async function prepareProductImageUploadAssets(file: File) {
  const original = await resizeImageFile(file, {
    height: PRODUCT_IMAGE_ORIGINAL_MAX_SIZE,
    quality: PRODUCT_IMAGE_ORIGINAL_QUALITY,
    width: PRODUCT_IMAGE_ORIGINAL_MAX_SIZE,
  })
  const thumbnail = await resizeImageFile(file, {
    height: PRODUCT_IMAGE_THUMBNAIL_SIZE,
    quality: PRODUCT_IMAGE_THUMBNAIL_QUALITY,
    width: PRODUCT_IMAGE_THUMBNAIL_SIZE,
  })

  return { original, thumbnail }
}
