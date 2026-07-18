import { toDateOnly } from '@/lib/server/daily'
import type { DashboardReportFilters } from '@/lib/server/dashboard-report-contracts'

export function parseReportDate(value: string | null, fallback = new Date()) {
  const parsed = value ? new Date(value) : fallback
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

export function reportFilters(date: Date, from?: string | null, to?: string | null): DashboardReportFilters {
  const dateLabel = toDateOnly(date)
  return { date: dateLabel, from: from || dateLabel, to: to || dateLabel }
}

export function noStoreHeaders() {
  return { 'Cache-Control': 'private, no-store' }
}
