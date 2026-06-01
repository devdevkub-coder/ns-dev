import type { Metadata } from 'next'
import { WeightTicketsPageClient } from '@/components/daily/WeightTicketsPageClient'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'

export const metadata: Metadata = {
  title: 'ชั่งสินค้า / รับ-ส่งของ | NS Scrap ERP',
}

export default async function WeightTicketsPage({
  searchParams,
}: {
  searchParams?: Promise<{ id?: string | string[] }>
}) {
  const resolved = await searchParams
  const ticketId = Array.isArray(resolved?.id) ? resolved?.id[0] : resolved?.id
  const editing = Boolean(ticketId && ticketId.trim())
  return (
    <>
      <PageTitleOverride
        subtitle={editing ? 'แก้ไขได้จนกว่าจะถูกนำไปใช้กับบิลรับซื้อหรือบิลขาย' : 'ระบบจะออกเลขเอกสาร วันที่ เวลา และผู้กรอกหลังบันทึก'}
        title="ชั่งสินค้า / รับ-ส่งของ"
      />
      <WeightTicketsPageClient ticketId={ticketId ?? ''} />
    </>
  )
}
