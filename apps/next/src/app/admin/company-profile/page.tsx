import type { Metadata } from 'next'
import { CompanyProfilePageClient } from '@/app/admin/company-profile/CompanyProfilePageClient'

export const metadata: Metadata = {
  title: 'ข้อมูลบริษัท | NS Scrap ERP',
}

export default function CompanyProfilePage() {
  return <CompanyProfilePageClient />
}
