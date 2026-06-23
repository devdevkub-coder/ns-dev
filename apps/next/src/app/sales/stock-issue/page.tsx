import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const metadata: Metadata = {
  title: 'ไม่พบหน้า | NS Scrap ERP',
}

export default function SalesStockIssuePage() {
  notFound()
}
