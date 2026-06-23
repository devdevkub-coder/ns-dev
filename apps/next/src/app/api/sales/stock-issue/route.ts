import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const removedStockIssueResponse = () => NextResponse.json({
  code: 'GONE',
  error: 'ยกเลิก flow เบิกออกรอบิลแล้ว ให้เปิดบิลขายจากใบส่งของ WTO โดยตรง',
}, { status: 410 })

export function GET() {
  return removedStockIssueResponse()
}

export function POST() {
  return removedStockIssueResponse()
}

export function PATCH() {
  return removedStockIssueResponse()
}
