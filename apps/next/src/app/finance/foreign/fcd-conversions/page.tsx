import type { Metadata } from 'next'
import { Suspense } from 'react'
import { FcdConversionPageClient } from '@/components/finance/foreign/FcdConversionPageClient'

export const metadata: Metadata = { title: 'FCD Conversion | NS Scrap ERP' }

export default function FcdConversionPage() {
  return (
    <Suspense>
      <FcdConversionPageClient />
    </Suspense>
  )
}
