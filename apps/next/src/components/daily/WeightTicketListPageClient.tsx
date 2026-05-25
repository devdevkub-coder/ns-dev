'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ClipboardList, Eye, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/utils'
import {
  branchOptions,
  formatDateDisplay,
  formatWeight,
  loadStoredWeightTickets,
  sampleWeightTickets,
  statusLabels,
  typeLabels,
  type StoredWeightTicket,
  type WeightTicketStatus,
  type WeightTicketType,
} from '@/lib/weight-tickets'

type TypeFilter = 'all' | WeightTicketType
type StatusFilter = 'all' | WeightTicketStatus

const pageSize = 10

const statusOptions: { label: string; value: StatusFilter }[] = [
  { label: 'ทุกสถานะ', value: 'all' },
  { label: statusLabels.received, value: 'received' },
  { label: statusLabels.delivered, value: 'delivered' },
  { label: statusLabels.partially_billed, value: 'partially_billed' },
  { label: statusLabels.billed, value: 'billed' },
  { label: statusLabels.cancelled, value: 'cancelled' },
]

export function WeightTicketListPageClient() {
  const [tickets, setTickets] = useState<StoredWeightTicket[]>([])
  const [branches, setBranches] = useState(branchOptions)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [selectedTicket, setSelectedTicket] = useState<StoredWeightTicket | null>(null)

  useEffect(() => {
    const storedTickets = loadStoredWeightTickets()
    setTickets(storedTickets.length > 0 ? storedTickets : sampleWeightTickets)

    let cancelled = false
    async function loadBranches() {
      try {
        const response = await fetch('/api/branches')
        if (!response.ok) return
        const data = await response.json() as { branches?: Array<{ code?: string | null; id: string; name: string }> }
        const nextBranches = (data.branches ?? []).map((branch) => ({
          code: branch.code ?? undefined,
          description: branch.code ? `รหัสสาขา ${branch.code}` : undefined,
          id: branch.id,
          label: branch.name,
        }))
        if (!cancelled && nextBranches.length) setBranches(nextBranches)
      } catch {
        // Keep fallback options if auth or network is unavailable.
      }
    }
    void loadBranches()

    return () => {
      cancelled = true
    }
  }, [])

  const filteredTickets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return tickets.filter((ticket) => {
      const matchesQuery = !normalizedQuery || [
        ticket.documentNo,
        ticket.partyName,
        ticket.branchName,
        ticket.vehicleNo,
        ticket.lines.map((line) => line.productName).join(' '),
        ticket.lines.map((line) => line.impurityName).join(' '),
      ].join(' ').toLowerCase().includes(normalizedQuery)
      const matchesType = typeFilter === 'all' || ticket.type === typeFilter
      const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter
      const matchesBranch = branchFilter === 'all' || ticket.branchId === branchFilter
      const matchesFrom = !dateFrom || ticket.documentDate >= dateFrom
      const matchesTo = !dateTo || ticket.documentDate <= dateTo
      return matchesQuery && matchesType && matchesStatus && matchesBranch && matchesFrom && matchesTo
    })
  }, [branchFilter, dateFrom, dateTo, query, statusFilter, tickets, typeFilter])

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pagedTickets = filteredTickets.slice((safePage - 1) * pageSize, safePage * pageSize)
  const activeFilters = Boolean(query || typeFilter !== 'all' || statusFilter !== 'all' || branchFilter !== 'all' || dateFrom || dateTo)

  function clearFilters() {
    setQuery('')
    setTypeFilter('all')
    setStatusFilter('all')
    setBranchFilter('all')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              WTI / WTO
            </div>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">รายการใบรับ-ส่งของ</h2>
            <p className="mt-1 text-sm text-slate-500">
              ค้นหาใบรับของ WTI และใบส่งของ WTO เพื่อเปิดรายละเอียดหรือใช้เลือกเอกสารไปออกบิล
            </p>
          </div>
          <Button asChild>
            <Link href="/daily/weight-tickets">
              <Plus className="mr-2 size-4" />
              ชั่งสินค้า / รับ-ส่งของ
            </Link>
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(16rem,1fr)_10rem_10rem_12rem_11rem_11rem_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="ค้นหาเลขที่, ผู้ขาย/ลูกค้า, ทะเบียนรถ, สินค้า"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
            />
          </label>
          <Select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value as TypeFilter); setPage(1) }}>
            <option value="all">ทุกประเภท</option>
            <option value="WTI">ใบรับของ WTI</option>
            <option value="WTO">ใบส่งของ WTO</option>
          </Select>
          <Select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); setPage(1) }}>
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
          <Select value={branchFilter} onChange={(event) => { setBranchFilter(event.target.value); setPage(1) }}>
            <option value="all">ทุกสาขา</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.label}</option>)}
          </Select>
          <DatePickerInput value={dateFrom} onChange={(value) => { setDateFrom(value); setPage(1) }} />
          <DatePickerInput value={dateTo} onChange={(value) => { setDateTo(value); setPage(1) }} />
          {activeFilters ? (
            <Button type="button" variant="secondary" onClick={clearFilters}>ล้างตัวกรอง</Button>
          ) : (
            <Button disabled type="button" variant="secondary">ล้างตัวกรอง</Button>
          )}
        </div>
      </Card>

      <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>พบทั้งหมด {filteredTickets.length.toLocaleString('th-TH')} รายการ</div>
        <div className="flex items-center gap-2">
          <Button disabled={safePage <= 1} size="xs" type="button" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</Button>
          <span>หน้า {safePage} / {totalPages}</span>
          <Button disabled={safePage >= totalPages} size="xs" type="button" variant="outline" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>ถัดไป</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-100 text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-3 py-3 text-left">เลขที่</th>
                <th className="px-3 py-3 text-left">ประเภท</th>
                <th className="px-3 py-3 text-left">วันที่/เวลา</th>
                <th className="px-3 py-3 text-left">Supplier/Customer</th>
                <th className="px-3 py-3 text-left">สาขา</th>
                <th className="px-3 py-3 text-left">ทะเบียนรถ</th>
                <th className="px-3 py-3 text-right">น้ำหนักสุทธิ</th>
                <th className="px-3 py-3 text-left">สถานะ</th>
                <th className="px-3 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedTickets.map((ticket) => (
                <tr className="hover:bg-slate-50" key={ticket.id}>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-900">{ticket.documentNo}</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span className={cn('rounded-md px-2 py-1 text-xs font-semibold', ticket.type === 'WTI' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800')}>
                      {typeLabels[ticket.type]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDateDisplay(ticket.documentDate)}</td>
                  <td className="px-3 py-3 text-slate-900">{ticket.partyName}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{ticket.branchName}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{ticket.vehicleNo}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-slate-900">{formatWeight(ticket.totals.netWeight)} กก.</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{statusLabels[ticket.status]}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <Button size="xs" type="button" variant="outline" onClick={() => setSelectedTicket(ticket)}>
                      <Eye className="mr-1 size-3" />
                      รายละเอียด
                    </Button>
                  </td>
                </tr>
              ))}
              {pagedTickets.length === 0 ? (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-500" colSpan={9}>ยังไม่มีรายการตามเงื่อนไข</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={Boolean(selectedTicket)} onOpenChange={(open) => setSelectedTicket(open ? selectedTicket : null)}>
        <DialogContent className="max-w-4xl">
          {selectedTicket ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ClipboardList className="size-5" />
                  {selectedTicket.documentNo}
                </DialogTitle>
                <DialogDescription>
                  {typeLabels[selectedTicket.type]} · {selectedTicket.partyName} · {statusLabels[selectedTicket.status]}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-4">
                <DetailMetric label="สาขา" value={selectedTicket.branchName} />
                <DetailMetric label="ทะเบียนรถ" value={selectedTicket.vehicleNo} />
                <DetailMetric label="วันที่" value={formatDateDisplay(selectedTicket.documentDate)} />
                <DetailMetric label="รูปภาพ" value={`${selectedTicket.imageCount} รูป`} />
              </div>
              <div className="overflow-hidden rounded-md border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">สินค้า</th>
                      <th className="px-3 py-2 text-right">รูป</th>
                      <th className="px-3 py-2 text-right">Gross</th>
                      <th className="px-3 py-2 text-right">หัก</th>
                      <th className="px-3 py-2 text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedTicket.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">{line.productName}</div>
                          {line.impurityName ? (
                            <div className="mt-0.5 text-xs text-slate-500">สิ่งเจือปน: {line.impurityName}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{line.imageCount ?? 0} รูป</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatWeight(line.grossWeightValue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatWeight(line.deductionWeight)}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{formatWeight(line.netWeight)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedTicket.remark ? <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">{selectedTicket.remark}</div> : null}
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setSelectedTicket(null)}>ปิด</Button>
                <Button asChild>
                  <Link href={selectedTicket.type === 'WTI' ? '/purchase/bills' : '/sales/bills'}>
                    {selectedTicket.type === 'WTI' ? 'ไปบิลรับซื้อ' : 'ไปบิลขาย'}
                  </Link>
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-medium text-slate-900">{value}</div>
    </div>
  )
}
