import type { WeightTicketRecord } from '@/lib/weight-tickets'
import { prisma } from '@/lib/server/prisma'

type WeightTicketSyncAction = 'cancel' | 'create' | 'update'

export async function syncWeightTicketToGoogleSheets(action: WeightTicketSyncAction, ticket: WeightTicketRecord & { pdfUrl?: string }) {
  try {
    const config = await prisma.system_settings.findUnique({
      where: { key: 'GOOGLE_SHEETS_WEBHOOK_URL' },
    })
    const webhookUrl = config?.value || process.env.GOOGLE_SHEETS_WEBHOOK_URL
    if (!webhookUrl) return

    const payload = {
      action,
      documentNo: ticket.documentNo,
      type: ticket.type,
      partyName: ticket.partyName,
      branchName: ticket.branchName,
      documentDate: ticket.documentDate ? new Date(ticket.documentDate).toISOString().split('T')[0] : '',
      createdAt: ticket.createdAt ? new Date(ticket.createdAt).toISOString() : new Date().toISOString(),
      grossWeight: ticket.totals.grossWeight,
      deductionWeight: ticket.totals.deductionWeight,
      netWeight: ticket.totals.netWeight,
      pdfUrl: ticket.pdfUrl || '',
    }

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((res) => {
      if (!res.ok) {
        console.error('[google-sheets-sync] failed to sync to google sheets:', res.status, res.statusText)
      }
    }).catch((err) => {
      console.error('[google-sheets-sync] fetch error:', err)
    })
  } catch (err) {
    console.error('[google-sheets-sync] unexpected error:', err)
  }
}
