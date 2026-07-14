import type { Metadata } from 'next'
import { MoneyMovementPageClient } from '@/components/daily/MoneyMovementPageClient'

export const metadata: Metadata = {
  title: 'รับเงินลูกค้า | NS Scrap ERP',
}

type SalesReceiptsPageProps = {
  searchParams?: Promise<{ tab?: string }>
}

export default async function SalesReceiptsPage({ searchParams }: SalesReceiptsPageProps) {
  const params = await searchParams
  const initialTab = params?.tab === 'history' ? 'history' : 'entry'
  return <MoneyMovementPageClient initialTab={initialTab} mode="receipt" />
}
