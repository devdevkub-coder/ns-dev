import type { Metadata } from 'next'
import { FcdRevaluationPageClient } from '@/components/finance/foreign/FcdRevaluationPageClient'

export const metadata: Metadata = { title: 'FCD Revaluation | NS Scrap ERP' }

export default function FcdRevaluationPage() {
  return <FcdRevaluationPageClient />
}
