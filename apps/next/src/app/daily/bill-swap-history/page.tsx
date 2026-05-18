import type { Metadata } from 'next'
import { BillSwapHistoryPageClient } from '@/components/daily/BillSwapHistoryPageClient'

export const metadata: Metadata = {
  title: 'ประวัติเปลี่ยน Supplier ในบิล | NS Scrap ERP',
}

export default function BillSwapHistoryPage() {
  return <BillSwapHistoryPageClient />
}
