import type { Metadata } from 'next'
import { CompareMarginPageClient } from '@/components/dual-costing/CompareMarginPageClient'

export const metadata: Metadata = {
  title: 'Compare Deal vs Stock | NS Scrap ERP',
}

export default function CompareMarginPage() {
  return <CompareMarginPageClient />
}
