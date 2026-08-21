import { getErrorMessage } from '@/lib/api-client'

export async function downloadWeightTicketPdf(documentNo: string) {
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
  const blob = await response.blob()
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
