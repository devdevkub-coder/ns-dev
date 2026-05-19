import type { Metadata } from 'next'
import { MigrationToolsPageClient } from '@/app/admin/migration-tools/MigrationToolsPageClient'

export const metadata: Metadata = {
  title: 'Backup / Restore | NS Scrap ERP',
}

export default function MigrationToolsPage() {
  return <MigrationToolsPageClient />
}
