import { getErrorMessage } from '@/lib/api-client'

const PRINT_READY_RETRY_DELAYS_MS = [500, 1_000, 2_000] as const

async function fetchWeightTicketPdf(documentNo: string): Promise<Blob> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`/api/daily/weight-tickets/${encodeURIComponent(documentNo)}/pdf`, {
      credentials: 'same-origin',
    })
    if (response.ok) return response.blob()

    let body: unknown
    let message = 'ดาวน์โหลด PDF ไม่สำเร็จ'
    try {
      body = await response.json()
      message = getErrorMessage(body, message)
    } catch {
      // Keep the stable user-facing error when the server did not return JSON.
    }

    const code = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string'
      ? body.code
      : undefined
    const delayMs = code === 'WEIGHT_TICKET_PRINT_IMAGE_NOT_READY'
      ? PRINT_READY_RETRY_DELAYS_MS[attempt]
      : undefined
    if (delayMs == null) throw new Error(message)
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs))
  }
}

export async function downloadWeightTicketPdf(documentNo: string) {
  const blob = await fetchWeightTicketPdf(documentNo)
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${documentNo}.pdf`
    anchor.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Open the exact PDF returned by the download endpoint in the print window.
 * Print and download therefore share the same server-rendered React-PDF
 * document, including its pagination and print derivatives.
 */
export async function openWeightTicketPdfPrint(documentNo: string, targetWindow: Window) {
  const blob = await fetchWeightTicketPdf(documentNo)
  const url = URL.createObjectURL(blob)
  targetWindow.location.replace(url)
  // Keep the object URL alive while the browser PDF viewer loads it. The
  // viewer owns the document after navigation; revoking immediately can
  // produce a blank print window in Chromium.
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
