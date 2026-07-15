import type { Metadata } from 'next'
import { LoanContractsPageClient } from '@/components/finance-accounting/LoansEquityPageClients'

export const metadata: Metadata = {
  title: 'สัญญาสินเชื่อ / ลีสซิ่ง / BSL | NS Scrap ERP',
}

export default function LoanContractsPage() {
  return <LoanContractsPageClient />
}
