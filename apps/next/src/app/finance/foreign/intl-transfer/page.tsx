import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'International Transfer | NS Scrap ERP',
}

export default function IntlTransferPage() {
  redirect('/finance/foreign/fcd-conversions')
}
