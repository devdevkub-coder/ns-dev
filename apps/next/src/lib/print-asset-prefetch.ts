/**
 * Browser-side prefetch helpers for the corporate print path.
 *
 * Why this exists:
 * Every printable form (weight ticket, sales/purchase bill, receipt voucher,
 * expense, payment approval, PO) opens a fresh popup window that must load the
 * Noto Sans Thai webfonts and the company logo before `prepareCorporatePrintLayout`
 * can paginate the document. On the first print of a session, or whenever the
 * popup's storage partition does not share the opener's HTTP cache, this blocks
 * the user for hundreds of milliseconds while assets stream in.
 *
 * These helpers let the page that hosts the print button warm the browser cache
 * on hover/focus so that by the time the user clicks, the popup's asset
 * requests are served from cache. Visual output, contracts, and error paths
 * are unchanged — only the latency of the asset fetch improves.
 *
 * Design note (per AGENTS.md cache rules):
 * - The font preload is L0 (static asset with stable URL).
 * - The logo preload is L0 (asset served from a content-addressed storage key
 *   returned by `/api/admin/company-profile`). We only warm the browser cache;
 *   we never read the bytes into JavaScript memory.
 * - The company profile payload cache below is a tiny in-memory TTL cache for
 *   the form-shape data needed by every print builder. Source of truth remains
 *   the `/api/admin/company-profile` API. Cache TTL is short (30s) so a user
 *   who edits the profile and immediately reprints always reads fresh data.
 *   No PII, no business facts, no financial/stock state — only the public
 *   company header used to render print forms. It is intentionally not shared
 *   across users (in-memory per tab) and is invalidated by TTL only.
 */

import { z } from 'zod'
import { readJsonResponse } from '@/lib/api-client'
import { companyProfileResponseSchema } from '@/lib/company-profile'

/**
 * Extended schema that some print modules use locally. We keep the same shape
 * here so cached payloads are interchangeable with freshly-fetched ones.
 */
export const companyProfilePrintPayloadSchema = z.object({
  ...companyProfileResponseSchema.shape,
  selectedBranchName: z.string().nullable().default(null),
})

export type CompanyProfilePrintPayload = z.infer<typeof companyProfilePrintPayloadSchema>

/** Cache TTL: short so an edited profile is picked up on the next print. */
const COMPANY_PROFILE_CACHE_TTL_MS = 30_000

type ProfileCacheEntry = {
  payload: CompanyProfilePrintPayload
  expiresAt: number
}

let profileCache: ProfileCacheEntry | null = null
let inFlightProfileRequest: Promise<CompanyProfilePrintPayload> | null = null

/** Track whether we have already preloaded the fonts in this tab. */
let fontsPreloaded = false

/**
 * Warm the browser font cache for the Noto Sans Thai Regular + Bold faces that
 * `prepareCorporatePrintLayout` waits on. Idempotent: subsequent calls resolve
 * immediately once the fonts are already loaded for this document.
 *
 * Safe to call on hover/focus of a print button. Failures are swallowed so a
 * font issue never breaks the host page; the popup still has its own
 * `waitForPrintAssets` fallback that will retry and surface a real error.
 */
export function prefetchPrintFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return Promise.resolve()
  const fonts = document.fonts
  if (fontsPreloaded) return Promise.resolve()
  try {
    const regular = fonts.load("400 12px 'Noto Sans Thai'", 'กข123')
    const bold = fonts.load("700 12px 'Noto Sans Thai'", 'กข123')
    const ready = Promise.all([regular, bold]).then(() => {
      fontsPreloaded = true
    })
    // Do not let a font preload rejection break the host page.
    ready.catch(() => {
      fontsPreloaded = false
    })
    return ready
  } catch {
    return Promise.resolve()
  }
}

/**
 * Fetch the company profile payload used by every print builder and cache it
 * briefly so a rapid succession of prints (or a hover → click) does not hit
 * the API twice. Same shape as the raw API response.
 *
 * Deduplicates concurrent requests via `inFlightProfileRequest`.
 */
export async function fetchCompanyProfileForPrint(branchId?: string | null): Promise<CompanyProfilePrintPayload> {
  const now = Date.now()
  if (profileCache && profileCache.expiresAt > now) {
    return profileCache.payload
  }
  if (inFlightProfileRequest) {
    return inFlightProfileRequest
  }
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
  inFlightProfileRequest = (async () => {
    const response = await fetch(`/api/admin/company-profile${query}`, { cache: 'no-store' })
    const payload = await readJsonResponse(response, companyProfilePrintPayloadSchema, 'โหลดข้อมูลบริษัทไม่สำเร็จ')
    profileCache = { payload, expiresAt: Date.now() + COMPANY_PROFILE_CACHE_TTL_MS }
    return payload
  })()
  try {
    return await inFlightProfileRequest
  } finally {
    inFlightProfileRequest = null
  }
}

/**
 * Synchronously return the cached profile payload if fresh, otherwise null.
 * Useful for print builders that want to skip a refetch when the host page
 * already warmed the cache on hover.
 */
export function peekCachedCompanyProfileForPrint(): CompanyProfilePrintPayload | null {
  if (profileCache && profileCache.expiresAt > Date.now()) {
    return profileCache.payload
  }
  return null
}

/**
 * Preload the company logo into the browser HTTP cache by creating an Image
 * element whose src points at the logo URL returned by the profile API. No-op
 * if the profile has no logo. Failures are swallowed (the popup will fall
 * back to its own load/error handling).
 */
function preloadLogoImage(logoUrl: string | null | undefined): void {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return
  if (!logoUrl) return
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = logoUrl
    // Discard load/error: we only want to warm the cache.
  } catch {
    /* ignore */
  }
}

/**
 * Warm fonts + company profile + logo in one call. Intended for hover/focus
 * handlers on print buttons. Never throws — a prefetch failure must not break
 * the host page; the actual print flow will retry and report errors.
 */
export async function prefetchPrintAssets(branchId?: string | null): Promise<void> {
  await Promise.allSettled([
    prefetchPrintFonts(),
    (async () => {
      try {
        const payload = await fetchCompanyProfileForPrint(branchId)
        preloadLogoImage(payload.profile.logoUrl)
      } catch {
        /* swallow — print flow will refetch and surface the real error */
      }
    })(),
  ])
}

/**
 * Invalidate the in-memory profile cache. Call after the user saves a profile
 * change on the host page so the next print sees fresh data without waiting
 * for TTL expiry.
 */
export function invalidateCompanyProfileForPrintCache(): void {
  profileCache = null
}
