import type { Metadata } from 'next'
import { ProfilePageClient } from '@/app/profile/ProfilePageClient'

export const metadata: Metadata = {
  title: 'โปรไฟล์ & บัญชีผู้ใช้งาน | NS Scrap ERP',
}

export default function ProfilePage() {
  return <ProfilePageClient />
}
