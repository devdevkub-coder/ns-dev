import type { Metadata } from 'next'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'
import { ReceiptVouchersPageClient } from '@/components/daily/ReceiptVouchersPageClient'

export const metadata: Metadata = {
  title: 'ใบสำคัญรับเงิน | NS Scrap ERP',
}

export default function ReceiptVouchersPage() {
  return (
    <>
      <PageTitleOverride
        title="ใบสำคัญรับเงิน (Receipt Voucher)"
        subtitle="ใช้ออกให้ Supplier บุคคลธรรมดาเซ็นรับเงิน (กรณีไม่มีใบเสร็จของ Supplier) — ดึงข้อมูลจากบิลซื้อ + แก้ไขส่วนที่ขาดได้ + พิมพ์ออกได้"
      />
      <ReceiptVouchersPageClient />
    </>
  )
}
