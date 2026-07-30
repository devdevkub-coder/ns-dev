import type { Metadata } from 'next'
import { FcdConversionPageClient } from '@/components/finance/foreign/FcdConversionPageClient'

export const metadata: Metadata = { title: 'FCD Conversion | NS Scrap ERP' }

export default function FcdConversionPage() {
  return <FcdConversionPageClient />
}
