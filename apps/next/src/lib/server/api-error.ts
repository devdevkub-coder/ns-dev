import { NextResponse } from 'next/server'
import { z } from 'zod'

function isAuthContextError(caught: unknown): caught is Error & { status: number } {
  return caught instanceof Error && caught.name === 'AuthContextError' && 'status' in caught && typeof caught.status === 'number'
}

function isPrismaError(caught: unknown): caught is Error & { code: string; meta?: Record<string, unknown> } {
  return caught instanceof Error && 'code' in caught && typeof caught.code === 'string' && caught.code.startsWith('P')
}

function isTradingAllocationSalesLineConflict(caught: Error & { meta?: Record<string, unknown> }) {
  const target = caught.meta?.target
  const targetFields = Array.isArray(target) ? target.map(String) : typeof target === 'string' ? [target] : []
  const constraint = String(caught.meta?.constraint ?? '')
  return (
    targetFields.includes('sales_bill_id')
    && targetFields.includes('sales_line_no')
  ) || constraint === 'uq_trading_allocation_facts_active_sales_line'
}

function errorCodeForStatus(status: number) {
  if (status === 401) return 'AUTH_REQUIRED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'CONFLICT'
  if (status >= 500) return 'SERVER_ERROR'
  return 'BAD_REQUEST'
}

export function apiErrorResponse(caught: unknown, fallback: string, status = 500) {
  if (isAuthContextError(caught)) {
    return NextResponse.json({ code: errorCodeForStatus(caught.status), error: caught.message }, { status: caught.status })
  }

  if (caught instanceof z.ZodError) {
    return NextResponse.json({
      code: 'VALIDATION_ERROR',
      error: 'ข้อมูลไม่ถูกต้อง',
      fieldErrors: caught.flatten().fieldErrors,
      issues: caught.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.join('.'),
      })),
    }, { status: 400 })
  }

  if (isPrismaError(caught)) {
    if (caught.code === 'P2002') {
      if (isTradingAllocationSalesLineConflict(caught)) {
        return NextResponse.json({
          code: 'DEAL_MARGIN_DATA_INTEGRITY',
          error: 'พบ Allocation ซ้ำใน Sales Bill เดียวกันและ Sales Line เดิม กรุณาตรวจสอบ Allocation ก่อนบันทึก',
        }, { status: 409 })
      }
      return NextResponse.json({ code: 'CONFLICT', error: 'ข้อมูลซ้ำกับรายการที่มีอยู่แล้ว' }, { status: 409 })
    }
    if (caught.code === 'P2025') {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบข้อมูลที่ต้องการ' }, { status: 404 })
    }

    return NextResponse.json({ code: 'DATABASE_ERROR', error: fallback }, { status: 500 })
  }

  const safeMessage = status >= 500 ? fallback : caught instanceof Error ? caught.message : fallback
  return NextResponse.json({ code: errorCodeForStatus(status), error: safeMessage }, { status })
}
