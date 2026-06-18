'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { SearchCombobox } from '@/components/ui/SearchCombobox'

type AssetRegisterRow = {
  acquisitionType: string
  accumDep: number
  assetStatus: string
  branchId: string
  branchName: string
  category: string
  chassisNo: string
  code: string
  department: string
  depreciationMethod: string
  engineNo: string
  id: string
  insurancePolicyNo: string
  licensePlate: string
  location: string
  monthlyDep: number
  name: string
  nbv: number
  netAssetCost: number
  notes: string
  originalCost: number
  purchaseDate: string
  responsiblePerson: string
  salvageValue: number
  serialNo: string
  supplierId: string
  supplierName: string
  usefulLifeMonths: number
  vatAmount: number
  warrantyExpireDate: string
}

type AssetRegisterPayload = {
  byCategory: { category: string; count: number; cost: number; monthlyDep: number; nbv: number }[]
  filters: { categories: string[]; statuses: string[] }
  options: {
    acquisitionTypes: string[]
    assetStatuses: string[]
    branches: { code: string; id: string; name: string }[]
    categories: string[]
    departments: string[]
    depreciationMethods: string[]
    suppliers: { code: string; id: string; name: string }[]
  }
  rows: AssetRegisterRow[]
  summary: { accumDep: number; count: number; monthlyDep: number; nbv: number; netAssetCost: number }
}

type AssetFormState = {
  acquisitionType: string
  assetStatus: string
  branchId: string
  category: string
  chassisNo: string
  code: string
  department: string
  depreciationMethod: string
  engineNo: string
  id: string
  insurancePolicyNo: string
  licensePlate: string
  location: string
  name: string
  netAssetCost: string
  notes: string
  originalCost: string
  purchaseDate: string
  responsiblePerson: string
  salvageValue: string
  serialNo: string
  supplierId: string
  usefulLifeMonths: string
  vatAmount: string
  warrantyExpireDate: string
}

type ImportPreviewRow = { code: string; errors: string[]; index: number; mode: string; name: string }

const blankAssetForm: AssetFormState = {
  acquisitionType: 'Purchased',
  assetStatus: 'Active',
  branchId: '',
  category: 'Other',
  chassisNo: '',
  code: '',
  department: '',
  depreciationMethod: 'Straight Line',
  engineNo: '',
  id: '',
  insurancePolicyNo: '',
  licensePlate: '',
  location: '',
  name: '',
  netAssetCost: '',
  notes: '',
  originalCost: '',
  purchaseDate: '',
  responsiblePerson: '',
  salvageValue: '0',
  serialNo: '',
  supplierId: '',
  usefulLifeMonths: '60',
  vatAmount: '0',
  warrantyExpireDate: '',
}

const fieldClass = 'w-full rounded-md border border-slate-100 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100'

type DepreciationPayload = {
  designState: { glPosting: string; reverseWrite: string; runWrite: string }
  pendingAssets: { accumDep: number; assetStatus: string; code: string; id: string; monthlyDep: number; name: string; nbv: number; netAssetCost: number; category: string; department: string }[]
  period: { date: string; key: string; month: number | 'all'; postedRuns: number; pendingAssets: number; year: number }
  rows: { accumAfter: number; accumBefore: number; assetCode: string; assetName: string; date: string; depreciationAmount: number; id: string; nbvAfter: number; nbvBefore: number; period: string; refNo: string; reversalReason: string; reversedAt: string; status: string; category: string; department: string }[]
  summary: { pendingAssets: number; postedRuns: number; reversedRuns: number; totalDepreciation: number }
}

type DepreciationPreview = {
  periodDate: string
  periodKey: string
  rows: { accumAfter: number; accumBefore: number; assetCode: string; assetId: string; assetName: string; depreciationAmount: number; monthlyDep: number; nbvAfter: number; nbvBefore: number; netAssetCost: number; salvageValue: number; willFullyDepreciate: boolean }[]
  summary: { count: number; totalDepreciation: number; willFullyDepreciate: number }
}

type DisposalPayload = {
  assetOptions: { assetStatus: string; code: string; id: string; label: string; name: string; nbv: number; purchaseDate: string }[]
  customerOptions: { code: string; id: string; name: string }[]
  designState: { glPosting: string; reversal: string; writeBehavior: string }
  disposalTypes: string[]
  rows: { assetCode: string; assetName: string; customerCode: string; customerName: string; date: string; disposalNo: string; disposalType: string; gainLoss: number; id: string; nbv: number; notes: string; reason: string; receiptRefNo: string; reversalReason: string; reversedAt: string; sellingPrice: number; status: string }[]
  summary: { activeAssets: number; disposedRows: number; gainLoss: number; proceeds: number; reversedRows: number }
}

type DisposalFormState = {
  assetId: string
  customerId: string
  disposalDate: string
  disposalType: string
  notes: string
  reason: string
  receiptRefNo: string
  sellingPrice: string
}

const blankDisposalForm = (): DisposalFormState => ({
  assetId: '',
  customerId: '',
  disposalDate: new Date().toISOString().slice(0, 10),
  disposalType: 'Sale',
  notes: '',
  reason: '',
  receiptRefNo: '',
  sellingPrice: '0',
})

export function AssetRegisterPageClient() {
  const [category, setCategory] = useState('all')
  const [data, setData] = useState<AssetRegisterPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<AssetFormState>(blankAssetForm)
  const [importRows, setImportRows] = useState<Omit<AssetFormState, 'id'>[]>([])
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [modal, setModal] = useState<'asset' | 'import' | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  const supplierOptions = useMemo(() => {
    return (data?.options.suppliers ?? []).map((row) => ({
      id: row.id,
      label: `${row.code} - ${row.name}`,
      searchText: `${row.code} ${row.name}`
    }))
  }, [data?.options.suppliers])

  const categoryOptions = useMemo(() => {
    return (data?.options.categories ?? []).map((cat) => ({
      id: cat,
      label: cat,
      searchText: cat,
    }))
  }, [data?.options.categories])

  const departmentOptions = useMemo(() => {
    return (data?.options.departments ?? []).map((dept) => ({
      id: dept,
      label: dept,
      searchText: dept,
    }))
  }, [data?.options.departments])


  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (search.trim()) params.set('q', search.trim())
    if (category !== 'all') params.set('category', category)
    if (status !== 'all') params.set('status', status)
    return params.toString()
  }, [category, search, status])
  const apiHref = `/api/finance-accounting/asset-register${queryString ? `?${queryString}` : ''}`
  const exportHref = `/api/finance-accounting/asset-register?${new URLSearchParams({ ...(queryString ? Object.fromEntries(new URLSearchParams(queryString)) : {}), format: 'csv' }).toString()}`

  const loadData = useCallback(() => {
    setIsLoading(true)
    dailyFetchJson<AssetRegisterPayload>(apiHref)
      .then(setData)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลดทะเบียนทรัพย์สินไม่ได้'))
      .finally(() => setIsLoading(false))
  }, [apiHref])

  useEffect(() => loadData(), [loadData])

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (data?.rows ?? []).filter((row) => {
      const matchesSearch = !needle || [row.code, row.name, row.location, row.branchName].join(' ').toLowerCase().includes(needle)
      const matchesCategory = category === 'all' || row.category === category
      const matchesStatus = status === 'all' || row.assetStatus === status
      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [category, data?.rows, search, status])

  const openCreate = () => {
    setError(null)
    setForm(blankAssetForm)
    setModal('asset')
  }

  const openEdit = (row: AssetRegisterRow) => {
    setError(null)
    setForm(assetRowToForm(row))
    setModal('asset')
  }

  const updateForm = (field: keyof AssetFormState, value: string) => {
    setForm((current) => {
      const next = { ...current, [field]: value }
      if (field === 'originalCost') {
        const originalCost = decimalValue(value)
        if (originalCost > 0) {
          next.netAssetCost = formatInputNumber(originalCost)
          next.vatAmount = '0'
        }
      }
      return next
    })
  }

  const saveAsset = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const result = await dailyFetchJson<{ payload: AssetRegisterPayload }>('/api/finance-accounting/asset-register', {
        body: JSON.stringify(formToPayload(form)),
        method: 'POST',
      })
      setData(result.payload)
      setModal(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกทะเบียนทรัพย์สินไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const deactivateAsset = async (row: AssetRegisterRow) => {
    if (!window.confirm(`ปิดใช้งานทรัพย์สิน ${row.code} ?`)) return
    setIsSaving(true)
    setError(null)
    try {
      const result = await dailyFetchJson<{ payload: AssetRegisterPayload }>('/api/finance-accounting/asset-register', {
        body: JSON.stringify({ action: 'deactivate', id: row.id, reason: 'deactivated from asset register page' }),
        method: 'PATCH',
      })
      setData(result.payload)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ปิดใช้งานทรัพย์สินไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const previewImport = async (rowsToPreview = importRows) => {
    if (!rowsToPreview.length) {
      setError('เลือกไฟล์ CSV/TSV ก่อนนำเข้า')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const result = await dailyFetchJson<{ rows: ImportPreviewRow[] }>('/api/finance-accounting/asset-register', {
        body: JSON.stringify({ action: 'previewImport', rows: rowsToPreview.map(formToPayload) }),
        method: 'POST',
      })
      setImportPreview(result.rows)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ตรวจไฟล์นำเข้าไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const commitImport = async () => {
    if (!importRows.length || importPreview?.some((row) => row.errors.length)) return
    setIsSaving(true)
    setError(null)
    try {
      const result = await dailyFetchJson<{ payload: AssetRegisterPayload }>('/api/finance-accounting/asset-register', {
        body: JSON.stringify({ action: 'commitImport', rows: importRows.map(formToPayload) }),
        method: 'POST',
      })
      setData(result.payload)
      setImportRows([])
      setImportPreview(null)
      setModal(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'นำเข้าทะเบียนทรัพย์สินไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const importBlocked = importPreview?.some((row) => row.errors.length) ?? true

  return (
    <section className="space-y-4 text-slate-800">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-sm border border-slate-100">
        <LinkButton href="/api/finance-accounting/asset-register?template=csv">📄 Template</LinkButton>
        <button
          type="button"
          onClick={() => { setError(null); setImportRows([]); setImportPreview(null); setModal('import') }}
          className="rounded-lg bg-slate-50 border border-slate-100 text-slate-600 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 transition outline-none focus:ring-0"
        >
          📥 Import
        </button>
        <LinkButton href={exportHref}>📤 Export CSV</LinkButton>
        <button
          type="button"
          onClick={openCreate}
          className="ml-auto rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white px-4 py-1.5 text-xs font-bold transition shadow-sm outline-none focus:ring-0"
        >
          + เพิ่มทรัพย์สิน
        </button>
      </div>

      {error ? <ErrorBox message={error} /> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="bg-white p-5 border border-slate-100 rounded-xl shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl shrink-0">
            🏢
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-emerald-600 truncate">Net Book Value (มูลค่าคงเหลือสุทธิ)</div>
            <div className="mt-0.5 text-2xl font-extrabold text-slate-900 tracking-tight">{formatMoney(data?.summary.nbv)} ฿</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-100">
              <div><div className="text-slate-400">ต้นทุนสุทธิ</div><div className="font-bold text-slate-800 text-xs">{formatMoney(data?.summary.netAssetCost)}</div></div>
              <div><div className="text-slate-400">ค่าเสื่อมสะสม</div><div className="font-bold text-slate-500 text-xs">{formatMoney(data?.summary.accumDep)}</div></div>
            </div>
          </div>
        </div>
        <Panel title="NBV ตามหมวด">
          <div className="space-y-3">
            {(data?.byCategory ?? []).slice(0, 6).map((item) => (
              <Bar key={item.category} label={`${item.category} (${item.count})`} max={data?.summary.nbv ?? 0} value={item.nbv} />
            ))}
            {!isLoading && (data?.byCategory.length ?? 0) === 0 ? <EmptyText>ยังไม่มีทรัพย์สิน</EmptyText> : null}
          </div>
        </Panel>
        <Panel title="ค่าเสื่อม/เดือน">
          <div className="text-2xl font-extrabold text-amber-700 tracking-tight">{formatMoney(data?.summary.monthlyDep)} ฿</div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <MiniStat label="รายการทั้งหมด" value={data?.summary.count ?? 0} />
            <MiniStat label="แสดงผลปัจจุบัน" value={rows.length} />
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="จำนวนทรัพย์สิน" value={data?.summary.count ?? 0} tone="blue" icon="📋" />
        <StatCard label="ต้นทุนสุทธิรวม" value={formatMoney(data?.summary.netAssetCost)} tone="blue" icon="💰" />
        <StatCard label="ค่าเสื่อมสะสมรวม" value={formatMoney(data?.summary.accumDep)} tone="amber" icon="📉" />
        <StatCard label="NBV สุทธิรวม" value={formatMoney(data?.summary.nbv)} tone="emerald" icon="🏢" />
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
        <input
          className="w-full md:flex-1 rounded-lg border border-slate-100 px-3 py-1.5 text-xs outline-none focus:ring-0 focus:outline-none focus:border-slate-400 transition"
          placeholder="ค้นหา รหัส / ชื่อ / สถานที่ / สาขา"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="grid grid-cols-2 gap-2 lg:flex md:items-center md:gap-2 w-full md:w-auto">
          <select
            className="w-full md:w-auto rounded-lg border border-slate-100 bg-white px-3 py-1.5 text-xs outline-none focus:ring-0 focus:outline-none focus:border-slate-400 transition cursor-pointer"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">ทุกหมวด</option>
            {(data?.filters.categories ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select
            className="w-full md:w-auto rounded-lg border border-slate-100 bg-white px-3 py-1.5 text-xs outline-none focus:ring-0 focus:outline-none focus:border-slate-400 transition cursor-pointer"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">ทุกสถานะ</option>
            {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </div>

      {/* Desktop View Table */}
      <div className="hidden lg:block">
        <TableShell>
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                <Th>รหัส</Th>
                <Th>ชื่อ + location</Th>
                <Th>หมวด</Th>
                <Th>สาขา</Th>
                <Th>วันที่ซื้อ</Th>
                <Th align="right">ต้นทุน/Net Cost</Th>
                <Th align="right">ค่าเสื่อมสะสม</Th>
                <Th align="right">NBV</Th>
                <Th align="right">ค่าเสื่อม/เดือน</Th>
                <Th align="center">สถานะ</Th>
                <Th align="center">actions</Th>
              </tr>
            </thead>
            <tbody>
              <LoadingOrEmpty colSpan={11} isLoading={isLoading} rows={rows.length} />
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors transition">
                  <Td><span className="font-mono font-bold text-amber-700">{row.code}</span></Td>
                  <Td><div className="font-semibold text-slate-900">{row.name}</div><div className="text-slate-400 text-[10px]">{row.location || '-'}</div></Td>
                  <Td>{row.category}</Td><Td>{row.branchName}</Td><Td>{row.purchaseDate || '-'}</Td>
                  <Td align="right" className="font-medium">{formatMoney(row.netAssetCost)}</Td><Td align="right" className="text-slate-500">{formatMoney(row.accumDep)}</Td><Td align="right" strong className="text-emerald-700">{formatMoney(row.nbv)}</Td><Td align="right" className="text-amber-700 font-medium">{formatMoney(row.monthlyDep)}</Td>
                  <Td align="center"><StatusPill status={row.assetStatus} /></Td>
                  <Td align="center">
                    <div className="flex justify-center gap-1">
                      <button className="rounded border border-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 transition outline-none" disabled={isSaving} onClick={() => openEdit(row)} type="button">แก้ไข</button>
                      {!['Inactive', 'Sold', 'Disposed', 'Lost'].includes(row.assetStatus) ? (
                        <button className="rounded border border-red-200 px-2 py-0.5 text-[10px] font-semibold text-red-600 hover:bg-red-50 transition outline-none" disabled={isSaving} onClick={() => deactivateAsset(row)} type="button">ปิดใช้งาน</button>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      </div>

      {/* Mobile View Card List */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="bg-white rounded-xl p-6 text-center text-xs text-slate-400 shadow-sm border border-slate-100">กำลังโหลดข้อมูล...</div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-xl p-6 text-center text-xs text-slate-400 shadow-sm border border-slate-100">ยังไม่มีข้อมูลทะเบียนทรัพย์สิน</div>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3 hover:bg-slate-50/50 transition">
              <div className="flex justify-between items-start border-b border-slate-100 pb-2">
                <div className="min-w-0 flex-1 pr-2">
                  <span className="font-mono font-bold text-xs text-amber-700 block">{row.code}</span>
                  <span className="font-bold text-slate-900 text-sm block truncate">{row.name}</span>
                  <span className="text-slate-400 text-[10px] block truncate">{row.location || '-'}</span>
                </div>
                <StatusPill status={row.assetStatus} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] sm:text-xs">
                <div><span className="text-slate-400 block text-[10px]">หมวดหมู่ / สาขา</span><span className="font-medium text-slate-700 block truncate">{row.category} / {row.branchName}</span></div>
                <div><span className="text-slate-400 block text-[10px]">วันที่ซื้อ</span><span className="font-medium text-slate-700 block">{row.purchaseDate || '-'}</span></div>
                <div><span className="text-slate-400 block text-[10px]">ต้นทุนสุทธิ</span><span className="font-bold text-slate-800 block">{formatMoney(row.netAssetCost)}</span></div>
                <div><span className="text-slate-400 block text-[10px]">ค่าเสื่อมสะสม</span><span className="font-medium text-slate-500 block">{formatMoney(row.accumDep)}</span></div>
                <div><span className="text-slate-400 block text-[10px]">มูลค่าคงเหลือ (NBV)</span><span className="font-extrabold text-emerald-700 text-xs sm:text-sm block">{formatMoney(row.nbv)}</span></div>
                <div><span className="text-slate-400 block text-[10px]">ค่าเสื่อม/เดือน</span><span className="font-bold text-amber-700 block">{formatMoney(row.monthlyDep)}</span></div>
              </div>
              <div className="border-t border-slate-100 pt-2 flex justify-end gap-2">
                <button className="rounded border border-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition outline-none focus:ring-0" disabled={isSaving} onClick={() => openEdit(row)} type="button">แก้ไข</button>
                {!['Inactive', 'Sold', 'Disposed', 'Lost'].includes(row.assetStatus) ? (
                  <button className="rounded border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 transition outline-none focus:ring-0" disabled={isSaving} onClick={() => deactivateAsset(row)} type="button">ปิดใช้งาน</button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      {modal === 'asset' ? (
        <Modal title={form.id ? `แก้ไขทรัพย์สิน ${form.code}` : 'เพิ่มทรัพย์สิน'}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label="รหัสทรัพย์สิน">
              <input 
                className={fieldClass} 
                disabled 
                placeholder={form.id ? "" : "(ระบบสร้างให้อัตโนมัติ)"} 
                value={form.id ? form.code : "(ระบบสร้างให้อัตโนมัติ)"} 
              />
            </Field>
            <Field label="ชื่อทรัพย์สิน"><input className={fieldClass} value={form.name} onChange={(event) => updateForm('name', event.target.value)} /></Field>
            <div className="w-full">
              <SearchCombobox
                inputId="form-category"
                label="หมวด"
                options={categoryOptions}
                value={form.category}
                onChange={(value) => updateForm('category', value)}
                placeholder="เลือกหรือพิมพ์หมวด..."
              />
            </div>
            <Field label="สาขา"><OptionSelect blankLabel="ไม่ระบุสาขา" options={data?.options.branches ?? []} value={form.branchId} onChange={(value) => updateForm('branchId', value)} /></Field>
            <div className="w-full">
              <SearchCombobox
                inputId="form-department"
                label="แผนก"
                options={departmentOptions}
                value={form.department}
                onChange={(value) => updateForm('department', value)}
                placeholder="เลือกหรือพิมพ์แผนก..."
              />
            </div>
            <Field label="สถานที่"><input className={fieldClass} value={form.location} onChange={(event) => updateForm('location', event.target.value)} /></Field>
            <Field label="วันที่ซื้อ"><input className={fieldClass} type="date" value={form.purchaseDate} onChange={(event) => updateForm('purchaseDate', event.target.value)} /></Field>
            <Field label="ประเภทการได้มา"><SelectControl options={data?.options.acquisitionTypes ?? []} value={form.acquisitionType} onChange={(value) => updateForm('acquisitionType', value)} /></Field>
            <div className="w-full">
              <SearchCombobox 
                inputId="form-supplier" 
                label="ผู้ขาย" 
                options={supplierOptions} 
                value={form.supplierId} 
                onChange={(value) => updateForm('supplierId', value)} 
                placeholder="พิมพ์เพื่อค้นหาผู้ขาย..."
              />
            </div>
            <MoneyField label="ราคาทุน" value={form.originalCost} onChange={(value) => updateForm('originalCost', value)} />
            <MoneyField label="มูลค่าซาก" value={form.salvageValue} onChange={(value) => updateForm('salvageValue', value)} />
            <Field label="อายุใช้งาน (เดือน)"><input className={fieldClass} inputMode="numeric" value={form.usefulLifeMonths} onChange={(event) => updateForm('usefulLifeMonths', event.target.value)} /></Field>
            <Field label="วิธีคิดค่าเสื่อม"><SelectControl options={data?.options.depreciationMethods ?? []} value={form.depreciationMethod} onChange={(value) => updateForm('depreciationMethod', value)} /></Field>
            <Field label="สถานะ"><SelectControl options={data?.options.assetStatuses ?? []} value={form.assetStatus} onChange={(value) => updateForm('assetStatus', value)} /></Field>
            <Field label="Serial No."><input className={fieldClass} value={form.serialNo} onChange={(event) => updateForm('serialNo', event.target.value)} /></Field>
            <Field label="ทะเบียนรถ"><input className={fieldClass} value={form.licensePlate} onChange={(event) => updateForm('licensePlate', event.target.value)} /></Field>
            <Field label="เลขตัวถัง"><input className={fieldClass} value={form.chassisNo} onChange={(event) => updateForm('chassisNo', event.target.value)} /></Field>
            <Field label="เลขเครื่อง"><input className={fieldClass} value={form.engineNo} onChange={(event) => updateForm('engineNo', event.target.value)} /></Field>
            <Field label="กรมธรรม์"><input className={fieldClass} value={form.insurancePolicyNo} onChange={(event) => updateForm('insurancePolicyNo', event.target.value)} /></Field>
            <Field label="หมดประกัน"><input className={fieldClass} type="date" value={form.warrantyExpireDate} onChange={(event) => updateForm('warrantyExpireDate', event.target.value)} /></Field>
            <Field label="ผู้รับผิดชอบ"><input className={fieldClass} value={form.responsiblePerson} onChange={(event) => updateForm('responsiblePerson', event.target.value)} /></Field>
            <div className="col-span-2 md:col-span-3"><Field label="หมายเหตุ"><textarea className={`${fieldClass} min-h-20`} value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} /></Field></div>
          </div>
          <ModalActions>
            <ActionButton onClick={() => setModal(null)}>ยกเลิก</ActionButton>
            <ActionButton strong disabled={isSaving} onClick={saveAsset}>{isSaving ? 'กำลังบันทึก' : 'บันทึก'}</ActionButton>
          </ModalActions>
        </Modal>
      ) : null}

      {modal === 'import' ? (
        <Modal title="Import Asset Register">
          <div className="space-y-3">
            <input
              accept=".csv,.tsv,.txt"
              className="block w-full rounded-md border border-slate-100 px-3 py-2 text-sm"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                file.text().then((content) => {
                  const parsedRows = parseAssetImportText(content)
                  setImportRows(parsedRows)
                  setImportPreview(null)
                  void previewImport(parsedRows)
                }).catch(() => setError('อ่านไฟล์นำเข้าไม่ได้'))
              }}
            />
            <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">รองรับ CSV/TSV ตามหัวคอลัมน์จาก template ก่อน commit ระบบจะ preview และ block แถวที่ซ้ำหรือ reference ไม่ถูกต้อง</div>
            {importPreview ? (
              <TableShell>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-500"><tr><Th>#</Th><Th>รหัส</Th><Th>ชื่อ</Th><Th>ผลตรวจ</Th></tr></thead>
                  <tbody>
                    {importPreview.slice(0, 100).map((row) => (
                      <tr key={`${row.index}-${row.code}`} className="border-t border-slate-100">
                        <Td>{row.index}</Td><Td><span className="font-mono">{row.code}</span></Td><Td>{row.name}</Td><Td>{row.errors.length ? <span className="text-red-700">{row.errors.join(', ')}</span> : <span className="text-emerald-700">พร้อมนำเข้า</span>}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableShell>
            ) : null}
          </div>
          <ModalActions>
            <ActionButton onClick={() => setModal(null)}>ยกเลิก</ActionButton>
            <ActionButton disabled={isSaving || importBlocked} strong onClick={commitImport}>{isSaving ? 'กำลังนำเข้า' : 'Commit Import'}</ActionButton>
          </ModalActions>
        </Modal>
      ) : null}
    </section>
  )
}

export function DepreciationPageClient() {
  const [data, setData] = useState<DepreciationPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [preview, setPreview] = useState<DepreciationPreview | null>(null)
  const [reverseRow, setReverseRow] = useState<DepreciationPayload['rows'][number] | null>(null)
  const [reverseReason, setReverseReason] = useState('')
  const [year, setYear] = useState(String(now.getFullYear()))

  const [filterCategory, setFilterCategory] = useState('all')
  const [filterDepartment, setFilterDepartment] = useState('all')

  const loadData = useCallback(() => {
    setIsLoading(true)
    const params = new URLSearchParams({ month, year })
    dailyFetchJson<DepreciationPayload>(`/api/finance-accounting/depreciation?${params.toString()}`)
      .then(setData)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลดค่าเสื่อมราคาไม่ได้'))
      .finally(() => setIsLoading(false))
  }, [month, year])

  useEffect(() => loadData(), [loadData])

  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    data?.pendingAssets.forEach((item) => { if (item.category) set.add(item.category) })
    data?.rows.forEach((item) => { if (item.category) set.add(item.category) })
    return Array.from(set).sort()
  }, [data])

  const departmentOptions = useMemo(() => {
    const set = new Set<string>()
    data?.pendingAssets.forEach((item) => { if (item.department) set.add(item.department) })
    data?.rows.forEach((item) => { if (item.department) set.add(item.department) })
    return Array.from(set).sort()
  }, [data])

  const filteredPendingAssets = useMemo(() => {
    return (data?.pendingAssets ?? []).filter((item) => {
      const matchCat = filterCategory === 'all' || item.category === filterCategory
      const matchDept = filterDepartment === 'all' || item.department === filterDepartment
      return matchCat && matchDept
    })
  }, [data?.pendingAssets, filterCategory, filterDepartment])

  const filteredRows = useMemo(() => {
    return (data?.rows ?? []).filter((item) => {
      const matchCat = filterCategory === 'all' || item.category === filterCategory
      const matchDept = filterDepartment === 'all' || item.department === filterDepartment
      return matchCat && matchDept
    })
  }, [data?.rows, filterCategory, filterDepartment])

  const totalDepreciationAmount = useMemo(() => {
    return filteredRows.filter((row) => row.status !== 'reversed').reduce((sum, row) => sum + row.depreciationAmount, 0)
  }, [filteredRows])

  const periodDate = useMemo(() => month === 'all' ? '-' : new Date(Number(year), Number(month), 0).toISOString().slice(0, 10), [month, year])
  const runPreview = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const result = await dailyFetchJson<DepreciationPreview>('/api/finance-accounting/depreciation', {
        body: JSON.stringify({ action: 'preview', periodMonth: month, periodYear: year }),
        method: 'POST',
      })
      setPreview(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Preview ค่าเสื่อมไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const commitRun = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const result = await dailyFetchJson<{ payload: DepreciationPayload }>('/api/finance-accounting/depreciation', {
        body: JSON.stringify({ action: 'commit', periodMonth: month, periodYear: year }),
        method: 'POST',
      })
      setData(result.payload)
      setPreview(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Run ค่าเสื่อมราคาไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const reverseDepreciation = async () => {
    if (!reverseRow) return
    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson('/api/finance-accounting/depreciation', {
        body: JSON.stringify({ action: 'reverse', id: reverseRow.id, periodMonth: month, periodYear: year, reason: reverseReason }),
        method: 'PATCH',
      })
      loadData()
      setReverseRow(null)
      setReverseReason('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reverse ค่าเสื่อมราคาไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      <FilterPanel>
        <select aria-label="Depreciation month" className="rounded-lg border border-slate-100 bg-white px-3 py-1.5 text-xs outline-none focus:outline-none focus:border-slate-400 transition cursor-pointer" value={month} onChange={(event) => setMonth(event.target.value)}>
          <option value="all">ดูรายปี (ทุกเดือน)</option>
          {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((item) => <option key={item} value={item}>เดือน {item}</option>)}
        </select>
        <input aria-label="Depreciation year" className="w-24 rounded-lg border border-slate-100 px-3 py-1.5 text-xs outline-none focus:outline-none focus:border-slate-400 transition" value={year} onChange={(event) => setYear(event.target.value)} />
        <input aria-label="Depreciation period date" className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:outline-none focus:border-slate-400 transition" readOnly value={periodDate} />
        
        <select aria-label="Filter category" className="rounded-lg border border-slate-100 bg-white px-3 py-1.5 text-xs outline-none focus:outline-none focus:border-slate-400 transition cursor-pointer" value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)}>
          <option value="all">ทุกหมวด</option>
          {categoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select aria-label="Filter department" className="rounded-lg border border-slate-100 bg-white px-3 py-1.5 text-xs outline-none focus:outline-none focus:border-slate-400 transition cursor-pointer" value={filterDepartment} onChange={(event) => setFilterDepartment(event.target.value)}>
          <option value="all">ทุกแผนก</option>
          {departmentOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>

        <Chip tone="blue">Asset ที่คิดค่าเสื่อม {filteredPendingAssets.length}</Chip>
        <Chip tone="emerald">Run แล้วงวดนี้ {data?.period.postedRuns ?? 0}</Chip>
        <Chip tone="amber">รอ Run {filteredPendingAssets.length}</Chip>
        <span className="flex-1" />
        <ActionButton disabled={isSaving || month === 'all' || filteredPendingAssets.length === 0} strong onClick={runPreview}>Preview ค่าเสื่อมงวดนี้</ActionButton>
      </FilterPanel>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="สินทรัพย์รอประมวลผล" value={filteredPendingAssets.length} tone="amber" icon="⏳" />
        <StatCard label="ประวัติประมวลผลค่าเสื่อม" value={data?.period.postedRuns ?? 0} tone="blue" icon="📊" />
        <div className="col-span-2 lg:col-span-1">
          <StatCard label="ค่าเสื่อมราคารวมงวดนี้" value={formatMoney(totalDepreciationAmount)} tone="red" icon="💰" />
        </div>
      </div>
      <Panel title="สินทรัพย์รอประมวลผลค่าเสื่อม">
        <MiniAssetTable isLoading={isLoading} rows={filteredPendingAssets} />
      </Panel>
      <TableShell title="ประวัติการประมวลผลค่าเสื่อม (Depreciation History)">
        {/* Desktop view */}
        <div className="hidden lg:block overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
              <tr>
                <Th>DEP ID</Th>
                <Th>งวด</Th>
                <Th>สินทรัพย์</Th>
                <Th align="right">ค่าเสื่อมสะสมก่อนหน้า</Th>
                <Th align="right">ค่าเสื่อมงวดนี้</Th>
                <Th align="right">ค่าเสื่อมสะสมหลังรัน</Th>
                <Th align="right">NBV ก่อนหน้า</Th>
                <Th align="right">NBV หลังรัน</Th>
                <Th align="center">สถานะ</Th>
                <Th align="center">จัดการ</Th>
              </tr>
            </thead>
            <tbody>
              <LoadingOrEmpty colSpan={10} isLoading={isLoading} rows={filteredRows.length} />
              {filteredRows.map((row) => (
                <tr key={row.id} className={`border-t border-slate-100 hover:bg-slate-50/50 transition ${row.status === 'reversed' ? 'bg-slate-50 opacity-70' : ''}`}>
                  <Td><span className="font-mono font-bold text-red-700">{row.refNo}</span></Td>
                  <Td>{row.period}</Td>
                  <Td>
                    <div className="font-semibold text-slate-800">{row.assetName}</div>
                    <div className="text-[10px] text-slate-400 font-medium font-mono">{row.assetCode}</div>
                  </Td>
                  <Td align="right">{formatMoney(row.accumBefore)}</Td>
                  <Td align="right" className="font-medium text-amber-700">{formatMoney(row.depreciationAmount)}</Td>
                  <Td align="right">{formatMoney(row.accumAfter)}</Td>
                  <Td align="right" className="text-slate-500">{formatMoney(row.nbvBefore)}</Td>
                  <Td align="right" strong className="text-emerald-700">{formatMoney(row.nbvAfter)}</Td>
                  <Td align="center">
                    <StatusPill status={row.status} />
                  </Td>
                  <Td align="center">
                    {row.status === 'reversed' ? (
                      <span className="text-[11px] text-slate-400 font-medium">{row.reversalReason || '-'}</span>
                    ) : (
                      <button 
                        className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-0 transition" 
                        disabled={isSaving} 
                        onClick={() => setReverseRow(row)} 
                        type="button"
                      >
                        Reverse
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile view */}
        <div className="block lg:hidden divide-y divide-slate-100/60 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="py-8 text-center text-slate-400 text-xs">กำลังโหลดข้อมูล...</div>
          ) : filteredRows.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">ยังไม่มีประวัติการประมวลผลค่าเสื่อม</div>
          ) : (
            filteredRows.map((row) => (
              <div key={row.id} className={`p-4 space-y-2.5 text-xs ${row.status === 'reversed' ? 'opacity-70 bg-slate-50/50' : 'bg-white'}`}>
                <div className="flex justify-between items-center">
                  <span className="font-mono font-bold text-red-700">{row.refNo}</span>
                  <span className="font-semibold text-slate-500 text-[11px]">{row.period}</span>
                </div>
                <div>
                  <div className="font-bold text-slate-800">{row.assetCode}</div>
                  <div className="text-[11px] text-slate-500 font-medium">{row.assetName}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50/50 p-2.5 rounded-lg border border-slate-100/50">
                  <div>
                    <span className="text-slate-400">ค่าเสื่อมงวดนี้:</span>{' '}
                    <span className="font-bold text-red-600">{formatMoney(row.depreciationAmount)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">สถานะ:</span>{' '}
                    <StatusPill status={row.status} />
                  </div>
                  <div>
                    <span className="text-slate-400">NBV ก่อนรัน:</span>{' '}
                    <span className="font-medium text-slate-600">{formatMoney(row.nbvBefore)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">NBV หลังรัน:</span>{' '}
                    <span className="font-bold text-emerald-700">{formatMoney(row.nbvAfter)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Acc ก่อนรัน:</span>{' '}
                    <span className="font-medium text-slate-600">{formatMoney(row.accumBefore)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Acc หลังรัน:</span>{' '}
                    <span className="font-medium text-slate-600">{formatMoney(row.accumAfter)}</span>
                  </div>
                </div>
                <div className="pt-2 flex justify-between items-center border-t border-slate-100/50">
                  {row.status === 'reversed' ? (
                    <span className="text-[11px] text-slate-400 italic font-medium">สาเหตุ: {row.reversalReason || '-'}</span>
                  ) : (
                    <>
                      <span />
                      <button 
                        className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-0 transition" 
                        disabled={isSaving} 
                        onClick={() => setReverseRow(row)} 
                        type="button"
                      >
                        Reverse
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </TableShell>

      {preview ? (
        <Modal title={`Preview ค่าเสื่อมงวด ${preview.periodKey}`}>
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatCard label="จำนวนรายการ" value={preview.summary.count} />
            <StatCard label="ค่าเสื่อมรวม" value={formatMoney(preview.summary.totalDepreciation)} tone="red" />
            <div className="col-span-2 md:col-span-1">
              <StatCard label="จะ Fully Depreciated" value={preview.summary.willFullyDepreciate} tone="amber" />
            </div>
          </div>
          <TableShell>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500"><tr><Th>Asset</Th><Th align="right">Acc ก่อน</Th><Th align="right">ค่าเสื่อม</Th><Th align="right">Acc หลัง</Th><Th align="right">NBV หลัง</Th><Th align="center">สถานะหลัง Run</Th></tr></thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.assetId} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <Td><div className="font-medium">{row.assetCode}</div><div className="text-slate-400">{row.assetName}</div></Td>
                    <Td align="right">{formatMoney(row.accumBefore)}</Td><Td align="right">{formatMoney(row.depreciationAmount)}</Td><Td align="right">{formatMoney(row.accumAfter)}</Td><Td align="right">{formatMoney(row.nbvAfter)}</Td>
                    <Td align="center">{row.willFullyDepreciate ? <Chip tone="blue">Fully Depreciated</Chip> : <Chip tone="emerald">Active</Chip>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
          <ModalActions>
            <ActionButton onClick={() => setPreview(null)}>ยกเลิก</ActionButton>
            <ActionButton disabled={isSaving || preview.rows.length === 0} strong onClick={commitRun}>{isSaving ? 'กำลัง Run' : 'Commit Run'}</ActionButton>
          </ModalActions>
        </Modal>
      ) : null}

      {reverseRow ? (
        <Modal title={`Reverse ค่าเสื่อม ${reverseRow.refNo}`}>
          <div className="space-y-3">
            <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              <div className="font-medium">{reverseRow.assetCode} - {reverseRow.assetName}</div>
              <div>งวด {reverseRow.period} / ค่าเสื่อม {formatMoney(reverseRow.depreciationAmount)} บาท</div>
            </div>
            <Field label="เหตุผลการ Reverse"><textarea className={`${fieldClass} min-h-24`} value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} /></Field>
          </div>
          <ModalActions>
            <ActionButton onClick={() => setReverseRow(null)}>ยกเลิก</ActionButton>
            <ActionButton disabled={isSaving} strong onClick={reverseDepreciation}>{isSaving ? 'กำลัง Reverse' : 'ยืนยัน Reverse'}</ActionButton>
          </ModalActions>
        </Modal>
      ) : null}
    </section>
  )
}

export function AssetDisposalPageClient() {
  const [data, setData] = useState<DisposalPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<DisposalFormState>(blankDisposalForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [modal, setModal] = useState<'create' | 'reverse' | null>(null)
  const [reverseReason, setReverseReason] = useState('')
  const [reverseRow, setReverseRow] = useState<DisposalPayload['rows'][number] | null>(null)

  const customerOptions = useMemo(() => {
    return (data?.customerOptions ?? []).map((row) => ({
      id: row.id,
      label: `${row.code} - ${row.name}`,
      searchText: `${row.code} ${row.name}`
    }))
  }, [data?.customerOptions])

  const loadData = useCallback(() => {
    setIsLoading(true)
    dailyFetchJson<DisposalPayload>('/api/finance-accounting/asset-disposal')
      .then(setData)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลจำหน่ายทรัพย์สินไม่ได้'))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => loadData(), [loadData])

  const selectedAsset = data?.assetOptions.find((asset) => asset.id === form.assetId)
  const sellingPrice = decimalValue(form.sellingPrice)
  const gainLossPreview = sellingPrice - (selectedAsset?.nbv ?? 0)

  const openCreate = () => {
    setForm(blankDisposalForm())
    setError(null)
    setModal('create')
  }

  const updateForm = (field: keyof DisposalFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const saveDisposal = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const result = await dailyFetchJson<{ payload: DisposalPayload }>('/api/finance-accounting/asset-disposal', {
        body: JSON.stringify({ ...form, sellingPrice }),
        method: 'POST',
      })
      setData(result.payload)
      setModal(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกจำหน่ายทรัพย์สินไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const openReverse = (row: DisposalPayload['rows'][number]) => {
    setReverseRow(row)
    setReverseReason('')
    setModal('reverse')
  }

  const reverseDisposal = async () => {
    if (!reverseRow) return
    setIsSaving(true)
    setError(null)
    try {
      const result = await dailyFetchJson<{ payload: DisposalPayload }>('/api/finance-accounting/asset-disposal', {
        body: JSON.stringify({ action: 'reverse', id: reverseRow.id, reason: reverseReason }),
        method: 'PATCH',
      })
      setData(result.payload)
      setModal(null)
      setReverseRow(null)
      setReverseReason('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reverse จำหน่ายทรัพย์สินไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      <FilterPanel>
        <Chip tone="blue">Asset ที่จำหน่ายได้ {data?.summary.activeAssets ?? 0}</Chip>
        <Chip tone="emerald">รายการ approved {data?.summary.disposedRows ?? 0}</Chip>
        <Chip tone="amber">Reverse {data?.summary.reversedRows ?? 0}</Chip>
        <span className="flex-1" />
        <ActionButton strong onClick={openCreate}>+ Disposal</ActionButton>
      </FilterPanel>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="ยอดขายรวม (Proceeds)" value={formatMoney(data?.summary.proceeds)} tone="blue" icon="💵" />
        <StatCard label="กำไร/(ขาดทุน) สุทธิ" value={formatMoney(data?.summary.gainLoss)} tone={(data?.summary.gainLoss ?? 0) >= 0 ? 'emerald' : 'red'} icon="📈" />
        <div className="col-span-2 md:col-span-1">
          <StatCard label="สินทรัพย์พร้อมจำหน่าย" value={data?.summary.activeAssets ?? 0} tone="amber" icon="📦" />
        </div>
      </div>
      <TableShell title="ประวัติการจำหน่ายสินทรัพย์ (Asset Disposal History)">
        {/* Desktop view */}
        <div className="hidden lg:block overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                <Th>DISP No.</Th>
                <Th>วันที่</Th>
                <Th>สินทรัพย์</Th>
                <Th>ประเภท</Th>
                <Th align="right">ราคาขาย</Th>
                <Th align="right">NBV ณ วันจำหน่าย</Th>
                <Th align="right">กำไร/(ขาดทุน)</Th>
                <Th>เหตุผล</Th>
                <Th align="center">สถานะ</Th>
                <Th align="center">จัดการ</Th>
              </tr>
            </thead>
            <tbody>
              <LoadingOrEmpty colSpan={10} isLoading={isLoading} rows={data?.rows.length ?? 0} emptyText="ยังไม่มีรายการจำหน่ายทรัพย์สิน" />
              {(data?.rows ?? []).map((row) => (
                <tr key={row.id} className={`border-t border-slate-100 hover:bg-slate-50/50 transition ${row.status === 'reversed' ? 'bg-slate-50 opacity-70' : ''}`}>
                  <Td><span className="font-mono font-bold text-slate-700">{row.disposalNo}</span></Td>
                  <Td>{row.date}</Td>
                  <Td>
                    <div className="font-semibold text-slate-800">{row.assetCode}</div>
                    <div className="text-[10px] text-slate-400 font-medium">{row.assetName}</div>
                  </Td>
                  <Td className="font-medium text-slate-700">{row.disposalType}</Td>
                  <Td align="right">{formatMoney(row.sellingPrice)}</Td>
                  <Td align="right" className="text-slate-500">{formatMoney(row.nbv)}</Td>
                  <Td align="right" strong className={(row.gainLoss ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}>{formatMoney(row.gainLoss)}</Td>
                  <Td className="text-slate-500 truncate max-w-[150px]" title={row.reason}>{row.reason || '-'}</Td>
                  <Td align="center">
                    <StatusPill status={row.status} />
                  </Td>
                  <Td align="center">
                    {row.status === 'reversed' ? (
                      <span className="text-[11px] text-slate-400 font-medium">{row.reversalReason || '-'}</span>
                    ) : (
                      <button 
                        className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-0 transition" 
                        disabled={isSaving} 
                        onClick={() => openReverse(row)} 
                        type="button"
                      >
                        Reverse
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile view */}
        <div className="block lg:hidden divide-y divide-slate-100/60 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="py-8 text-center text-slate-400 text-xs">กำลังโหลดข้อมูล...</div>
          ) : (data?.rows ?? []).length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">ยังไม่มีรายการจำหน่ายทรัพย์สิน</div>
          ) : (
            (data?.rows ?? []).map((row) => (
              <div key={row.id} className={`p-4 space-y-2.5 text-xs ${row.status === 'reversed' ? 'opacity-70 bg-slate-50/50' : 'bg-white'}`}>
                <div className="flex justify-between items-center">
                  <span className="font-mono font-bold text-slate-700">{row.disposalNo}</span>
                  <span className="font-semibold text-slate-500 text-[11px]">{row.date}</span>
                </div>
                <div>
                  <div className="font-bold text-slate-800">{row.assetCode}</div>
                  <div className="text-[11px] text-slate-500 font-medium">{row.assetName}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50/50 p-2.5 rounded-lg border border-slate-100/50">
                  <div>
                    <span className="text-slate-400">ประเภท:</span>{' '}
                    <span className="font-semibold text-slate-700">{row.disposalType}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">ราคาขาย:</span>{' '}
                    <span className="font-bold text-slate-800">{formatMoney(row.sellingPrice)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">NBV ณ วันจำหน่าย:</span>{' '}
                    <span className="font-medium text-slate-600">{formatMoney(row.nbv)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">กำไร/(ขาดทุน):</span>{' '}
                    <span className={`font-bold ${(row.gainLoss ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(row.gainLoss)}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400">สถานะ:</span>{' '}
                    <StatusPill status={row.status} />
                  </div>
                </div>
                {row.reason && (
                  <div className="text-[11px] bg-slate-50 p-2 rounded border border-slate-100 text-slate-600">
                    <span className="font-semibold text-slate-700">เหตุผล:</span> {row.reason}
                  </div>
                )}
                <div className="pt-2 flex justify-between items-center border-t border-slate-100/50">
                  {row.status === 'reversed' ? (
                    <span className="text-[11px] text-slate-400 italic font-medium">สาเหตุ: {row.reversalReason || '-'}</span>
                  ) : (
                    <>
                      <span />
                      <button 
                        className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-0 transition" 
                        disabled={isSaving} 
                        onClick={() => openReverse(row)} 
                        type="button"
                      >
                        Reverse
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </TableShell>

      {modal === 'create' ? (
        <Modal title="Asset Disposal">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-2">
            <Field label="Asset"><IdOptionSelect blankLabel="-เลือก Asset-" options={data?.assetOptions ?? []} value={form.assetId} onChange={(value) => updateForm('assetId', value)} /></Field>
            <Field label="วันที่"><input className={fieldClass} type="date" value={form.disposalDate} onChange={(event) => updateForm('disposalDate', event.target.value)} /></Field>
            <Field label="ประเภท"><SelectControl options={data?.disposalTypes ?? []} value={form.disposalType} onChange={(value) => updateForm('disposalType', value)} /></Field>
            <MoneyField label="ราคาขาย" value={form.sellingPrice} onChange={(value) => updateForm('sellingPrice', value)} />
            <div className="w-full">
                <SearchCombobox 
                  inputId="form-customer" 
                  label="ลูกค้า" 
                  options={customerOptions} 
                  value={form.customerId} 
                  onChange={(value) => updateForm('customerId', value)} 
                  placeholder="พิมพ์เพื่อค้นหาลูกค้า..."
                />
            </div>
            <Field label="Receipt Ref."><input className={fieldClass} value={form.receiptRefNo} onChange={(event) => updateForm('receiptRefNo', event.target.value)} /></Field>
            <div className="col-span-2"><Field label="เหตุผล"><textarea className={`${fieldClass} min-h-20`} value={form.reason} onChange={(event) => updateForm('reason', event.target.value)} /></Field></div>
            <div className="col-span-2"><Field label="หมายเหตุ"><textarea className={`${fieldClass} min-h-20`} value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} /></Field></div>
          </div>
          {selectedAsset ? (
            <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              <div>NBV ปัจจุบัน: <span className="font-semibold">{formatMoney(selectedAsset.nbv)}</span></div>
              <div>Gain/(Loss) คาดการณ์: <span className={`font-semibold ${gainLossPreview >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(gainLossPreview)}</span></div>
            </div>
          ) : null}
          <ModalActions>
            <ActionButton onClick={() => setModal(null)}>ยกเลิก</ActionButton>
            <ActionButton disabled={isSaving || !form.assetId} strong onClick={saveDisposal}>{isSaving ? 'กำลังบันทึก' : 'บันทึก'}</ActionButton>
          </ModalActions>
        </Modal>
      ) : null}

      {modal === 'reverse' && reverseRow ? (
        <Modal title={`Reverse Disposal ${reverseRow.disposalNo}`}>
          <div className="space-y-3">
            <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              <div className="font-medium">{reverseRow.assetCode} - {reverseRow.assetName}</div>
              <div>{reverseRow.disposalType} / Gain(Loss) {formatMoney(reverseRow.gainLoss)} บาท</div>
            </div>
            <Field label="เหตุผลการ Reverse"><textarea className={`${fieldClass} min-h-24`} value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} /></Field>
          </div>
          <ModalActions>
            <ActionButton onClick={() => setModal(null)}>ยกเลิก</ActionButton>
            <ActionButton disabled={isSaving} strong onClick={reverseDisposal}>{isSaving ? 'กำลัง Reverse' : 'ยืนยัน Reverse'}</ActionButton>
          </ModalActions>
        </Modal>
      ) : null}
    </section>
  )
}

function assetRowToForm(row: AssetRegisterRow): AssetFormState {
  return {
    acquisitionType: row.acquisitionType,
    assetStatus: row.assetStatus,
    branchId: row.branchId,
    category: row.category,
    chassisNo: row.chassisNo,
    code: row.code,
    department: row.department,
    depreciationMethod: row.depreciationMethod,
    engineNo: row.engineNo,
    id: row.id,
    insurancePolicyNo: row.insurancePolicyNo,
    licensePlate: row.licensePlate,
    location: row.location,
    name: row.name,
    netAssetCost: formatInputNumber(row.netAssetCost),
    notes: row.notes,
    originalCost: formatInputNumber(row.originalCost),
    purchaseDate: row.purchaseDate,
    responsiblePerson: row.responsiblePerson,
    salvageValue: formatInputNumber(row.salvageValue),
    serialNo: row.serialNo,
    supplierId: row.supplierId,
    usefulLifeMonths: String(row.usefulLifeMonths || 60),
    vatAmount: formatInputNumber(row.vatAmount),
    warrantyExpireDate: row.warrantyExpireDate,
  }
}

function decimalValue(value: string) {
  const amount = Number(String(value || '').replace(/,/g, ''))
  return Number.isFinite(amount) ? amount : 0
}

function formatInputNumber(value: number) {
  return Number.isFinite(value) && value !== 0 ? String(Number(value.toFixed(2))) : ''
}

function formToPayload(form: AssetFormState | Omit<AssetFormState, 'id'>) {
  return {
    ...form,
    netAssetCost: decimalValue(form.netAssetCost),
    originalCost: decimalValue(form.originalCost),
    salvageValue: decimalValue(form.salvageValue),
    usefulLifeMonths: Number(form.usefulLifeMonths || 0),
    vatAmount: decimalValue(form.vatAmount),
  }
}

function parseAssetImportText(content: string): Omit<AssetFormState, 'id'>[] {
  const delimiter = content.includes('\t') ? '\t' : ','
  const lines = content.split(/\r?\n/).filter((line) => line.trim())
  const headers = splitDelimitedLine(lines[0] ?? '', delimiter).map((header) => header.trim().toLowerCase())
  return lines.slice(1).map((line) => {
    const cells = splitDelimitedLine(line, delimiter)
    const value = (header: string) => {
      const index = headers.indexOf(header)
      return index >= 0 ? (cells[index] ?? '').trim() : ''
    }
    return {
      acquisitionType: value('acquisition_type') || 'Purchased',
      assetStatus: value('asset_status') || 'Active',
      branchId: value('branch_code'),
      category: value('category') || 'Other',
      chassisNo: value('chassis_no'),
      code: value('asset_code').toUpperCase(),
      department: value('department'),
      depreciationMethod: value('depreciation_method') || 'Straight Line',
      engineNo: value('engine_no'),
      insurancePolicyNo: value('insurance_policy_no'),
      licensePlate: value('license_plate'),
      location: value('location'),
      name: value('asset_name'),
      netAssetCost: value('net_asset_cost'),
      notes: value('notes'),
      originalCost: value('original_cost'),
      purchaseDate: value('purchase_date'),
      responsiblePerson: value('responsible_person'),
      salvageValue: value('salvage_value') || '0',
      serialNo: value('serial_no'),
      supplierId: value('supplier_code'),
      usefulLifeMonths: value('useful_life_months') || '60',
      vatAmount: value('vat_amount') || '0',
      warrantyExpireDate: value('warranty_expire_date'),
    }
  })
}

function splitDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current)
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current)
  return cells
}

function Modal({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
      <div className="mt-8 w-full max-w-5xl rounded-2xl bg-white shadow-xl overflow-hidden">
        <div className="bg-slate-900 px-6 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  )
}

function ModalActions({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">{children}</div>
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="block text-xs font-medium text-slate-600"><span className="mb-1 block">{label}</span>{children}</label>
}

function SelectControl({ onChange, options, value }: { onChange: (value: string) => void; options: string[]; value: string }) {
  return <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
}

function OptionSelect({ blankLabel, onChange, options, value }: { blankLabel: string; onChange: (value: string) => void; options: { code: string; name: string }[]; value: string }) {
  return <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{blankLabel}</option>{options.map((option) => <option key={option.code} value={option.code}>{option.code} - {option.name}</option>)}</select>
}

function IdOptionSelect({ blankLabel, onChange, options, value }: { blankLabel: string; onChange: (value: string) => void; options: { code: string; id: string; name: string }[]; value: string }) {
  return <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{blankLabel}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.code} - {option.name}</option>)}</select>
}

function MoneyField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return <Field label={label}><input className={fieldClass} inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} /></Field>
}

function ActionButton({ children, disabled = false, onClick, strong = false }: { children: ReactNode; disabled?: boolean; onClick: () => void; strong?: boolean }) {
  const color = strong 
    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm focus:outline-none focus:ring-0' 
    : 'bg-transparent text-slate-500 hover:text-slate-800 border-none shadow-none focus:outline-none focus:ring-0'
  return <button className={`${color} rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 transition`} disabled={disabled} onClick={onClick} type="button">{children}</button>
}

function DisabledButton({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <button className={`${strong ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'} rounded-md px-4 py-2 text-sm font-medium shadow-sm opacity-65 focus:outline-none focus:ring-0`} disabled type="button">{children}</button>
}

function LinkButton({ children, href }: { children: ReactNode; href: string }) {
  return <a className="rounded-lg bg-slate-50 border border-slate-100 text-slate-600 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 transition outline-none focus:ring-0" href={href}>{children}</a>
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-900 text-sm">{title}</h2>
      {children}
    </div>
  )
}

function FilterPanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
      {children}
    </div>
  )
}

function TableShell({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      {title ? (
        <h2 className="border-b border-slate-100 px-4 py-3 font-bold text-slate-900 text-sm bg-slate-50/50">{title}</h2>
      ) : null}
      <div className="max-h-[60vh] overflow-auto">
        {children}
      </div>
    </div>
  )
}

function StatCard({ label, tone, value, icon }: { label: string; tone?: 'amber' | 'emerald' | 'red' | 'blue'; value: number | string; icon?: string }) {
  const labelColor = tone === 'amber' ? 'text-amber-600' : tone === 'emerald' ? 'text-emerald-600' : tone === 'red' ? 'text-red-600' : tone === 'blue' ? 'text-blue-600' : 'text-slate-500'
  const iconBgColor = tone === 'amber' ? 'bg-amber-50 text-amber-600' : tone === 'emerald' ? 'bg-emerald-50 text-emerald-600' : tone === 'red' ? 'bg-red-50 text-red-600' : tone === 'blue' ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-600'
  return (
    <div className="bg-white p-3 sm:p-5 border border-slate-100 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
      {icon && (
        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${iconBgColor} flex items-center justify-center text-xl shrink-0`}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className={`text-xs font-semibold ${labelColor} truncate`}>{label}</div>
        <div className="mt-0.5 text-sm sm:text-base font-bold text-slate-900 tracking-tight">{value}</div>
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="font-bold text-slate-900 text-xs">{value}</div>
    </div>
  )
}

function Bar({ label, max, value }: { label: string; max: number; value: number }) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-900">{formatMoney(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full bg-amber-500" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function MiniAssetTable({ isLoading, rows }: { isLoading: boolean; rows: DepreciationPayload['pendingAssets'] }) {
  return (
    <div>
      {/* Desktop view */}
      <div className="hidden lg:block overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
            <tr>
              <Th>รหัส</Th>
              <Th>ชื่อ</Th>
              <Th align="right">ต้นทุนสุทธิ</Th>
              <Th align="right">ค่าเสื่อมสะสมเดิม</Th>
              <Th align="right">NBV ปัจจุบัน</Th>
              <Th align="right">ค่าเสื่อม/เดือน</Th>
              <Th align="center">สถานะ</Th>
            </tr>
          </thead>
          <tbody>
            <LoadingOrEmpty colSpan={7} isLoading={isLoading} rows={rows.length} />
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors transition">
                <Td><span className="font-mono font-bold text-amber-700">{row.code}</span></Td>
                <Td className="font-semibold text-slate-800">{row.name}</Td>
                <Td align="right">{formatMoney(row.netAssetCost)}</Td>
                <Td align="right" className="text-slate-500">{formatMoney(row.accumDep)}</Td>
                <Td align="right" strong className="text-emerald-700">{formatMoney(row.nbv)}</Td>
                <Td align="right" className="text-amber-700 font-medium">{formatMoney(row.monthlyDep)}</Td>
                <Td align="center"><StatusPill status={row.assetStatus} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile view */}
      <div className="block lg:hidden space-y-2.5">
        {isLoading ? (
          <div className="text-center text-xs text-slate-400 py-6">กำลังโหลดข้อมูล...</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-6">ไม่มีรายการทรัพย์สินที่ต้องประมวลผล</div>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-mono text-xs text-amber-700 font-bold">{row.code}</span>
                <StatusPill status={row.assetStatus} />
              </div>
              <div className="text-xs font-semibold text-slate-800">{row.name}</div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div><span className="text-slate-400">ต้นทุนสุทธิ:</span> <span className="font-medium text-slate-700">{formatMoney(row.netAssetCost)}</span></div>
                <div><span className="text-slate-400">ค่าเสื่อมสะสมเดิม:</span> <span className="font-medium text-slate-500">{formatMoney(row.accumDep)}</span></div>
                <div><span className="text-slate-400">NBV:</span> <span className="font-bold text-emerald-700">{formatMoney(row.nbv)}</span></div>
                <div><span className="text-slate-400">ค่าเสื่อม/เดือน:</span> <span className="font-bold text-amber-700">{formatMoney(row.monthlyDep)}</span></div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function LoadingOrEmpty({ colSpan, emptyText = 'ยังไม่มีข้อมูล', isLoading, rows }: { colSpan: number; emptyText?: string; isLoading: boolean; rows: number }) {
  if (isLoading) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>กำลังโหลดข้อมูล</td></tr>
  if (rows === 0) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>{emptyText}</td></tr>
  return null
}

function Th({ align = 'left', children, className = '' }: { align?: 'center' | 'left' | 'right'; children: ReactNode; className?: string }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <th className={`whitespace-nowrap px-4 py-2.5 font-bold text-slate-600 bg-slate-50 border-b border-slate-100 ${textAlign} ${className}`}>{children}</th>
}

function Td({ align = 'left', children, strong = false, className = '', title }: { align?: 'center' | 'left' | 'right'; children: ReactNode; strong?: boolean; className?: string; title?: string }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <td title={title} className={`whitespace-nowrap px-4 py-3 border-b border-slate-100/60 ${textAlign} ${strong ? 'font-bold text-slate-900' : 'text-slate-700'} ${className}`}>{children}</td>
}

function Chip({ children, tone }: { children: ReactNode; tone: 'amber' | 'blue' | 'emerald' }) {
  const color = tone === 'blue' ? 'bg-blue-50 text-blue-700' : tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}>{children}</span>
}

function StatusPill({ status }: { status: string }) {
  let color = 'bg-slate-100 text-slate-700'
  let text = status

  if (status === 'Active' || status === 'active' || status === 'posted') {
    color = 'bg-emerald-50 text-emerald-700'
    text = status === 'posted' ? 'ประมวลผลแล้ว (posted)' : 'พร้อมใช้งาน (Active)'
  } else if (status === 'Fully Depreciated') {
    color = 'bg-blue-50 text-blue-700'
    text = 'หักค่าเสื่อมครบแล้ว'
  } else if (status === 'Maintenance') {
    color = 'bg-amber-50 text-amber-700'
    text = 'ซ่อมบำรุง'
  }
  
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${color}`}>{text}</span>
}

function EmptyText({ children }: { children: ReactNode }) {
  return <div className="text-sm text-slate-400">{children}</div>
}

function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>
}
