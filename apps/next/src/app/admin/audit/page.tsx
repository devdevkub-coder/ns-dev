import type { Metadata } from 'next'
import { AuditLogPageClient } from '@/app/admin/audit/AuditLogPageClient'

export const metadata: Metadata = {
  title: 'Audit & Activity Log | NS Scrap ERP',
}

export default function AuditLogPage() {
  return <AuditLogPageClient />
}
