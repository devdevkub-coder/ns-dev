import type { Metadata } from 'next'
import { SupplierTrackingPageClient } from '@/components/purchase-flow/SupplierTrackingPageClient'

export const metadata: Metadata = {
  title: 'ติดตามผู้ขาย | NS Scrap ERP',
}

export default function SupplierTrackingPage() {
  return <SupplierTrackingPageClient />
}
