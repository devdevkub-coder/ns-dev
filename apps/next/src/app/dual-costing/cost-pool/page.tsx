import type { Metadata } from 'next'
import { CostPoolPageClient } from '@/components/dual-costing/CostPoolPageClient'

export const metadata: Metadata = {
  title: 'Cost Pool | NS Scrap ERP',
}

export default function CostPoolPage() {
  return <CostPoolPageClient />
}
