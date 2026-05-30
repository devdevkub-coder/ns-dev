import type { Metadata } from 'next'
import { PaymentApprovalPageClient } from '@/components/daily/PaymentApprovalPageClient'

export const metadata: Metadata = {
  title: 'อนุมัติจ่ายเงิน (Payment Approval) - เช็ครายการที่จะจ่าย แล้วพิมพ์ใบอนุมัติส่งให้ cashier | NS Scrap ERP',
}

export default function PaymentApprovalPage() {
  return <PaymentApprovalPageClient />
}
