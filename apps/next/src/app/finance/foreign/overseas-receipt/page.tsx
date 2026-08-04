import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Overseas Receipt | NS Scrap ERP',
}

export default function OverseasReceiptPage() {
  redirect('/sales/receipts')
}
