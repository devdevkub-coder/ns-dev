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
import { ApiError, readJsonResponse } from '@/lib/api-client'
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

/** In-memory cache, keyed by branch so different branches never mix. */
const profileCacheByBranch = new Map<string, ProfileCacheEntry>()
const inFlightProfileByBranch = new Map<string, Promise<CompanyProfilePrintPayload>>()

function profileCacheKey(branchId?: string | null): string {
  return branchId ? `b:${encodeURIComponent(branchId)}` : 'default'
}

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
 * Deduplicates concurrent requests via `inFlightProfileByBranch`, so a print
 * handler can start `prefetchPrintAssets(branchId)` while its detail fetch
 * runs and the builder's own `fetchCompanyProfileForPrint` call (same page
 * context, same branch key) will await that same in-flight request instead of
 * issuing a second API round trip.
 */
export async function fetchCompanyProfileForPrint(branchId?: string | null): Promise<CompanyProfilePrintPayload> {
  const key = profileCacheKey(branchId)
  const now = Date.now()
  const cached = profileCacheByBranch.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.payload
  }
  const inFlight = inFlightProfileByBranch.get(key)
  if (inFlight) {
    return inFlight
  }
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
  const request = (async () => {
    const response = await fetch(`/api/admin/company-profile${query}`, { cache: 'no-store' })
    const payload = await readJsonResponse(response, companyProfilePrintPayloadSchema, 'โหลดข้อมูลบริษัทไม่สำเร็จ')
    profileCacheByBranch.set(key, { payload, expiresAt: Date.now() + COMPANY_PROFILE_CACHE_TTL_MS })
    return payload
  })()
  inFlightProfileByBranch.set(key, request)
  try {
    return await request
  } finally {
    inFlightProfileByBranch.delete(key)
  }
}

/**
 * Synchronously return the cached profile payload if fresh, otherwise null.
 * Useful for print builders that want to skip a refetch when the host page
 * already warmed the cache on hover.
 */
export function peekCachedCompanyProfileForPrint(branchId?: string | null): CompanyProfilePrintPayload | null {
  const cached = profileCacheByBranch.get(profileCacheKey(branchId))
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload
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
  profileCacheByBranch.clear()
  inFlightProfileByBranch.clear()
}

// ---------------------------------------------------------------------------
// Weight-ticket print prefetch (A+B optimization)
// ---------------------------------------------------------------------------
//
// Why: when the user clicks "พิมพ์" on a WTI/WTO row, `handlePrintTicket` opens
// the popup, fetches the full ticket detail (which includes per-image signed
// URLs), then opens the print window which has to download each attachment
// image from its signed URL before `prepareCorporatePrintLayout` can paginate.
// On hover we can warm both: fetch the ticket detail into memory, and preload
// every attachment image via `new Image()` so the popup's image requests are
// served from the browser HTTP cache.
//
// Design notes (per AGENTS.md cache rules):
// - Ticket detail is a read-only snapshot used only while the hover request is
//   in flight. Source of truth remains the API. We do not retain the ticket in
//   browser memory because it contains scoped transaction facts and signed
//   image URLs; only the browser's normal HTTP cache is warmed for the print
//   derivative.
// - Attachment image preload is L0 asset warming only. The signed print URL
//   is the exact same URL the popup would request anyway; we never mint a new
//   URL, never store bytes in JS memory, and never bypass the storage privacy
//   contract. Only the print derivative is preloaded — thumbnails already have
//   their own preview path and are never a formal print fallback.
// - Failures are swallowed by the prefetch path; the print flow always
//   refetches and surfaces the real error.

import { type WeightTicketRecord, getWeightTicket, decodeStoredImageAsset } from '@/lib/weight-tickets'

const inFlightTicketById = new Map<string, {
  promise: Promise<WeightTicketRecord | null>
  token: symbol
}>()
let weightTicketPrintCacheGeneration = 0

/**
 * Prefetch the ticket's signed print derivative URLs and preload every
 * attachment image into the browser HTTP cache. Intended for hover/focus on a
 * WTI/WTO row. Never throws — failures are swallowed and the print flow will
 * fetch a fresh ticket on click.
 */
export async function prefetchWeightTicketForPrint(ticketId: string): Promise<void> {
  // Dedupe concurrent prefetches for the same id.
  const existing = inFlightTicketById.get(ticketId)
  if (existing) {
    await existing.promise
    return
  }
  const generationAtStart = weightTicketPrintCacheGeneration
  const token = Symbol(ticketId)
  const request = (async () => {
    try {
      // Preload the purpose-specific print derivative. A queued/missing print
      // derivative is allowed to fail this best-effort hover prefetch; the
      // click-time request will report the strict readiness error.
      const ticket = await getWeightTicket(ticketId, { includeHistory: false, includePrintImages: true })
      // A save/realtime invalidation may have happened while this request was
      // in flight. Do not warm signed URLs from a stale response.
      if (weightTicketPrintCacheGeneration === generationAtStart) {
        preloadWeightTicketAttachmentImages(ticket)
      }
      return ticket
    } catch {
      // A queued/missing print derivative is expected to fail this best-effort
      // hover prefetch; the click-time print request reports the strict
      // readiness error after the background worker has had a chance to drain.
      return null
    } finally {
      // An invalidated request must not delete a newer request that replaced
      // it after the invalidation.
      if (inFlightTicketById.get(ticketId)?.token === token) {
        inFlightTicketById.delete(ticketId)
      }
    }
  })()
  inFlightTicketById.set(ticketId, { promise: request, token })
  await request
}

const WEIGHT_TICKET_PRINT_READY_RETRY_DELAYS_MS = [500, 1_000, 2_000] as const

/**
 * Fetch the current ticket for formal print. A click may reuse only a
 * concurrent hover/focus request; completed ticket snapshots are never kept
 * in browser memory, and an invalidation during the await forces a fresh
 * request. The worker is kicked by the request that reports a queued
 * derivative, so retry only that typed readiness error for a bounded period;
 * all other errors remain immediately visible.
 */
export async function getWeightTicketForPrint(ticketId: string): Promise<WeightTicketRecord> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const generationAtStart = weightTicketPrintCacheGeneration
      const inFlight = inFlightTicketById.get(ticketId)
      if (inFlight) {
        const prefetchedTicket = await inFlight.promise
        if (prefetchedTicket && weightTicketPrintCacheGeneration === generationAtStart) {
          return prefetchedTicket
        }
      }
      return await getWeightTicket(ticketId, { includePrintImages: true })
    } catch (caught) {
      const delayMs = caught instanceof ApiError && caught.code === 'WEIGHT_TICKET_PRINT_IMAGE_NOT_READY'
        ? WEIGHT_TICKET_PRINT_READY_RETRY_DELAYS_MS[attempt]
        : undefined
      if (delayMs == null) throw caught
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

/**
 * Preload every attachment image of a ticket into the browser HTTP cache by
 * creating an `Image` element for each signed URL. Best-effort: failures are
 * swallowed because the popup will retry and report errors via
 * `waitForPrintAssets`.
 */
export function preloadWeightTicketAttachmentImages(ticket: WeightTicketRecord): void {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return
  try {
    // Decode every stored image reference and preload the signed URL of each
    // printable asset. Different raw values can resolve to the same signed URL,
    // so dedupe by URL before warming the HTTP cache.
    const rawValues = [...ticket.vehicleImageNames, ...ticket.imageNames]
    const seen = new Set<string>()
    for (const rawValue of rawValues) {
      const asset = decodeStoredImageAsset(rawValue)
      const url = asset.printUrl ?? null
      if (!url) continue
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue
      } catch {
        continue
      }
      if (seen.has(url)) continue
      seen.add(url)
      const img = new Image()
      img.decoding = 'async'
      img.src = url
      // Discard load/error: we only want to warm the HTTP cache.
    }
  } catch {
    /* ignore — print flow will retry */
  }
}

/**
 * Invalidate an in-flight ticket prefetch for a single id, or all tickets when
 * no id is given. Call after the user edits/cancels a ticket on the host page
 * so a stale in-flight response cannot warm the browser HTTP cache.
 */
export function invalidateWeightTicketForPrintCache(ticketId?: string): void {
  weightTicketPrintCacheGeneration += 1
  if (ticketId) {
    inFlightTicketById.delete(ticketId)
    return
  }
  inFlightTicketById.clear()
}

// ---------------------------------------------------------------------------
// Generic document-detail prefetch (hover → click)
// ---------------------------------------------------------------------------
//
// Some print flows (sales/purchase bills) only fetch the full document detail
// from the API after the user clicks "พิมพ์", so the popup sits on its loading
// screen for the whole request (~1s remote round trip). This helper lets the
// host page prefetch that detail on hover/focus of the print button; the click
// handler then reads it synchronously via `peekPrintDocumentDetail` and skips
// the fetch, cutting the popup wait from ~1.2s to near-instant.
//
// Design notes (per AGENTS.md cache rules):
// - Read-only snapshot of the document being printed; source of truth remains
//   the API. Short TTL (20s), deduped by in-flight promise, failures swallowed
//   (the click handler always falls back to its own fetch and surfaces the
//   real error).
// - Invalidation: host pages call `invalidatePrintDocumentDetail(docNo)` after
//   a save/cancel so an edited document is never printed from a stale
//   prefetch. A generation counter also stops an in-flight hover fetch that
//   started before the mutation from repopulating the cache afterwards.

const PRINT_DOCUMENT_DETAIL_CACHE_TTL_MS = 20_000

const printDocumentDetailCache = new Map<string, { payload: unknown; expiresAt: number }>()
const inFlightPrintDocumentDetail = new Map<string, Promise<unknown>>()
let printDocumentDetailGeneration = 0

/**
 * Prefetch a print document's detail payload into a short-lived cache. Returns
 * the payload on success or null on failure — never throws. Idempotent within
 * the TTL and deduped against concurrent calls for the same key.
 */
export async function prefetchPrintDocumentDetail<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
): Promise<T | null> {
  const cached = peekPrintDocumentDetail<T>(cacheKey)
  if (cached) return cached
  const existing = inFlightPrintDocumentDetail.get(cacheKey)
  if (existing) return existing as Promise<T>
  const generationAtStart = printDocumentDetailGeneration
  const request = (async () => {
    try {
      const payload = await fetcher()
      // If the document was saved/cancelled while this fetch was in flight,
      // drop the stale result instead of caching it.
      if (printDocumentDetailGeneration === generationAtStart) {
        printDocumentDetailCache.set(cacheKey, { payload, expiresAt: Date.now() + PRINT_DOCUMENT_DETAIL_CACHE_TTL_MS })
      }
      return payload
    } catch {
      return null
    } finally {
      inFlightPrintDocumentDetail.delete(cacheKey)
    }
  })()
  inFlightPrintDocumentDetail.set(cacheKey, request)
  return request
}

/**
 * Synchronously read a fresh prefetched document detail, or null. The print
 * handler uses this to skip its own fetch when the user hovered first.
 */
export function peekPrintDocumentDetail<T>(cacheKey: string): T | null {
  const entry = printDocumentDetailCache.get(cacheKey)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    printDocumentDetailCache.delete(cacheKey)
    return null
  }
  return entry.payload as T
}

/**
 * Invalidate the prefetched document detail for one key, or all keys when no
 * key is given. Call after the host page saves/cancels a document so the next
 * print re-reads fresh data. Also bumps the generation counter so any in-flight
 * prefetch that started before the mutation cannot repopulate the cache.
 */
export function invalidatePrintDocumentDetail(cacheKey?: string): void {
  printDocumentDetailGeneration += 1
  if (cacheKey) {
    printDocumentDetailCache.delete(cacheKey)
    inFlightPrintDocumentDetail.delete(cacheKey)
    return
  }
  printDocumentDetailCache.clear()
  inFlightPrintDocumentDetail.clear()
}
