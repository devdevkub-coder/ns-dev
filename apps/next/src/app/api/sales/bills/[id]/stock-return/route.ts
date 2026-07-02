import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST() {
  return NextResponse.json({
    code: 'BAD_REQUEST',
    error: 'เลิกใช้ route นี้แล้ว กรุณาใช้ action รับของคืนจากฝั่ง WTO',
  }, { status: 400 })
}
