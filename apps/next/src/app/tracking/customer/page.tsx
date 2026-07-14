import type { Metadata } from 'next'
import { CustomerTrackingPageClient } from '@/components/tracking/CustomerTrackingPageClient'

export const metadata: Metadata = {
  title: 'ติดตามลูกค้า | NS Scrap ERP',
}

export default function CustomerTrackingPage() {
  return <CustomerTrackingPageClient />
}
