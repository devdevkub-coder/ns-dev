import { MainDashboardsPageClient } from '@/components/main/MainDashboardsPageClient'

// BUG #52: key ผูกกับ ?date เพื่อให้ React remount เมื่อคลิกข้ามมาจาก Daily Report
// (หน้าทั้ง 2 render component เดียวกัน — ถ้าไม่ remount วันที่จะค้างค่าเก่า)
export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams
  return <MainDashboardsPageClient key={date ?? ''} mode="owner-daily" />
}
