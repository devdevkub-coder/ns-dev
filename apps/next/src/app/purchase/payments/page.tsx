import type { Metadata } from 'next'
import { MoneyMovementPageClient } from '@/components/daily/MoneyMovementPageClient'

export const metadata: Metadata = {
  title: 'จ่ายเงิน Supplier | NS Scrap ERP',
}

type PurchasePaymentsPageProps = {
  searchParams?: Promise<{ tab?: string }>
}

export default async function PurchasePaymentsPage({ searchParams }: PurchasePaymentsPageProps) {
  const params = await searchParams
  const initialTab = params?.tab === 'history' ? 'history' : 'entry'
  return <MoneyMovementPageClient initialTab={initialTab} mode="payment" />
}
