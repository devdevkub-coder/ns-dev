import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'คู่มือระบบ | NS Scrap ERP',
}

export default function SystemManualIndexPage() {
  redirect('/admin/system-manual/po-sell')
}
