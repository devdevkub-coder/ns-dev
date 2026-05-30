'use client'

import { ArrowLeft, Download, ImagePlus, Plus, Save, X } from 'lucide-react'
import type React from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { Select } from '@/components/ui/Select'
import { dailyFetchJson, formatMoney, type DailyAccountOption } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { supplierAdvancePaymentFormSchema } from '@/lib/purchase-advance'

type OptionRow = {
  active: boolean | null
  code?: string | null
  id: string
  name: string
  type?: string | null
  unit?: string | null
}

type StatusOption = {
  label: string
  value: string
}

type AdvancePaymentSortDirection = 'asc' | 'desc'
type AdvancePaymentSortKey = 'accountName' | 'advanceDate' | 'allocatedAmount' | 'amount' | 'docNo' | 'largeScaleDocNo' | 'netWeight' | 'productName' | 'remainingAmount' | 'status' | 'supplierName'

type AdvancePaymentRow = {
  accountName: string
  advanceDate: string
  allocatedAmount: number
  allocations: AdvancePaymentAllocation[]
  branchId: string
  canCancel: boolean
  canEdit: boolean
  amount: number
  branchName: string
  cancelReason: string
  cancelledAt: string
  createdAt: string
  createdBy: string
  customerName: string
  docNo: string
  driverName: string
  fundingAccountId: string
  id: string
  inDate: string
  largeScaleDocNo: string
  netWeight: number
  outDate: string
  paymentMethod: string
  plateNo: string
  pricePerKg: number
  productName: string
  remainingAmount: number
  remark: string
  scaleOperator: string
  senderName: string
  status: string
  statusLabel: string
  supplierCode: string
  supplierId: string
  supplierName: string
  lockedReason?: string
  updatedAt: string
  updatedBy: string
  vehiclePhotoNames: string[]
  weightIn: number
  weightOut: number
}

type AdvancePaymentAllocation = {
  allocatedAmount: number
  allocatedAt: string
  allocatedBy: string
  id: string
  purchaseBillDocNo: string
  purchaseBillId: string
  status: string
  voidReason: string
  voidedAt: string
  voidedBy: string
}

type AdvancePaymentTimelineEvent = {
  action: string
  actorName: string
  eventKey: string
  id: string
  metadata: Record<string, unknown>
  occurredAt: string
  outcome: 'blocked' | 'failure' | 'success'
}

type AdvancePaymentDetail = AdvancePaymentRow & {
  timeline: AdvancePaymentTimelineEvent[]
}

type Payload = {
  accounts: DailyAccountOption[]
  branches: OptionRow[]
  filters: { statuses: StatusOption[] }
  pagination: {
    page: number
    pageSize: number
    totalPages: number
    totalRows: number
  }
  paymentMethods: OptionRow[]
  products: OptionRow[]
  rows: AdvancePaymentRow[]
  summary: {
    pendingCount: number
    totalAdvance: number
    totalAllocated: number
    totalRemaining: number
  }
  suppliers: OptionRow[]
}

type FormState = Record<string, string>

type UploadedImageFile = {
  fileName: string
  id: string
  url: string | null
}

const emptyForm = (): FormState => ({
  amount: '',
  branchId: '',
  customerName: '',
  docNo: '',
  driverName: '',
  fundingAccountId: '',
  inDate: '',
  largeScaleDocNo: '',
  netWeight: '',
  outDate: '',
  paymentMethod: '',
  plateNo: '',
  pricePerKg: '',
  productId: '',
  productName: '',
  remark: '',
  scaleOperator: '',
  senderName: '',
  supplierId: '',
  weightIn: '',
  weightOut: '',
})

function currentDateTimeLocalValue() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  const local = new Date(now.getTime() - (offset * 60 * 1000))
  return local.toISOString().slice(0, 16)
}

function isCashAccount(account: DailyAccountOption) {
  return String(account.type ?? '').trim().toLowerCase() === 'cash'
}

function normalizedAccountType(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase()
}

export function AdvancePaymentsPageClient() {
  const [cancelNote, setCancelNote] = useState('')
  const [cancelNoteError, setCancelNoteError] = useState('')
  const [data, setData] = useState<Payload | null>(null)
  const [detail, setDetail] = useState<AdvancePaymentDetail | null>(null)
  const [editingAdvanceId, setEditingAdvanceId] = useState<string | null>(null)
  const [editingAdvanceNo, setEditingAdvanceNo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [form, setForm] = useState<FormState>(() => emptyForm())
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [vehiclePhotoFiles, setVehiclePhotoFiles] = useState<UploadedImageFile[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [q, setQ] = useState('')
  const [statuses, setStatuses] = useState<string[]>([])
  const [sortDirection, setSortDirection] = useState<AdvancePaymentSortDirection>('desc')
  const [sortKey, setSortKey] = useState<AdvancePaymentSortKey>('advanceDate')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortDirection,
      sortKey,
    })
    if (q.trim()) params.set('q', q.trim())
    if (statuses.length > 0) params.set('statuses', statuses.join(','))
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    return params.toString()
  }, [dateFrom, dateTo, page, pageSize, q, sortDirection, sortKey, statuses])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const payload = await dailyFetchJson<Payload>(`/api/purchase/advance-payments?${queryString}`)
      setData(payload)
      setForm((current) => ({
        ...current,
        branchId: current.branchId,
        fundingAccountId: current.fundingAccountId,
        paymentMethod: current.paymentMethod,
      }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดรายการจ่ายเงินล่วงหน้าไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const supplierOptions = useMemo<SearchComboboxOption[]>(() => (data?.suppliers ?? []).map((supplier) => ({
    description: supplier.code ? `รหัส ${supplier.code}` : undefined,
    id: supplier.id,
    label: supplier.name,
    searchText: `${supplier.code ?? ''} ${supplier.name}`,
  })), [data?.suppliers])
  const activeProducts = useMemo(() => (data?.products ?? []).filter((product) => product.active !== false), [data?.products])
  const productOptions = useMemo<SearchComboboxOption[]>(() => activeProducts.map((product) => ({
    description: product.code ? `รหัส ${product.code}` : undefined,
    id: product.id,
    label: productOptionLabel(product),
    searchText: `${product.code ?? ''} ${product.name} ${product.unit ?? ''}`,
  })), [activeProducts])
  const selectedProduct = useMemo(() => activeProducts.find((product) => product.id === form.productId) ?? null, [activeProducts, form.productId])
  const paymentMethodOptions = useMemo(() => {
    return (data?.paymentMethods ?? [])
      .filter((method) => method.active !== false)
      .map((method) => ({ label: method.name, value: method.name }))
  }, [data?.paymentMethods])
  const filteredAccounts = useMemo(() => {
    const activeAccounts = (data?.accounts ?? []).filter((account) => account.active !== false)
    if (!form.paymentMethod) return activeAccounts
    const selectedMethodType = normalizedAccountType(
      (data?.paymentMethods ?? []).find((method) => method.name === form.paymentMethod)?.type,
    )
    if (!selectedMethodType) return []
    return activeAccounts.filter((account) => normalizedAccountType(account.type) === selectedMethodType)
  }, [data?.accounts, data?.paymentMethods, form.paymentMethod])

  const computedAmount = useMemo(() => {
    const netWeight = Number(form.netWeight)
    const pricePerKg = Number(form.pricePerKg)
    if (!Number.isFinite(netWeight) || !Number.isFinite(pricePerKg)) return 0
    return Math.max(0, netWeight * pricePerKg)
  }, [form.netWeight, form.pricePerKg])

  const closeForm = useCallback(() => {
    setEditingAdvanceId(null)
    setEditingAdvanceNo(null)
    setIsFormOpen(false)
    setVehiclePhotoFiles((current) => {
      current.forEach((file) => {
        if (file.url) URL.revokeObjectURL(file.url)
      })
      return []
    })
  }, [])

  const openForm = useCallback(() => {
    const defaultDateTime = currentDateTimeLocalValue()
    setEditingAdvanceId(null)
    setEditingAdvanceNo(null)
    setFieldErrors({})
    setError(null)
    setForm(() => ({
      ...emptyForm(),
      branchId: '',
      fundingAccountId: '',
      inDate: defaultDateTime,
      outDate: defaultDateTime,
      paymentMethod: '',
    }))
    setIsFormOpen(true)
  }, [])

  const openEditForm = useCallback((row: AdvancePaymentDetail | AdvancePaymentRow) => {
    const defaultDateTime = currentDateTimeLocalValue()
    const matchedProduct = (data?.products ?? []).find((product) => product.name === row.productName)
    setEditingAdvanceId(row.id)
    setEditingAdvanceNo(row.docNo)
    setFieldErrors({})
    setError(null)
    setForm({
      amount: row.amount ? String(row.amount) : '',
      branchId: 'branchId' in row ? row.branchId : '',
      customerName: row.customerName ?? '',
      docNo: row.docNo ?? '',
      driverName: 'driverName' in row ? row.driverName : '',
      fundingAccountId: 'fundingAccountId' in row ? row.fundingAccountId : '',
      inDate: 'inDate' in row && row.inDate ? row.inDate : defaultDateTime,
      largeScaleDocNo: row.largeScaleDocNo ?? '',
      netWeight: String(row.netWeight ?? ''),
      outDate: 'outDate' in row && row.outDate ? row.outDate : defaultDateTime,
      paymentMethod: row.paymentMethod ?? '',
      plateNo: 'plateNo' in row ? row.plateNo : '',
      pricePerKg: String(row.pricePerKg ?? ''),
      productId: matchedProduct?.id ?? '',
      productName: row.productName ?? '',
      remark: 'remark' in row ? row.remark : '',
      scaleOperator: 'scaleOperator' in row ? row.scaleOperator : '',
      senderName: 'senderName' in row ? row.senderName : '',
      supplierId: 'supplierId' in row ? row.supplierId : '',
      weightIn: String(row.weightIn ?? ''),
      weightOut: String(row.weightOut ?? ''),
    })
    setVehiclePhotoFiles(
      ('vehiclePhotoNames' in row ? row.vehiclePhotoNames : []).map((fileName) => ({
        fileName,
        id: `existing-${fileName}`,
        url: null,
      })),
    )
    setIsDetailOpen(false)
    setDetail(null)
    setIsFormOpen(true)
  }, [data?.products])

  const openCancelDialog = useCallback((row: AdvancePaymentDetail | AdvancePaymentRow) => {
    setDetail('timeline' in row ? row : null)
    setCancelNote('')
    setCancelNoteError('')
    setError(null)
    setIsCancelDialogOpen(true)
  }, [])

  const closeCancelDialog = useCallback(() => {
    setCancelNote('')
    setCancelNoteError('')
    setIsCancelDialogOpen(false)
  }, [])

  const loadDetail = useCallback(async (rowId: string) => {
    setError(null)
    setIsDetailLoading(true)
    setIsDetailOpen(true)
    try {
      const payload = await dailyFetchJson<AdvancePaymentDetail>(`/api/purchase/advance-payments/${rowId}`)
      setDetail(payload)
    } catch (caught) {
      setIsDetailOpen(false)
      setDetail(null)
      setError(caught instanceof Error ? caught.message : 'โหลดรายละเอียด ADV ไม่ได้')
    } finally {
      setIsDetailLoading(false)
    }
  }, [])

  const openCancelFromRow = useCallback(async (rowId: string) => {
    setError(null)
    setIsDetailLoading(true)
    try {
      const payload = await dailyFetchJson<AdvancePaymentDetail>(`/api/purchase/advance-payments/${rowId}`)
      setDetail(payload)
      setCancelNote('')
      setCancelNoteError('')
      setIsCancelDialogOpen(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดรายละเอียด ADV ไม่ได้')
    } finally {
      setIsDetailLoading(false)
    }
  }, [])

  const updateForm = (field: string, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  useEffect(() => {
    if (!form.fundingAccountId) return
    const selectedStillVisible = filteredAccounts.some((account) => account.id === form.fundingAccountId)
    if (selectedStillVisible) return
    setForm((current) => ({ ...current, fundingAccountId: '' }))
  }, [filteredAccounts, form.fundingAccountId])

  const removeVehiclePhoto = useCallback((fileId: string) => {
    setVehiclePhotoFiles((current) => {
      const target = current.find((file) => file.id === fileId)
      if (target?.url) URL.revokeObjectURL(target.url)
      return current.filter((file) => file.id !== fileId)
    })
    setFieldErrors((current) => {
      const next = { ...current }
      delete next.vehiclePhotoNames
      return next
    })
  }, [])

  const appendVehiclePhotos = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const additions = Array.from(files).slice(0, 10).map((file) => ({
      fileName: file.name,
      id: crypto.randomUUID(),
      url: URL.createObjectURL(file),
    }))
    setVehiclePhotoFiles((current) => [...current, ...additions].slice(0, 10))
    setFieldErrors((current) => {
      const next = { ...current }
      delete next.vehiclePhotoNames
      return next
    })
  }, [])

  const submitForm = async () => {
    setError(null)
    setFieldErrors({})
    const parsed = supplierAdvancePaymentFormSchema.safeParse({
      ...form,
      productName: selectedProduct?.name ?? '',
      vehiclePhotoNames: vehiclePhotoFiles.map((file) => file.fileName),
    })
    if (!parsed.success) {
      const flattened = parsed.error.flatten().fieldErrors
      setFieldErrors(Object.fromEntries(Object.entries(flattened).map(([key, messages]) => [key, messages?.[0] ?? 'ข้อมูลไม่ถูกต้อง'])))
      return
    }

    setIsSaving(true)
    try {
      const saved = await dailyFetchJson<{ id: string }>(editingAdvanceId ? `/api/purchase/advance-payments/${editingAdvanceId}` : '/api/purchase/advance-payments', {
        body: JSON.stringify(parsed.data),
        method: editingAdvanceId ? 'PUT' : 'POST',
      })
      setForm(emptyForm())
      closeForm()
      await loadData()
      if (saved.id) await loadDetail(saved.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกรายการจ่ายเงินล่วงหน้าไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const submitCancel = async () => {
    const row = detail
    if (!row) return
    const note = cancelNote.trim()
    if (!note) {
      setCancelNoteError('กรอกเหตุผลการยกเลิก')
      return
    }
    setError(null)
    setCancelNoteError('')
    setIsSaving(true)
    try {
      await dailyFetchJson(`/api/purchase/advance-payments/${row.id}`, {
        body: JSON.stringify({ note }),
        method: 'PATCH',
      })
      closeCancelDialog()
      setIsDetailOpen(false)
      setDetail(null)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ยกเลิกรายการ ADV ไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const clearFilters = () => {
    setQ('')
    setStatuses([])
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  const changeSort = (nextKey: AdvancePaymentSortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(nextKey)
      setSortDirection(nextKey === 'advanceDate' ? 'desc' : 'asc')
    }
    setPage(1)
  }

  const hasActiveFilters = Boolean(q || dateFrom || dateTo || statuses.length > 0)
  const exportHref = useMemo(() => `/api/purchase/advance-payments?${queryString ? `${queryString}&` : ''}format=xlsx`, [queryString])

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      {isFormOpen ? (
        <>
          <div>
            <Button type="button" variant="outline" onClick={closeForm}><ArrowLeft className="mr-1 h-4 w-4" />กลับไปหน้ารายการ</Button>
          </div>
          <div className="rounded-md bg-white p-4 shadow">
          <div className="mb-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">{editingAdvanceId ? `แก้ไขรายการ ADV ${editingAdvanceNo ?? ''}` : 'สร้างรายการจ่ายเงินล่วงหน้า / มัดจำ'}</div>
              <div className="text-xs text-slate-500">{editingAdvanceId ? 'แก้ไขได้เฉพาะรายการที่ยังไม่อนุมัติ และยังไม่ถูกใช้หักบิล' : 'บันทึกเอกสาร ADV ใหม่จากข้อมูลใบชั่งใหญ่และข้อมูลการจ่ายเงิน'}</div>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <FormSection
                description="ระบุผู้ขาย วิธีจ่าย และยอดเงินที่ต้องจ่ายล่วงหน้า"
                title="ข้อมูลการเงิน"
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <SearchCombobox error={fieldErrors.supplierId} errorKey="supplierId" inputId="advance-supplier" label="ผู้ขาย *" options={supplierOptions} value={form.supplierId} onChange={(value) => updateForm('supplierId', value)} />
                  <Field error={fieldErrors.branchId} label="สาขา *">
                    <Select className={`h-9 w-full px-2 py-1.5 ${form.branchId ? '' : 'text-slate-400'}`} value={form.branchId} onChange={(event) => updateForm('branchId', event.target.value)}>
                      <option disabled value="">เลือกสาขา</option>
                      {(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    </Select>
                  </Field>
                  <Field error={fieldErrors.paymentMethod} label="วิธีจ่าย *">
                    <Select className={form.paymentMethod ? '' : 'text-slate-400'} value={form.paymentMethod} onChange={(event) => updateForm('paymentMethod', event.target.value)}>
                      <option disabled value="">เลือกวิธีจ่าย</option>
                      {paymentMethodOptions.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                    </Select>
                  </Field>
                  <Field error={fieldErrors.fundingAccountId} label="บัญชีที่จ่าย *">
                    <Select
                      className={form.fundingAccountId ? '' : 'text-slate-400'}
                      disabled={!form.paymentMethod}
                      value={form.fundingAccountId}
                      onChange={(event) => updateForm('fundingAccountId', event.target.value)}
                    >
                      <option disabled value="">{form.paymentMethod ? 'เลือกบัญชี' : 'เลือกวิธีจ่ายก่อน'}</option>
                      {filteredAccounts.map((account) => <option key={account.id} value={account.id}>{accountOptionLabel(account)}</option>)}
                    </Select>
                    {!form.paymentMethod ? <p className="mt-1 text-xs text-slate-500">กรุณาเลือกวิธีจ่ายก่อน แล้วระบบจะเปิดรายการบัญชีที่รองรับ</p> : null}
                    {form.paymentMethod && filteredAccounts.length === 0 ? <p className="mt-1 text-xs text-amber-700">ไม่พบบัญชีที่รองรับวิธีจ่ายนี้</p> : null}
                  </Field>
                  <MoneyInputField error={fieldErrors.amount} label="ยอดมัดจำ *" value={form.amount} onChange={(value) => updateForm('amount', value)} />
                </div>
              </FormSection>

              <FormSection
                description="ผูกเอกสาร ADV กับข้อมูลอ้างอิงจากรถเข้า/ใบชั่งใหญ่"
                title="อ้างอิงใบชั่งใหญ่"
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <InputField error={fieldErrors.largeScaleDocNo} label="เลขที่ใบชั่งใหญ่" value={form.largeScaleDocNo} onChange={(value) => updateForm('largeScaleDocNo', value)} />
                  <InputField className="max-w-[220px]" error={fieldErrors.inDate} label="วันที่รถเข้า" step="60" type="datetime-local" value={form.inDate} onChange={(value) => updateForm('inDate', value)} />
                  <InputField className="max-w-[220px]" error={fieldErrors.outDate} label="วันที่รถออก" step="60" type="datetime-local" value={form.outDate} onChange={(value) => updateForm('outDate', value)} />
                </div>
              </FormSection>

              <FormSection
                description="กรอกข้อมูลสินค้า น้ำหนัก และราคาที่ใช้คำนวณอ้างอิง"
                title="สินค้าและน้ำหนัก"
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <InputField error={fieldErrors.customerName} label="ชื่อลูกค้า" value={form.customerName} onChange={(value) => updateForm('customerName', value)} />
                  <SearchCombobox
                    error={fieldErrors.productName}
                    errorKey="productName"
                    inputId="advance-product"
                    label="ชื่อสินค้า"
                    options={productOptions}
                    placeholder="พิมพ์รหัส/ชื่อสินค้า..."
                    value={form.productId}
                    onChange={(value) => updateForm('productId', value)}
                  />
                  <InputField error={fieldErrors.weightIn} label="น้ำหนักเข้า *" min="0" step="0.01" type="number" value={form.weightIn} onChange={(value) => updateForm('weightIn', value)} />
                  <InputField error={fieldErrors.weightOut} label="น้ำหนักออก *" min="0" step="0.01" type="number" value={form.weightOut} onChange={(value) => updateForm('weightOut', value)} />
                  <InputField error={fieldErrors.netWeight} label="น้ำหนักสุทธิ *" min="0" step="0.01" type="number" value={form.netWeight} onChange={(value) => updateForm('netWeight', value)} />
                  <MoneyInputField error={fieldErrors.pricePerKg} label="ราคา/กก. *" value={form.pricePerKg} onChange={(value) => updateForm('pricePerKg', value)} />
                </div>
              </FormSection>

              <FormSection
                description="รวบรวมข้อมูลตัวรถ รูปประกอบ และผู้ขับในจุดเดียว"
                title="ข้อมูลรถและผู้ขับ"
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <InputField error={fieldErrors.plateNo} label="ทะเบียนรถ" value={form.plateNo} onChange={(value) => updateForm('plateNo', value)} />
                  <InputField error={fieldErrors.driverName} label="พนักงานขับรถ" value={form.driverName} onChange={(value) => updateForm('driverName', value)} />
                  <div className="md:col-span-2 xl:col-span-3">
                    <Field error={fieldErrors.vehiclePhotoNames} label="รูปภาพรถ">
                      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3">
                        <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100">
                          <ImagePlus className="h-4 w-4" />
                          อัปโหลดรูปภาพรถ
                          <input
                            accept="image/*"
                            className="hidden"
                            multiple
                            type="file"
                            onChange={(event) => {
                              appendVehiclePhotos(event.target.files)
                              event.target.value = ''
                            }}
                          />
                        </label>
                        <div className="mt-2 space-y-2">
                          {vehiclePhotoFiles.length === 0 ? <div className="text-xs text-slate-400">ยังไม่มีรูปภาพรถ</div> : null}
                          {vehiclePhotoFiles.map((file) => (
                            <div key={file.id} className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-xs ring-1 ring-slate-200">
                              {file.url ? (
                                <button
                                  className="min-w-0 flex-1 truncate text-left text-slate-700 hover:text-blue-700 hover:underline"
                                  title={file.fileName}
                                  type="button"
                                  onClick={() => window.open(file.url ?? '', '_blank', 'noopener,noreferrer')}
                                >
                                  {file.fileName}
                                </button>
                              ) : (
                                <span className="min-w-0 flex-1 truncate text-slate-700" title={file.fileName}>{file.fileName}</span>
                              )}
                              <button className="shrink-0 text-slate-500 hover:text-red-600" type="button" onClick={() => removeVehiclePhoto(file.id)}>
                                ลบ
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Field>
                  </div>
                </div>
              </FormSection>

              <FormSection
                description="ข้อมูลเสริมสำหรับการติดตามเอกสารและการตรวจสอบย้อนหลัง"
                title="ข้อมูลประกอบ"
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <InputField error={fieldErrors.scaleOperator} label="ผู้ชั่งน้ำหนัก" value={form.scaleOperator} onChange={(value) => updateForm('scaleOperator', value)} />
                  <InputField error={fieldErrors.senderName} label="ผู้ส่ง" value={form.senderName} onChange={(value) => updateForm('senderName', value)} />
                  <div className="md:col-span-2 xl:col-span-4">
                    <TextAreaField error={fieldErrors.remark} label="หมายเหตุ" rows={3} value={form.remark} onChange={(value) => updateForm('remark', value)} />
                  </div>
                </div>
              </FormSection>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-800">สรุปก่อนบันทึก</div>
              <SummaryLine label="น้ำหนักสุทธิ x ราคา" value={formatMoney(computedAmount)} />
              <SummaryLine label="ยอดมัดจำ" value={formatMoney(Number(form.amount) || 0)} />
              <SummaryLine label="ส่วนต่าง" value={formatMoney((Number(form.amount) || 0) - computedAmount)} />
              <div className="mt-4 flex gap-2">
                <Button disabled={isSaving} type="button" onClick={submitForm}><Save className="mr-1 h-4 w-4" />{isSaving ? 'กำลังบันทึก...' : editingAdvanceId ? 'บันทึกการแก้ไข' : 'บันทึก ADV'}</Button>
                <Button type="button" variant="outline" onClick={closeForm}>ปิด</Button>
              </div>
            </div>
          </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Metric label="ยอดมัดจำในหน้านี้" value={formatMoney(data?.summary.totalAdvance ?? 0)} />
            <Metric label="ยังไม่อนุมัติ" value={`${data?.summary.pendingCount ?? 0}`} />
            <Metric label="ใช้หักบิลแล้ว" value={formatMoney(data?.summary.totalAllocated ?? 0)} />
            <Metric label="คงเหลือ" tone="amber" value={formatMoney(data?.summary.totalRemaining ?? 0)} />
          </div>

            <div className="space-y-2 rounded-md bg-white p-3 shadow">
              <div className="flex flex-wrap items-center gap-2">
              <Input className="min-w-[260px] flex-1 rounded-md" placeholder="ค้นหา ADV / ใบชั่งใหญ่ / ผู้ขาย / ทะเบียน..." type="search" value={q} onChange={(event) => { setQ(event.target.value); setPage(1) }} />
              <label className="text-xs text-slate-500">วันที่:</label>
              <DatePickerInput ariaLabel="จากวันที่" id="advance-payments-date-from" value={dateFrom} onChange={(value) => { setDateFrom(value); setPage(1) }} />
              <span className="text-slate-400">→</span>
              <DatePickerInput ariaLabel="ถึงวันที่" id="advance-payments-date-to" value={dateTo} onChange={(value) => { setDateTo(value); setPage(1) }} />
              {hasActiveFilters ? <Button size="xs" type="button" variant="secondary" onClick={clearFilters}>✕ ล้าง</Button> : null}
              <ExportButton href={exportHref} />
              <Button className="ml-auto h-9" size="sm" type="button" onClick={openForm}><Plus className="mr-1 h-4 w-4" />สร้าง</Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">สถานะ:</span>
              <Segment
                active={statuses.length === 0}
                label="ทั้งหมด"
                onClick={() => {
                  setStatuses([])
                  setPage(1)
                }}
              />
              {(data?.filters.statuses ?? []).filter((option) => option.value !== 'all').map((option) => (
                <Segment
                  key={option.value}
                  active={statuses.includes(option.value)}
                  label={option.label}
                  onClick={() => {
                    toggleStatusFilter(option.value, setStatuses)
                    setPage(1)
                  }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <span>พบทั้งหมด {data?.pagination.totalRows ?? 0} รายการ</span>
            <div className="flex flex-wrap items-center gap-2">
              <Select aria-label="จำนวนรายการต่อหน้า" className="h-9 w-auto min-w-[96px] px-2" value={String(pageSize)} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>
                {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
              </Select>
              <Button className="h-9 font-normal" disabled={page <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</Button>
              <span className="px-1">หน้า {data?.pagination.page ?? page} / {data?.pagination.totalPages ?? 1}</span>
              <Button className="h-9 font-normal" disabled={page >= (data?.pagination.totalPages ?? 1)} size="sm" type="button" variant="outline" onClick={() => setPage((current) => current + 1)}>ถัดไป</Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md bg-white shadow">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <AdvancePaymentSortHeader activeKey={sortKey} direction={sortDirection} label="เลขที่" sortKey="docNo" onSort={changeSort} />
                  <AdvancePaymentSortHeader activeKey={sortKey} direction={sortDirection} label="วันที่" sortKey="advanceDate" onSort={changeSort} />
                  <AdvancePaymentSortHeader activeKey={sortKey} direction={sortDirection} label="ผู้ขาย" sortKey="supplierName" onSort={changeSort} />
                  <AdvancePaymentSortHeader activeKey={sortKey} direction={sortDirection} label="ใบชั่งใหญ่" sortKey="largeScaleDocNo" onSort={changeSort} />
                  <AdvancePaymentSortHeader activeKey={sortKey} direction={sortDirection} label="ทะเบียน / สินค้า" sortKey="productName" onSort={changeSort} />
                  <AdvancePaymentSortHeader activeKey={sortKey} align="right" direction={sortDirection} label="น้ำหนักสุทธิ" sortKey="netWeight" onSort={changeSort} />
                  <AdvancePaymentSortHeader activeKey={sortKey} align="right" direction={sortDirection} label="ยอดมัดจำ" sortKey="amount" onSort={changeSort} />
                  <AdvancePaymentSortHeader activeKey={sortKey} align="right" direction={sortDirection} label="ใช้แล้ว" sortKey="allocatedAmount" onSort={changeSort} />
                  <AdvancePaymentSortHeader activeKey={sortKey} align="right" direction={sortDirection} label="คงเหลือ" sortKey="remainingAmount" onSort={changeSort} />
                  <AdvancePaymentSortHeader activeKey={sortKey} direction={sortDirection} label="สถานะ" sortKey="status" onSort={changeSort} />
                  <th className="p-2 text-right text-xs font-semibold text-slate-700">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={11}>กำลังโหลดข้อมูล</td></tr> : null}
                {!isLoading && (data?.rows ?? []).length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={11}>ยังไม่มีรายการจ่ายเงินล่วงหน้า</td></tr> : null}
                {!isLoading && (data?.rows ?? []).map((row) => (
                  <tr key={row.id} className="cursor-pointer hover:bg-slate-50" onClick={() => void loadDetail(row.id)}>
                    <td className="p-2 font-mono text-xs whitespace-nowrap">{row.docNo}</td>
                    <td className="p-2 whitespace-nowrap">{row.advanceDate}</td>
                    <td className="p-2">{row.supplierName}</td>
                    <td className="p-2 font-mono text-xs">{row.largeScaleDocNo || '-'}</td>
                    <td className="p-2"><div>{row.plateNo || '-'}</div><div className="text-xs text-slate-500">{row.productName || '-'}</div></td>
                    <td className="p-2 text-right tabular-nums">{formatMoney(row.netWeight)}</td>
                    <td className="p-2 text-right font-medium tabular-nums">{formatMoney(row.amount)}</td>
                    <td className="p-2 text-right tabular-nums">{formatMoney(row.allocatedAmount)}</td>
                    <td className="p-2 text-right font-semibold text-amber-700 tabular-nums">{formatMoney(row.remainingAmount)}</td>
                    <td className="p-2"><StatusDot status={row.status} label={row.statusLabel} /></td>
                    <td className="p-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          className="px-2 py-1 text-xs"
                          disabled={!row.canEdit}
                          size="xs"
                          title={!row.canEdit ? row.lockedReason ?? 'รายการนี้ยังแก้ไขไม่ได้' : undefined}
                          type="button"
                          variant="outline"
                          onClick={(event) => {
                            event.stopPropagation()
                            openEditForm(row)
                          }}
                        >
                          แก้ไข
                        </Button>
                        <Button
                          className="px-2 py-1 text-xs"
                          disabled={!row.canCancel}
                          size="xs"
                          title={!row.canCancel ? row.lockedReason ?? 'รายการนี้ยังยกเลิกไม่ได้' : undefined}
                          type="button"
                          variant="outline"
                          onClick={(event) => {
                            event.stopPropagation()
                            void openCancelFromRow(row.id)
                          }}
                        >
                          ยกเลิก
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Dialog open={isDetailOpen} onOpenChange={(open) => {
        setIsDetailOpen(open)
        if (!open) setDetail(null)
      }}>
        <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto" fallbackTitle="รายละเอียด ADV">
          <DialogHeader>
            <DialogTitle>{detail?.docNo ? `รายละเอียด ${detail.docNo}` : 'รายละเอียด ADV'}</DialogTitle>
            <DialogDescription>กดที่รายการเพื่อดูข้อมูลเอกสาร การหักบิลย้อนหลัง และ timeline ของรายการ ADV</DialogDescription>
          </DialogHeader>
          {isDetailLoading ? <div className="px-4 pb-6 text-sm text-slate-500">กำลังโหลดรายละเอียด...</div> : null}
          {!isDetailLoading && detail ? (
            <div className="space-y-4 px-4 pb-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Metric label="ยอดมัดจำ" value={formatMoney(detail.amount)} />
                <Metric label="ใช้หักบิลแล้ว" value={formatMoney(detail.allocatedAmount)} />
                <Metric label="คงเหลือ" tone="amber" value={formatMoney(detail.remainingAmount)} />
                <Metric label="สถานะ" value={detail.statusLabel} />
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <div className="rounded-md border border-slate-200 p-4">
                  <div className="mb-3 text-sm font-semibold text-slate-900">ข้อมูลเอกสาร</div>
                  <DetailGrid
                    items={[
                      ['ผู้ขาย', detail.supplierName],
                      ['สาขา', detail.branchName],
                      ['วิธีจ่าย', detail.paymentMethod || '-'],
                      ['บัญชีที่จ่าย', detail.accountName || '-'],
                      ['วันที่เอกสาร', formatDateDisplay(detail.advanceDate)],
                      ['วันที่รถเข้า', formatDateTimeDisplay(detail.inDate)],
                      ['วันที่รถออก', formatDateTimeDisplay(detail.outDate)],
                      ['ใบชั่งใหญ่', detail.largeScaleDocNo || '-'],
                      ['ทะเบียนรถ', detail.plateNo || '-'],
                      ['ชื่อลูกค้า', detail.customerName || '-'],
                      ['สินค้า', detail.productName || '-'],
                      ['น้ำหนักเข้า', formatMoney(detail.weightIn)],
                      ['น้ำหนักออก', formatMoney(detail.weightOut)],
                      ['น้ำหนักสุทธิ', formatMoney(detail.netWeight)],
                      ['ราคา/กก.', formatMoney(detail.pricePerKg)],
                      ['ผู้ชั่ง', detail.scaleOperator || '-'],
                      ['ผู้ส่ง', detail.senderName || '-'],
                      ['คนขับรถ', detail.driverName || '-'],
                      ['หมายเหตุ', detail.remark || '-'],
                    ]}
                  />
                  {detail.vehiclePhotoNames.length > 0 ? (
                    <div className="mt-4">
                      <div className="mb-2 text-xs font-medium text-slate-600">รูปภาพรถ</div>
                      <div className="flex flex-wrap gap-2">
                        {detail.vehiclePhotoNames.map((name) => <span key={name} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">{name}</span>)}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <div className="rounded-md border border-slate-200 p-4">
                    <div className="mb-3 text-sm font-semibold text-slate-900">การติดตามสถานะ</div>
                    <DetailGrid
                      items={[
                        ['สร้างโดย', detail.createdBy || '-'],
                        ['สร้างเมื่อ', formatDateTimeDisplay(detail.createdAt)],
                        ['อัปเดตล่าสุดโดย', detail.updatedBy || '-'],
                        ['อัปเดตล่าสุดเมื่อ', formatDateTimeDisplay(detail.updatedAt)],
                        ['ยกเลิกเมื่อ', detail.cancelledAt ? formatDateTimeDisplay(detail.cancelledAt) : '-'],
                        ['เหตุผลยกเลิก', detail.cancelReason || '-'],
                      ]}
                    />
                  </div>

                  <div className="rounded-md border border-slate-200 p-4">
                    <div className="mb-3 text-sm font-semibold text-slate-900">รายการหักบิล</div>
                    {detail.allocations.length === 0 ? <div className="text-sm text-slate-400">ยังไม่มีการใช้ ADV หักบิล</div> : (
                      <div className="space-y-2">
                        {detail.allocations.map((allocation) => (
                          <div key={allocation.id} className="rounded-md bg-slate-50 p-3 text-sm">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-medium text-slate-800">{allocation.purchaseBillDocNo || '-'}</div>
                                <div className="text-xs text-slate-500">{allocation.status === 'voided' ? 'ยกเลิกการหักบิลแล้ว' : 'หักบิลแล้ว'} โดย {allocation.status === 'voided' ? allocation.voidedBy || '-' : allocation.allocatedBy || '-'}</div>
                              </div>
                              <div className="text-right font-semibold tabular-nums text-slate-900">{formatMoney(allocation.allocatedAmount)}</div>
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {allocation.status === 'voided'
                                ? `ยกเลิกเมื่อ ${formatDateTimeDisplay(allocation.voidedAt)}${allocation.voidReason ? ` · ${allocation.voidReason}` : ''}`
                                : `หักเมื่อ ${formatDateTimeDisplay(allocation.allocatedAt)}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 p-4">
                <div className="mb-3 text-sm font-semibold text-slate-900">Timeline</div>
                {detail.timeline.length === 0 ? <div className="text-sm text-slate-400">ยังไม่มี timeline ของรายการนี้</div> : (
                  <div className="space-y-3">
                    {detail.timeline.map((event) => (
                      <div key={event.id} className="flex gap-3 rounded-md bg-slate-50 p-3">
                        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${timelineTone(event)}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-medium text-slate-900">{timelineLabel(event)}</div>
                            <div className="text-xs text-slate-500">{formatDateTimeDisplay(event.occurredAt)}</div>
                          </div>
                          <div className="mt-1 text-xs text-slate-600">โดย {event.actorName || '-'}</div>
                          {timelineMetadataText(event) ? <div className="mt-1 text-xs text-slate-500">{timelineMetadataText(event)}</div> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              disabled={!detail?.canEdit}
              title={!detail?.canEdit ? detail?.lockedReason ?? 'รายการนี้ยังแก้ไขไม่ได้' : undefined}
              type="button"
              variant="outline"
              onClick={() => detail ? openEditForm(detail) : undefined}
            >
              แก้ไข
            </Button>
            <Button
              disabled={!detail?.canCancel}
              title={!detail?.canCancel ? detail?.lockedReason ?? 'รายการนี้ยังยกเลิกไม่ได้' : undefined}
              type="button"
              variant="outline"
              onClick={() => detail ? openCancelDialog(detail) : undefined}
            >
              ยกเลิก
            </Button>
            <Button type="button" variant="secondary" onClick={() => setIsDetailOpen(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCancelDialogOpen} onOpenChange={(open) => {
        setIsCancelDialogOpen(open)
        if (!open) closeCancelDialog()
      }}>
        <DialogContent className="max-w-lg" fallbackTitle="ยกเลิกรายการ ADV">
          <DialogHeader>
            <DialogTitle>ยกเลิกรายการ ADV {detail?.docNo ?? ''}</DialogTitle>
            <DialogDescription>ระบบจะเปลี่ยนสถานะเป็นยกเลิกและเก็บเหตุผลไว้ใน timeline</DialogDescription>
          </DialogHeader>
          <div className="px-4 pb-4">
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="advance-payment-cancel-note">เหตุผลการยกเลิก *</label>
            <textarea
              id="advance-payment-cancel-note"
              className={`w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 ${cancelNoteError ? 'border-red-400 bg-red-50' : ''}`.trim()}
              rows={4}
              value={cancelNote}
              onChange={(event) => setCancelNote(event.target.value)}
            />
            {cancelNoteError ? <div className="mt-1 text-xs text-red-600">{cancelNoteError}</div> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={closeCancelDialog}>ปิด</Button>
            <Button className="bg-red-600 hover:bg-red-700" disabled={isSaving} type="button" onClick={submitCancel}>{isSaving ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function Field({ children, error, label }: { children: React.ReactNode; error?: string; label: string }) {
  const hasInlineRequired = label.trim().endsWith('*')
  const labelText = hasInlineRequired ? label.trim().slice(0, -1).trimEnd() : label
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-600">{labelText}{hasInlineRequired ? <span className="ml-1 text-red-600">*</span> : null}</div>
      {children}
      {error ? <div className="mt-1 text-xs text-red-600">{error}</div> : null}
    </div>
  )
}

function accountOptionLabel(account: DailyAccountOption) {
  const balanceSuffix = ` (คงเหลือ ${formatMoney(account.balance ?? 0)})`
  return `${account.name}${balanceSuffix}`
}

function productOptionLabel(option: OptionRow) {
  return option.code ? `${option.code} - ${option.name}` : option.name
}

function FormSection({ children, description, title }: { children: React.ReactNode; description: string; title: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-4">
      <div className="mb-4">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="mt-1 text-xs text-slate-500">{description}</div>
      </div>
      {children}
    </div>
  )
}

function InputField({ className, error, label, onChange, type = 'text', value, ...props }: { error?: string; label: string; onChange: (value: string) => void; type?: string; value: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  const numberClassName = type === 'number'
    ? '[appearance:textfield] text-right [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
    : ''
  return (
    <Field error={error} label={label}>
      <Input aria-invalid={Boolean(error)} className={`${numberClassName} ${error ? 'border-red-400 bg-red-50' : ''} ${className ?? ''}`.trim()} type={type} value={value} onChange={(event) => onChange(event.target.value)} {...props} />
    </Field>
  )
}

function ExportButton({ href }: { href: string }) {
  return (
    <Button asChild className="gap-2" variant="export">
      <a href={href}>
        <Download className="h-4 w-4 shrink-0" />
        <span>ส่งออก Excel</span>
      </a>
    </Button>
  )
}

function AdvancePaymentSortHeader({
  activeKey,
  align = 'left',
  direction,
  label,
  onSort,
  sortKey,
}: {
  activeKey: AdvancePaymentSortKey
  align?: 'left' | 'right'
  direction: AdvancePaymentSortDirection
  label: string
  onSort: (key: AdvancePaymentSortKey) => void
  sortKey: AdvancePaymentSortKey
}) {
  const active = activeKey === sortKey
  const alignClass = align === 'right' ? 'justify-end text-right' : 'justify-start text-left'
  return (
    <th className="p-0">
      <button className={`flex w-full items-center gap-1 p-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 ${alignClass}`} type="button" onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        <span className="text-slate-400">{active ? (direction === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
}

function sanitizeMoneyInput(value: string) {
  const digitsOnly = value.replace(/,/g, '').replace(/[^\d.]/g, '')
  const [integerPart = '', decimalPart = ''] = digitsOnly.split('.')
  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, '') || (digitsOnly.startsWith('.') ? '0' : integerPart)
  if (digitsOnly.includes('.')) return `${normalizedInteger || '0'}.${decimalPart.slice(0, 2)}`
  return normalizedInteger
}

function formatMoneyInput(value: string) {
  const normalized = sanitizeMoneyInput(value)
  if (!normalized) return ''
  const numericValue = Number(normalized)
  if (!Number.isFinite(numericValue)) return ''
  return numericValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function MoneyInputField({ error, label, onChange, value }: { error?: string; label: string; onChange: (value: string) => void; value: string }) {
  const [isFocused, setIsFocused] = useState(false)
  const displayValue = isFocused ? value : formatMoneyInput(value)

  return (
    <Field error={error} label={label}>
      <Input
        aria-invalid={Boolean(error)}
        className={`text-right ${error ? 'border-red-400 bg-red-50' : ''}`.trim()}
        inputMode="decimal"
        type="text"
        value={displayValue}
        onBlur={() => setIsFocused(false)}
        onChange={(event) => onChange(sanitizeMoneyInput(event.target.value))}
        onFocus={() => setIsFocused(true)}
      />
    </Field>
  )
}

function TextAreaField({ error, label, onChange, rows = 3, value, ...props }: { error?: string; label: string; onChange: (value: string) => void; rows?: number; value: string } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'>) {
  return (
    <Field error={error} label={label}>
      <textarea
        aria-invalid={Boolean(error)}
        className={`w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 ${error ? 'border-red-400 bg-red-50' : ''}`.trim()}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...props}
      />
    </Field>
  )
}

function Segment({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button className={`rounded-md border px-3 py-1 text-xs font-medium ${active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`} type="button" onClick={onClick}>{label}</button>
}

function toggleStatusFilter(value: string, setStatuses: Dispatch<SetStateAction<string[]>>) {
  setStatuses((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
}

function Metric({ label, tone, value }: { label: string; tone?: 'amber'; value: string }) {
  return <div className="rounded-md bg-white p-3 shadow"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-lg font-bold ${tone === 'amber' ? 'text-amber-700' : 'text-slate-900'}`}>{value}</div></div>
}

function StatusDot({ label, status }: { label: string; status: string }) {
  const color = status === 'pending_approval'
    ? 'bg-amber-500 text-amber-700'
    : status === 'paid' || status === 'allocated'
      ? 'bg-emerald-500 text-emerald-700'
      : status === 'cancelled'
        ? 'bg-red-500 text-red-700'
        : 'bg-blue-500 text-blue-700'
  return <span className={`inline-flex items-center gap-2 whitespace-nowrap text-xs ${color.split(' ')[1]}`}><span className={`h-2 w-2 rounded-full ${color.split(' ')[0]}`} />{label}</span>
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return <div className="mt-3 flex items-center justify-between text-sm"><span className="text-slate-500">{label}</span><span className="font-semibold tabular-nums">{value}</span></div>
}

function formatDateTimeDisplay(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value.replace('T', ' ')
  }
  return date.toLocaleString('th-TH', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  })
}

function DetailGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <div className="text-xs text-slate-500">{label}</div>
          <div className="truncate text-sm text-slate-900" title={value}>{value}</div>
        </div>
      ))}
    </div>
  )
}

function timelineTone(event: AdvancePaymentTimelineEvent) {
  if (event.outcome === 'failure') return 'bg-red-500'
  if (event.outcome === 'blocked') return 'bg-amber-500'
  if (event.action === 'cancel' || event.eventKey.includes('cancel')) return 'bg-red-500'
  if (event.action === 'allocate' || event.eventKey.includes('allocated')) return 'bg-blue-500'
  return 'bg-emerald-500'
}

function timelineLabel(event: AdvancePaymentTimelineEvent) {
  if (event.eventKey === 'purchase.advance-payment.created') return 'สร้างรายการ ADV'
  if (event.eventKey === 'purchase.advance-payment.updated') return 'แก้ไขรายการ ADV'
  if (event.eventKey === 'purchase.advance-payment.cancelled') return 'ยกเลิกรายการ ADV'
  if (event.eventKey === 'purchase.advance-payment.allocated') return 'ใช้ ADV หักบิล'
  if (event.eventKey === 'purchase.advance-payment.allocation-voided') return 'ยกเลิกการหักบิล ADV'
  return event.action
}

function timelineMetadataText(event: AdvancePaymentTimelineEvent) {
  if (event.eventKey === 'purchase.advance-payment.allocated' || event.eventKey === 'purchase.advance-payment.allocation-voided') {
    const purchaseBillDocNo = String(event.metadata.purchaseBillDocNo ?? '')
    const allocatedAmount = typeof event.metadata.allocatedAmount === 'number'
      ? formatMoney(event.metadata.allocatedAmount)
      : ''
    const voidReason = String(event.metadata.voidReason ?? '')
    return [purchaseBillDocNo ? `บิล ${purchaseBillDocNo}` : '', allocatedAmount ? `จำนวน ${allocatedAmount}` : '', voidReason].filter(Boolean).join(' · ')
  }
  if (event.eventKey === 'purchase.advance-payment.cancelled') {
    return String(event.metadata.cancelReason ?? '')
  }
  return ''
}
