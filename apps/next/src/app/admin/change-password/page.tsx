import type { Metadata } from 'next'
import { ChangePasswordPageClient } from '@/app/admin/change-password/ChangePasswordPageClient'

export const metadata: Metadata = {
  title: 'เปลี่ยน Password ของฉัน | NS Scrap ERP',
}

export default function ChangePasswordPage() {
  return <ChangePasswordPageClient />
}
