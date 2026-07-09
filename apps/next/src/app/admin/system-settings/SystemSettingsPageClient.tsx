'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import {
  emptyMasterDataForm,
  listMasterDataRecords,
  saveMasterDataRecord,
  type MasterDataFormValues,
  type MasterDataRecord,
} from '@/lib/master-data'

type SettingKind = 'vat' | 'wht'
type SortDirection = 'asc' | 'desc'
type WhtColumnKey = 'action' | 'name' | 'ratePercent' | 'status'
type WhtSortKey = Exclude<WhtColumnKey, 'action'>

type TaxSettingConfig = {
  apiPath: string
  fallbackName: string
  kind: SettingKind
  label: string
}

type PendingSave = {
  apiPath: string
  currentValue: number | null
  fallbackName: string
  label: string
  nextValue: number
  record: MasterDataRecord
  saveKey: string
}

const vatSetting: TaxSettingConfig = {
  apiPath: '/api/master-data/vat-settings',
  fallbackName: 'VAT',
  kind: 'vat',
  label: 'VAT',
}

const whtSetting: TaxSettingConfig = {
  apiPath: '/api/master-data/wht-settings',
  fallbackName: 'WHT',
  kind: 'wht',
  label: 'WHT',
}

const whtColumns: Array<ResizableColumnDefinition<WhtColumnKey>> = [
  { key: 'name', defaultWidth: 320, minWidth: 220 },
  { key: 'ratePercent', defaultWidth: 160, minWidth: 130 },
  { key: 'status', defaultWidth: 140, minWidth: 110 },
  { key: 'action', defaultWidth: 120, minWidth: 100 },
]

function selectPrimaryRecord(rows: MasterDataRecord[]) {
  return rows.find((row) => row.active && row.isDefault) ?? rows.find((row) => row.active) ?? rows[0] ?? null
}

function toPercentInput(value: number | null) {
  return value === null ? '' : String(value)
}

function parsePercentInput(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toSavePayload(record: MasterDataRecord, value: number, fallbackName: string): MasterDataFormValues {
  return {
    ...emptyMasterDataForm,
    id: record.id,
    name: record.name || fallbackName,
    active: record.active,
    ratePercent: value,
  }
}

function percentInputClassName() {
  return 'h-9 w-full appearance-none px-3 py-1.5 text-right font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none border-none outline-none focus:ring-0 bg-transparent'
}

function compareSortValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left).localeCompare(String(right), 'th', { numeric: true })
}

export function SystemSettingsPageClient() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [whtSortDirection, setWhtSortDirection] = useState<SortDirection>('asc')
  const [whtSortKey, setWhtSortKey] = useState<WhtSortKey>('name')
  const [vatRecord, setVatRecord] = useState<MasterDataRecord | null>(null)
  const [vatValue, setVatValue] = useState('')
  const [whtRecords, setWhtRecords] = useState<MasterDataRecord[]>([])
  const [whtValues, setWhtValues] = useState<Record<string, string>>({})

  const activeWhtCount = useMemo(() => whtRecords.filter((record) => record.active).length, [whtRecords])
  const whtColumnResize = useResizableColumns('admin.system-settings.wht.v1', whtColumns)
  const sortedWhtRecords = useMemo(() => {
    const getSortValue = (record: MasterDataRecord, key: WhtSortKey) => {
      if (key === 'ratePercent') return parsePercentInput(whtValues[record.id] ?? toPercentInput(record.ratePercent)) ?? -1
      if (key === 'status') return record.active ? 1 : 0
      return record.name
    }

    return [...whtRecords].sort((left, right) => {
      const result = compareSortValues(getSortValue(left, whtSortKey), getSortValue(right, whtSortKey))
      return whtSortDirection === 'asc' ? result : -result
    })
  }, [whtRecords, whtSortDirection, whtSortKey, whtValues])

  async function loadSettings() {
    setError(null)
    setIsLoading(true)
    try {
      const [vatRows, whtRows] = await Promise.all([
        listMasterDataRecords(vatSetting.apiPath),
        listMasterDataRecords(whtSetting.apiPath),
      ])
      const nextVatRecord = selectPrimaryRecord(vatRows)
      setVatRecord(nextVatRecord)
      setVatValue(toPercentInput(nextVatRecord?.ratePercent ?? null))
      setWhtRecords(whtRows)
      setWhtValues(Object.fromEntries(whtRows.map((record) => [record.id, toPercentInput(record.ratePercent)])))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดค่าตั้งค่าระบบไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadSettings()
  }, [])

  function requestSave(setting: TaxSettingConfig, record: MasterDataRecord | null, value: string, saveKey: string) {
    if (!record) {
      setError(`ไม่พบข้อมูล ${setting.label} ในระบบ`)
      return
    }

    const nextValue = parsePercentInput(value)
    if (nextValue === null || nextValue < 0 || nextValue > 100) {
      setError(`${setting.label} ต้องเป็นตัวเลข 0-100%`)
      return
    }

    setError(null)
    setPendingSave({
      apiPath: setting.apiPath,
      currentValue: record.ratePercent,
      fallbackName: setting.fallbackName,
      label: setting.label,
      nextValue,
      record,
      saveKey,
    })
  }

  function changeWhtSort(key: WhtSortKey) {
    if (whtSortKey === key) {
      setWhtSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setWhtSortKey(key)
    setWhtSortDirection('asc')
  }

  async function confirmSave() {
    if (!pendingSave) return

    setError(null)
    setSavingKey(pendingSave.saveKey)
    try {
      const saved = await saveMasterDataRecord(
        pendingSave.apiPath,
        toSavePayload(pendingSave.record, pendingSave.nextValue, pendingSave.fallbackName),
      )

      if (pendingSave.saveKey === 'vat') {
        setVatRecord(saved)
        setVatValue(toPercentInput(saved.ratePercent))
      } else {
        setWhtRecords((current) => current.map((record) => (record.id === saved.id ? saved : record)))
        setWhtValues((current) => ({ ...current, [saved.id]: toPercentInput(saved.ratePercent) }))
      }
      setPendingSave(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `บันทึก ${pendingSave.label} ไม่ได้`)
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <section className="space-y-4">
      <section className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">ข้อมูลบริษัทสำหรับใบพิมพ์</h2>
          </div>
          <Button asChild className="w-full md:w-auto font-semibold shrink-0" size="sm">
            <Link href="/admin/company-profile">เปิดหน้าข้อมูลบริษัท</Link>
          </Button>
        </div>
      </section>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 animate-fade-in">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl bg-white p-12 text-center text-sm text-slate-500 shadow">กำลังโหลดค่าตั้งค่า...</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          <section className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm h-fit">
            <div className="mb-4">
              <h2 className="text-base font-bold text-slate-900">{vatSetting.label}</h2>
            </div>

            <label className="block text-sm font-medium text-slate-700">
              อัตรา %
              <div className="mt-1.5 flex max-w-xs items-center overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-slate-900 h-9">
                <Input
                  className={percentInputClassName()}
                  inputMode="decimal"
                  max={100}
                  min={0}
                  step="0.01"
                  type="number"
                  value={vatValue}
                  onChange={(event) => setVatValue(event.target.value)}
                />
                <span className="border-l border-slate-100 px-3 text-sm text-slate-500">%</span>
              </div>
            </label>

            <div className="mt-4">
              <Button
                disabled={!vatRecord || savingKey !== null}
                size="sm"
                type="button"
                className="font-semibold px-4"
                onClick={() => requestSave(vatSetting, vatRecord, vatValue, 'vat')}
              >
                {savingKey === 'vat' ? 'กำลังบันทึก...' : 'บันทึก'}
              </Button>
            </div>
          </section>

          <section className="space-y-3">
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900">{whtSetting.label}</h2>
                </div>
                <div className="rounded bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  ใช้งาน {activeWhtCount} / {whtRecords.length}
                </div>
              </div>
            </div>

            {/* Desktop Table View (Hidden on Mobile) */}
            <div className="hidden lg:block">
              {whtColumnResize.hasCustomWidths ? (
                <div className="mb-2 flex justify-end">
                  <Button size="xs" type="button" variant="outline" onClick={whtColumnResize.resetColumnWidths}>
                    คืนค่ากว้าง
                  </Button>
                </div>
              ) : null}
              <Table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: whtColumnResize.tableMinWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {whtColumns.map((column, index) => (
                    <col
                      key={column.key}
                      style={index === whtColumns.length - 1 ? { minWidth: column.minWidth } : whtColumnResize.getColumnStyle(column.key)}
                    />
                  ))}
                </colgroup>
                <TableHeader className="bg-slate-100">
                  <TableRow>
                    <ResizableTableHead activeSortKey={whtSortKey} direction={whtSortDirection} label="รายการ" resizeProps={whtColumnResize.getResizeHandleProps('name', 'รายการ')} sortKey="name" onSort={changeWhtSort} />
                    <ResizableTableHead activeSortKey={whtSortKey} align="right" direction={whtSortDirection} label="อัตรา %" resizeProps={whtColumnResize.getResizeHandleProps('ratePercent', 'อัตรา %')} sortKey="ratePercent" onSort={changeWhtSort} />
                    <ResizableTableHead activeSortKey={whtSortKey} align="center" direction={whtSortDirection} label="สถานะ" resizeProps={whtColumnResize.getResizeHandleProps('status', 'สถานะ')} sortKey="status" onSort={changeWhtSort} />
                    <ResizableTableHead align="center" label="จัดการ" resizeProps={whtColumnResize.getResizeHandleProps('action', 'จัดการ')} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {whtRecords.length === 0 ? (
                    <TableRow>
                      <TableCell className="p-8 text-center text-slate-500" colSpan={4}>ไม่พบข้อมูล WHT</TableCell>
                    </TableRow>
                  ) : null}
                  {sortedWhtRecords.map((record) => {
                    const value = whtValues[record.id] ?? toPercentInput(record.ratePercent)
                    const saveKey = `wht:${record.id}`
                    return (
                      <TableRow key={record.id} className="hover:bg-slate-50">
                        <TableCell className="min-w-0">
                          <div className="truncate font-semibold text-slate-900" title={record.name}>{record.name}</div>
                          {record.isDefault ? <div className="mt-0.5 text-xs text-emerald-700 font-bold">อัตราที่ใช้คำนวณปัจจุบัน</div> : null}
                        </TableCell>
                        <TableCell>
                          <div className="ml-auto flex max-w-[130px] items-center overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-slate-900">
                            <Input
                              aria-label={`${record.name} อัตราเปอร์เซ็นต์`}
                              className={percentInputClassName()}
                              inputMode="decimal"
                              max={100}
                              min={0}
                              step="0.01"
                              type="number"
                              value={value}
                              onChange={(event) => setWhtValues((current) => ({ ...current, [record.id]: event.target.value }))}
                            />
                            <span className="border-l border-slate-100 px-2 text-xs text-slate-500">%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={record.active ? 'text-sm font-semibold text-emerald-700' : 'text-sm text-slate-400 font-medium'}>
                            {record.active ? 'ใช้งาน' : 'ปิดใช้'}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            disabled={savingKey !== null}
                            size="xs"
                            type="button"
                            className="font-bold"
                            onClick={() => requestSave(whtSetting, record, value, saveKey)}
                          >
                            {savingKey === saveKey ? 'บันทึก...' : 'บันทึก'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile View: Dense Card List (Hidden on Desktop) */}
            <div className="space-y-3 lg:hidden">
              {sortedWhtRecords.map((record) => {
                const value = whtValues[record.id] ?? toPercentInput(record.ratePercent)
                const saveKey = `wht:${record.id}`
                return (
                  <div key={record.id} className="rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm space-y-3 animate-fade-in">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900 text-sm leading-snug">{record.name}</div>
                        {record.isDefault ? (
                          <div className="mt-0.5 text-xs font-bold text-emerald-700">อัตราที่ใช้คำนวณปัจจุบัน</div>
                        ) : null}
                      </div>
                      <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${record.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-400'}`}>
                        {record.active ? 'ใช้งาน' : 'ปิดใช้'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-1.5 border-t border-slate-100">
                      <div className="flex-1">
                        <span className="text-slate-400 block text-xs uppercase font-semibold mb-1">อัตรา %</span>
                        <div className="flex max-w-[130px] items-center overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-slate-900 h-9">
                          <Input
                            aria-label={`${record.name} อัตราเปอร์เซ็นต์`}
                            className={percentInputClassName()}
                            inputMode="decimal"
                            max={100}
                            min={0}
                            step="0.01"
                            type="number"
                            value={value}
                            onChange={(event) => setWhtValues((current) => ({ ...current, [record.id]: event.target.value }))}
                          />
                          <span className="border-l border-slate-100 px-2 text-xs text-slate-500">%</span>
                        </div>
                      </div>
                      <div className="self-end pb-0.5 shrink-0">
                        <Button
                          disabled={savingKey !== null}
                          size="sm"
                          type="button"
                          className="h-9 px-4 font-semibold"
                          onClick={() => requestSave(whtSetting, record, value, saveKey)}
                        >
                          {savingKey === saveKey ? '...' : 'บันทึก'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
              {whtRecords.length === 0 ? (
                <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-slate-400 shadow-sm">
                  ไม่พบข้อมูล WHT
                </div>
              ) : null}
            </div>
          </section>
        </div>
      )}

      {pendingSave ? (
        <Dialog open={!!pendingSave} onOpenChange={() => setPendingSave(null)}>
          <DialogContent className="max-w-md rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 max-h-[90vh] animate-fade-in" hideClose>
            <div className="border-b border-slate-800 px-5 py-4 bg-slate-900 shrink-0 flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg font-bold text-slate-100">ยืนยันการเปลี่ยนค่าระบบ</DialogTitle>
                <p className="mt-1 text-xs text-slate-400">{pendingSave.record.name}</p>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5 text-sm bg-slate-50 flex-1 overflow-y-auto">
              <div className="font-semibold text-slate-700">{pendingSave.label}</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">ค่าเดิม</div>
                  <div className="mt-1 text-xl font-bold text-slate-700">{pendingSave.currentValue ?? '-'}%</div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 shadow-sm">
                  <div className="text-xs font-bold text-amber-600 uppercase tracking-wider">ค่าใหม่</div>
                  <div className="mt-1 text-xl font-bold text-amber-800">{pendingSave.nextValue}%</div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 bg-white shrink-0">
              <Button
                disabled={savingKey !== null}
                size="sm"
                type="button"
                variant="secondary"
                onClick={() => setPendingSave(null)}
              >
                ยกเลิก
              </Button>
              <Button
                disabled={savingKey !== null}
                size="sm"
                type="button"
                className="font-bold"
                onClick={() => void confirmSave()}
              >
                {savingKey ? 'กำลังบันทึก...' : 'ยืนยันบันทึก'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  )
}

