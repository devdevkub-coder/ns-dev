import { getErrorMessage } from '@/lib/api-client'

async function fetchWeightTicketPdf(documentNo: string): Promise<Blob> {
  const response = await fetch(`/api/daily/weight-tickets/${encodeURIComponent(documentNo)}/pdf`, {
    credentials: 'same-origin',
  })
  if (!response.ok) {
    let message = 'ดาวน์โหลด PDF ไม่สำเร็จ'
    try {
      const body: unknown = await response.json()
      message = getErrorMessage(body, message)
    } catch {
      // Keep the stable user-facing error when the server did not return JSON.
    }
    throw new Error(message)
  }
  return response.blob()
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
