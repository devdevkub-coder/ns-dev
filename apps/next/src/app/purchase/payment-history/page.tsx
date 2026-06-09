import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'ประวัติการจ่ายเงิน | NS Scrap ERP',
}

export default function PurchasePaymentHistoryPage() {
  redirect('/purchase/payments?tab=history')
}
