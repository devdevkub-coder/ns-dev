'use client'

import { formatWeight, type WeightTicketRecord, typeLabels } from '@/lib/weight-tickets'

export function buildWeightTicketDetailUrl(documentNo: string) {
  if (typeof window === 'undefined') return `/daily/weight-ticket-list/${encodeURIComponent(documentNo)}`
  return new URL(`/daily/weight-ticket-list/${encodeURIComponent(documentNo)}`, window.location.origin).toString()
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('th-TH', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function buildWeightTicketShareMessage(ticket: Pick<WeightTicketRecord, 'branchName' | 'createdAt' | 'documentNo' | 'partyName' | 'totals' | 'type'>) {
  const documentUrl = buildWeightTicketDetailUrl(ticket.documentNo)
  const partyLabel = ticket.type === 'WTI' ? 'ผู้ขาย' : 'ลูกค้า'
  return [
    `${typeLabels[ticket.type]} ${ticket.documentNo}`,
    `${partyLabel}: ${ticket.partyName}`,
    `สาขา: ${ticket.branchName}`,
    `วันที่/เวลาเอกสาร: ${formatDateTime(ticket.createdAt)}`,
    `หักภาชนะ: ${formatWeight(ticket.totals.containerDeductionWeight)} กก.`,
    `หักสิ่งเจือปน: ${formatWeight(ticket.totals.deductionWeight)} กก.`,
    `น้ำหนักสุทธิ: ${formatWeight(ticket.totals.netWeight)} กก.`,
    documentUrl,
  ].join('\n')
}

export function openWeightTicketLineShare(ticket: Pick<WeightTicketRecord, 'branchName' | 'createdAt' | 'documentNo' | 'partyName' | 'totals' | 'type'>) {
  if (typeof window === 'undefined') return

  const lineShareUrl = `https://line.me/R/msg/text/?${encodeURIComponent(buildWeightTicketShareMessage(ticket))}`
  const nextWindow = window.open(lineShareUrl, '_blank', 'noopener,noreferrer')

  if (!nextWindow) {
    window.location.href = lineShareUrl
  }
}
