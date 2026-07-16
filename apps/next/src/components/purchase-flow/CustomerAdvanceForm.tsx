'use client'

import { ChevronLeft, ChevronRight, Plus, Save, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'

import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { Select } from '@/components/ui/Select'
import { ApiError } from '@/lib/api-client'
import { calculateCustomerAdvanceTaxBreakdown, customerAdvanceFormSchema, type CustomerAdvanceVatType } from '@/lib/customer-advance'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type MasterOption = {
  branchIds?: string[]
  code: string
  id: string
  name: string
  unit?: string | null
}

type CustomerAdvanceRow = {
  availableAmount: number
  branchId: string
  branchName: string
  contractNo: string
  currencyCode: string
  customerCode: string
  customerName: string
  documentDate: string
  docNo: string
  id: string
  invoiceNo: string
  status: string
  statusLabel: string
  subtotalAmount: number
  targetAmount: number
  totalGrossWeight: number
  totalNetWeight: number
  vatAmount: number
  vatRatePercent: number
  vatType: CustomerAdvanceVatType
  vatTypeLabel: string
}

type CustomerAdvanceResponse = {
  branches: Array<{ active: boolean | null; code: string; id: string; name: string }>
  customers: MasterOption[]
  currencies: Array<{ code: string; name: string; symbol: string | null }>
  filters: { statuses: Array<{ label: string; value: string }> }
  pagination: { page: number; pageSize: number; totalPages: number; totalRows: number }
  products: MasterOption[]
  rows: CustomerAdvanceRow[]
  settings: {
    vatRates: Array<{
      effectiveFrom: string
      effectiveTo: string | null
      isDefault: boolean
      ratePercent: number
    }>
  }
}

type CustomerAdvanceLine = {
  grossWeight: string
  id: string
  netWeight: string
  productId: string
  quantity: string
}

type CustomerAdvanceFormState = {
  amount: string
  branchId: string
  contractNo: string
  currencyCode: string
  customerId: string
  documentDate: string
  invoiceNo: string
  lines: CustomerAdvanceLine[]
  remark: string
  vatType: CustomerAdvanceVatType
}

type FormErrors = Record<string, string>

const emptyLine = (id: string): CustomerAdvanceLine => ({ grossWeight: '', id, netWeight: '', productId: '', quantity: '' })

const initialForm = (): CustomerAdvanceFormState => ({
  amount: '',
  branchId: '',
  contractNo: '',
  currencyCode: '',
  customerId: '',
  documentDate: '',
  invoiceNo: '',
  lines: [emptyLine('line-0')],
  remark: '',
  vatType: 'NONE',
})

function decimalValue(value: string) {
  return value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
}

function parseDecimal(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(value)
}

function vatRateForDate(rates: CustomerAdvanceResponse['settings']['vatRates'], documentDate: string) {
  if (!documentDate) return null
  const match = rates.find((rate) => rate.effectiveFrom <= documentDate && (!rate.effectiveTo || rate.effectiveTo >= documentDate))
  return match && Number.isFinite(match.ratePercent) && match.ratePercent > 0 && match.ratePercent <= 100
    ? match.ratePercent
    : null
}

function clearLineErrors(errors: FormErrors) {
  return Object.fromEntries(Object.entries(errors).filter(([key]) => key !== 'lines' && !key.startsWith('lines.')))
}

function lineFieldError(errors: FormErrors, index: number, key: Exclude<keyof CustomerAdvanceLine, 'id'>) {
  return errors[`lines.${index}.${key}`] ?? ''
}

export function CustomerAdvanceForm() {
  const lineSequence = useRef(1)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [detailRow, setDetailRow] = useState<CustomerAdvanceRow | null>(null)
  const [form, setForm] = useState<CustomerAdvanceFormState>(initialForm)
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [loadError, setLoadError] = useState('')
  const [saveSuccessMessage, setSaveSuccessMessage] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [data, setData] = useState<CustomerAdvanceResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [lastCreatedDocNo, setLastCreatedDocNo] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (branchFilter) params.set('branchId', branchFilter)
    if (query.trim()) params.set('q', query.trim())
    if (status) params.set('status', status)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    return params.toString()
  }, [branchFilter, dateFrom, dateTo, page, pageSize, query, status])

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      const response = await dailyFetchJson<CustomerAdvanceResponse>(`/api/sales/customer-advances?${queryString}`)
      setData(response)
    } catch (caught) {
      setData(null)
      setLoadError(caught instanceof Error ? caught.message : 'โหลดรายการรับเงินล่วงหน้าไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => { void loadData() }, [loadData])

  const customerOptions = useMemo<SearchComboboxOption[]>(() => (data?.customers ?? [])
    .filter((customer) => Boolean(form.branchId) && customer.branchIds?.includes(form.branchId))
    .map((customer) => ({
      id: customer.id,
      label: `${customer.code} - ${customer.name}`,
      searchText: `${customer.code} ${customer.name}`,
    })), [data, form.branchId])
  const productOptions = useMemo<SearchComboboxOption[]>(() => (data?.products ?? []).map((product) => ({
    description: product.unit ? `หน่วย: ${product.unit}` : undefined,
    id: product.id,
    label: `${product.code} - ${product.name}`,
    searchText: `${product.code} ${product.name}`,
  })), [data])
  const totals = useMemo(() => ({
    grossWeight: form.lines.reduce((total, line) => total + parseDecimal(line.grossWeight), 0),
    netWeight: form.lines.reduce((total, line) => total + parseDecimal(line.netWeight), 0),
    quantity: form.lines.reduce((total, line) => total + parseDecimal(line.quantity), 0),
  }), [form.lines])
  const selectedVatRatePercent = useMemo(() => data ? vatRateForDate(data.settings.vatRates, form.documentDate) : null, [data, form.documentDate])
  const taxBreakdown = useMemo(() => data && (form.vatType === 'NONE' || selectedVatRatePercent !== null) ? calculateCustomerAdvanceTaxBreakdown({
    amount: parseDecimal(form.amount),
    vatRatePercent: selectedVatRatePercent ?? 0,
    vatType: form.vatType,
  }) : null, [data, form.amount, form.vatType, selectedVatRatePercent])
  const vatConfigurationError = form.vatType === 'INCLUDE' && form.documentDate && selectedVatRatePercent === null
    ? 'ไม่พบอัตรา VAT ที่เปิดใช้งานสำหรับวันที่เอกสาร'
    : ''

  const updateField = <K extends Exclude<keyof CustomerAdvanceFormState, 'lines'>>(key: K, value: CustomerAdvanceFormState[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'branchId' && current.customerId && !(data?.customers.find((customer) => customer.id === current.customerId)?.branchIds ?? []).includes(String(value)) ? { customerId: '' } : {}),
    }))
    setFormErrors((current) => ({ ...current, [key]: '' }))
    setSubmitError('')
    setSaveSuccessMessage('')
  }

  const updateLine = (id: string, key: Exclude<keyof CustomerAdvanceLine, 'id'>, value: string) => {
    setForm((current) => ({ ...current, lines: current.lines.map((line) => line.id === id ? { ...line, [key]: value } : line) }))
    setFormErrors((current) => clearLineErrors(current))
    setSubmitError('')
    setSaveSuccessMessage('')
  }

  const resetForm = () => {
    lineSequence.current = 1
    setForm(initialForm())
    setFormErrors({})
    setSubmitError('')
    setSaveSuccessMessage('')
  }

  const openCreateForm = () => {
    resetForm()
    setIsFormOpen(true)
  }

  const closeCreateForm = () => {
    setIsFormOpen(false)
    setSubmitError('')
    setFormErrors({})
  }

  const openDetail = (row: CustomerAdvanceRow) => {
    setDetailRow(row)
  }

  const appendLine = () => {
    setForm((current) => ({ ...current, lines: [...current.lines, emptyLine(`line-${lineSequence.current++}`)] }))
    setFormErrors((current) => clearLineErrors(current))
    setSubmitError('')
    setSaveSuccessMessage('')
  }

  const removeLine = (id: string) => {
    setForm((current) => ({ ...current, lines: current.lines.filter((line) => line.id !== id) }))
    setFormErrors((current) => clearLineErrors(current))
    setSubmitError('')
    setSaveSuccessMessage('')
  }

  const submit = async () => {
    const parsed = customerAdvanceFormSchema.safeParse({
      ...form,
      lines: form.lines.map(({ id: _id, ...line }) => line),
    })
    if (!parsed.success) {
      const nextErrors: FormErrors = {}
      for (const issue of parsed.error.issues) nextErrors[issue.path.join('.')] = issue.message
      setFormErrors(nextErrors)
      return
    }

    setIsSaving(true)
    setSubmitError('')
    try {
      const created = await dailyFetchJson<{ docNo: string; id: string }>('/api/sales/customer-advances', {
        body: JSON.stringify(parsed.data),
        method: 'POST',
      })
      setLastCreatedDocNo(created.docNo)
      setSaveSuccessMessage(`สร้างเอกสาร ${created.docNo} สำเร็จ`)
      closeCreateForm()
      setPage(1)
      await loadData()
    } catch (caught) {
      if (caught instanceof ApiError && caught.fieldErrors) {
        setFormErrors(Object.fromEntries(Object.entries(caught.fieldErrors).map(([key, messages]) => [key, messages?.[0] ?? 'ข้อมูลไม่ถูกต้อง'])))
      }
      setSubmitError(caught instanceof Error ? caught.message : 'บันทึกรายการรับเงินล่วงหน้าไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const canPrevious = data ? data.pagination.page > 1 : false
  const canNext = data ? data.pagination.page < data.pagination.totalPages : false
  const hasActiveFilters = Boolean(query.trim() || branchFilter || dateFrom || dateTo || status)

  const clearFilters = () => {
    setQuery('')
    setBranchFilter('')
    setDateFrom('')
    setDateTo('')
    setStatus('')
    setPage(1)
  }

  const createFormDialog = (
    <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) closeCreateForm() }}>
      <DialogContent className="max-h-[92vh] max-w-7xl rounded-md !p-0 bg-white border-0 overflow-hidden" fallbackTitle="สร้างรายการรับเงินล่วงหน้า" hideClose>
        <DialogHeader className="flex-row items-start justify-between gap-4">
          <div>
            <DialogTitle>สร้างรายการรับเงินล่วงหน้า</DialogTitle>
            <DialogDescription>บันทึก CADV จาก Packing List เพื่อใช้สร้างใบเสร็จรับเงินในขั้นตอนถัดไป</DialogDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button className="bg-white/10 text-white hover:bg-white/20 hover:text-white" disabled={isSaving} size="sm" type="button" variant="ghost" onClick={resetForm}>ล้างข้อมูล</Button>
            <Button className="bg-white/10 text-white hover:bg-white/20 hover:text-white" disabled={isSaving} size="sm" type="button" variant="ghost" onClick={closeCreateForm}>ปิด</Button>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4">
          {loadError ? <p className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadError}</p> : null}
          {submitError ? <p className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{submitError}</p> : null}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <FormSection description="ระบุข้อมูลอ้างอิงจากเอกสารของลูกค้า" title="ข้อมูลเอกสาร">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <Field error={formErrors.branchId} label="สาขา *" className="xl:col-span-2"><Select disabled={isLoading || !data} value={form.branchId} onChange={(event) => updateField('branchId', event.target.value)}><option value="">เลือกสาขา</option>{data?.branches.filter((branch) => branch.active !== false).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></Field>
                  <Field error={formErrors.documentDate} label="วันที่เอกสาร *" className="xl:col-span-2"><DatePickerInput className="w-full" value={form.documentDate} onChange={(value) => updateField('documentDate', value)} /></Field>
                  <Field error={formErrors.customerId} label="ลูกค้า *" className="xl:col-span-2"><SearchCombobox disabled={isLoading || !data || !form.branchId} hideLabel inputId="customer-advance-customer" label="ลูกค้า *" options={customerOptions} placeholder={form.branchId ? 'ค้นหาชื่อหรือรหัสลูกค้า' : 'เลือกสาขาก่อน'} value={form.customerId} onChange={(value) => updateField('customerId', value)} /></Field>
                  <Field error={formErrors.invoiceNo} label="Invoice No." className="xl:col-span-3"><Input placeholder="ระบุเลขที่ Invoice" value={form.invoiceNo} onChange={(event) => updateField('invoiceNo', event.target.value)} /></Field>
                  <Field error={formErrors.contractNo} label="Contract No." className="xl:col-span-3"><Input placeholder="ระบุเลขที่ Contract" value={form.contractNo} onChange={(event) => updateField('contractNo', event.target.value)} /></Field>
                </div>
              </FormSection>

              <FormSection description="รายการสินค้าและน้ำหนักตาม Packing List" title="รายการสินค้า">
                <div className="overflow-x-auto rounded-md border border-slate-200"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-left text-xs font-medium text-slate-600"><tr><th className="px-3 py-2">สินค้า *</th><th className="w-32 px-3 py-2 text-right">จำนวน *</th><th className="w-36 px-3 py-2 text-right">น้ำหนักรวม (กก.) *</th><th className="w-36 px-3 py-2 text-right">น้ำหนักสุทธิ (กก.) *</th><th className="w-12 px-2 py-2" aria-label="ลบรายการ" /></tr></thead><tbody className="divide-y divide-slate-100">
                  {form.lines.map((line, index) => <tr key={line.id}><td className="p-2"><SearchCombobox disabled={isLoading || !data} error={lineFieldError(formErrors, index, 'productId')} hideLabel inputId={`customer-advance-product-${line.id}`} label="สินค้า *" options={productOptions} value={line.productId} onChange={(value) => updateLine(line.id, 'productId', value)} /></td><td className="p-2"><DecimalInput aria-label="จำนวน" error={lineFieldError(formErrors, index, 'quantity')} value={line.quantity} onChange={(value) => updateLine(line.id, 'quantity', value)} /></td><td className="p-2"><DecimalInput aria-label="น้ำหนักรวม" error={lineFieldError(formErrors, index, 'grossWeight')} value={line.grossWeight} onChange={(value) => updateLine(line.id, 'grossWeight', value)} /></td><td className="p-2"><DecimalInput aria-label="น้ำหนักสุทธิ" error={lineFieldError(formErrors, index, 'netWeight')} value={line.netWeight} onChange={(value) => updateLine(line.id, 'netWeight', value)} /></td><td className="p-2 text-center">{form.lines.length > 1 ? <Button aria-label="ลบรายการ" className="text-red-600 hover:bg-red-50 hover:text-red-700" size="icon" type="button" variant="ghost" onClick={() => removeLine(line.id)}><Trash2 className="h-4 w-4" /></Button> : null}</td></tr>)}
                </tbody></table></div>
                {formErrors.lines ? <p className="mt-2 text-xs text-red-600">{formErrors.lines}</p> : null}
                <Button className="mt-3 gap-2" size="sm" type="button" variant="outline" onClick={appendLine}><Plus className="h-4 w-4" />เพิ่มรายการ</Button>
              </FormSection>

              <FormSection description="ยอดที่ต้องรับจากลูกค้าสำหรับรายการ CADV นี้" title="ยอดรับเงินล่วงหน้า">
                <div className="grid gap-3 md:grid-cols-6">
                  <Field error={formErrors.amount} label={form.vatType === 'INCLUDE' ? 'ยอดก่อน VAT *' : 'ยอดเงินล่วงหน้าที่ต้องรับ *'} className="md:col-span-2">
                    <DecimalInput aria-label={form.vatType === 'INCLUDE' ? 'ยอดก่อน VAT' : 'ยอดเงินล่วงหน้าที่ต้องรับ'} digits={2} value={form.amount} onChange={(value) => updateField('amount', value)} />
                  </Field>
                  <Field error={formErrors.vatType || vatConfigurationError} label="VAT *" className="md:col-span-2">
                    <Select className={form.vatType === 'INCLUDE' ? 'border-amber-500 bg-amber-50 font-medium text-slate-800' : ''} value={form.vatType} onChange={(event) => updateField('vatType', event.target.value as CustomerAdvanceVatType)}>
                      <option value="NONE">ไม่มี VAT</option>
                      <option value="INCLUDE">มี VAT</option>
                    </Select>
                  </Field>
                  <Field error={formErrors.currencyCode} label="สกุลเงิน *" className="md:col-span-2"><Select disabled={isLoading || !data} value={form.currencyCode} onChange={(event) => updateField('currencyCode', event.target.value)}><option value="">เลือกสกุลเงิน</option>{data?.currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} - {currency.name}</option>)}</Select></Field>
                </div>
              </FormSection>

              <FormSection description="ข้อมูลเพิ่มเติมที่ไม่มีใน Packing List" title="หมายเหตุ"><Field error={formErrors.remark} label="หมายเหตุ"><textarea className="min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-100" placeholder="ระบุหมายเหตุ" value={form.remark} onChange={(event) => updateField('remark', event.target.value)} /></Field></FormSection>
            </div>
            <aside className="h-fit rounded-md border border-slate-200 bg-slate-50 p-4"><h3 className="text-sm font-semibold text-slate-900">สรุปรายการ CADV</h3><dl className="mt-3 space-y-2 text-sm"><SummaryRow label="จำนวนสินค้า" value={formatQuantity(totals.quantity)} /><SummaryRow label="น้ำหนักรวม" value={`${formatQuantity(totals.grossWeight)} กก.`} /><SummaryRow label="น้ำหนักสุทธิ" value={`${formatQuantity(totals.netWeight)} กก.`} /></dl>{taxBreakdown ? <><div className="my-4 border-t border-slate-200" /><dl className="space-y-2 text-sm"><SummaryRow label="VAT" value={form.vatType === 'INCLUDE' ? `มี VAT ${formatQuantity(taxBreakdown.vatRatePercent)}%` : 'ไม่มี VAT'} />{form.vatType === 'INCLUDE' ? <SummaryRow label="ยอดก่อน VAT" value={`${formatMoney(taxBreakdown.subtotalAmount)}${form.currencyCode ? ` ${form.currencyCode}` : ''}`} /> : null}{form.vatType === 'INCLUDE' ? <SummaryRow label="ยอด VAT" value={`${formatMoney(taxBreakdown.vatAmount)}${form.currencyCode ? ` ${form.currencyCode}` : ''}`} /> : null}<SummaryRow strong label="ยอดเงินล่วงหน้าที่ต้องรับ" value={`${formatMoney(taxBreakdown.targetAmount)}${form.currencyCode ? ` ${form.currencyCode}` : ''}`} /></dl></> : null}<div className="mt-4 space-y-2"><Button className="w-full gap-2" disabled={isSaving || isLoading || !data || Boolean(vatConfigurationError)} type="button" onClick={() => void submit()}><Save className="h-4 w-4" />{isSaving ? 'กำลังบันทึก' : 'บันทึก CADV'}</Button></div></aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )

  const detailDialog = (
    <Dialog open={Boolean(detailRow)} onOpenChange={(open) => { if (!open) setDetailRow(null) }}>
      <DialogContent className="max-h-[90vh] max-w-4xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0" fallbackTitle="รายละเอียด CADV" hideClose>
        <DialogHeader className="p-4 bg-slate-900 text-white shrink-0">
          <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-white">{detailRow?.docNo ? `รายละเอียด ${detailRow.docNo}` : 'รายละเอียด CADV'}</DialogTitle>
              <DialogDescription className="truncate text-slate-300">ข้อมูลเอกสารรับเงินล่วงหน้าและยอดคงเหลือ</DialogDescription>
            </div>
            <Button className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={() => setDetailRow(null)}>ปิด</Button>
          </div>
        </DialogHeader>
        {detailRow ? (
          <div className="flex-1 overflow-y-auto space-y-4 bg-slate-50 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <DetailMetric label="ยอดรวมที่ต้องรับ" value={`${formatMoney(detailRow.targetAmount)} ${detailRow.currencyCode}`} />
              <DetailMetric label="คงเหลือ" value={`${formatMoney(detailRow.availableAmount)} ${detailRow.currencyCode}`} />
              <DetailMetric label="น้ำหนักรวม" value={`${formatQuantity(detailRow.totalGrossWeight)} กก.`} />
              <DetailMetric label="น้ำหนักสุทธิ" value={`${formatQuantity(detailRow.totalNetWeight)} กก.`} />
            </div>

            <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-3 text-sm font-semibold text-slate-900">ข้อมูลเอกสาร</div>
              <DetailGrid
                items={[
                  ['เลขที่ CADV', detailRow.docNo],
                  ['วันที่เอกสาร', formatDateDisplay(detailRow.documentDate)],
                  ['สาขา', detailRow.branchName],
                  ['ลูกค้า', detailRow.customerName],
                  ['รหัสลูกค้า', detailRow.customerCode],
                  ['Invoice No.', detailRow.invoiceNo || '-'],
                  ['Contract No.', detailRow.contractNo || '-'],
                  ['VAT', detailRow.vatType === 'INCLUDE' ? `${detailRow.vatTypeLabel} ${formatQuantity(detailRow.vatRatePercent)}%` : detailRow.vatTypeLabel],
                  ['ยอดก่อน VAT', `${formatMoney(detailRow.subtotalAmount)} ${detailRow.currencyCode}`],
                  ['ยอด VAT', `${formatMoney(detailRow.vatAmount)} ${detailRow.currencyCode}`],
                  ['สถานะ', detailRow.statusLabel],
                ]}
              />
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )

  return (
    <section className="space-y-4">
      {createFormDialog}
      {detailDialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">รายการรับเงินล่วงหน้า</h2>
          <p className="mt-1 text-sm text-slate-500">เอกสาร CADV สำหรับให้ใบเสร็จรับเงินดึงไปใช้งาน</p>
        </div>
      </div>
      <div className="space-y-3 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-2">
          <Field className="min-w-[260px] flex-1" label="ค้นหา">
            <Input
              placeholder="ค้นหา CADV, ลูกค้า, Invoice หรือ Contract"
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
            />
          </Field>
          <Field className="w-full sm:w-[180px]" label="สาขา">
            <Select
              disabled={!data}
              value={branchFilter}
              onChange={(event) => {
                setBranchFilter(event.target.value)
                setPage(1)
              }}
            >
              <option value="">ทุกสาขา</option>
              {data?.branches.filter((branch) => branch.active !== false).map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">วันที่:</span>
            <DatePickerInput
              ariaLabel="วันที่เริ่มต้น"
              id="customer-advance-date-from"
              value={dateFrom}
              onChange={(value) => {
                setDateFrom(value)
                setPage(1)
              }}
            />
            <span className="text-slate-400">→</span>
            <DatePickerInput
              ariaLabel="วันที่สิ้นสุด"
              id="customer-advance-date-to"
              value={dateTo}
              onChange={(value) => {
                setDateTo(value)
                setPage(1)
              }}
            />
          </div>
          {hasActiveFilters ? <Button size="xs" type="button" variant="secondary" onClick={clearFilters}>✕ ล้าง</Button> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">สถานะ:</span>
          <FilterSegment
            active={!status}
            label="ทุกสถานะ"
            onClick={() => {
              setStatus('')
              setPage(1)
            }}
          />
          {data?.filters.statuses.map((option) => (
            <FilterSegment
              active={status === option.value}
              key={option.value}
              label={option.label}
              onClick={() => {
                setStatus(option.value)
                setPage(1)
              }}
            />
          ))}
          <div className="ml-auto">
            <Button className="h-9 gap-2" disabled={isLoading || !data} size="sm" type="button" onClick={openCreateForm}>
              <Plus className="h-4 w-4" />
              สร้างรายการรับเงินล่วงหน้า
            </Button>
          </div>
        </div>
      </div>
      {saveSuccessMessage ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{saveSuccessMessage}</p> : null}
      {loadError ? <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadError}</p> : null}
      {data ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1 text-sm text-slate-600">
            <span>พบทั้งหมด {data.pagination.totalRows.toLocaleString('th-TH')} รายการ</span>
            <div className="flex flex-wrap items-center gap-2">
              <PageSizeDropdown value={pageSize} onChange={(value) => { setPageSize(value); setPage(1) }} />
              <Button aria-label="หน้าก่อนหน้า" disabled={!canPrevious} size="sm" type="button" variant="outline" onClick={() => setPage((current) => current - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-1">หน้า {data.pagination.page} / {data.pagination.totalPages}</span>
              <Button aria-label="หน้าถัดไป" disabled={!canNext} size="sm" type="button" variant="outline" onClick={() => setPage((current) => current + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="ns-table min-w-[1140px] w-full text-sm">
                <thead className="bg-slate-100 text-left text-xs font-semibold text-slate-700">
                  <tr>
                    <th className="p-2">เลขที่ CADV</th>
                    <th className="p-2">วันที่เอกสาร</th>
                    <th className="p-2">สาขา</th>
                    <th className="p-2">ลูกค้า</th>
                    <th className="p-2">Invoice / Contract</th>
                    <th className="p-2 text-right">น้ำหนักสุทธิ</th>
                    <th className="p-2 text-right">ยอดที่ต้องรับ</th>
                    <th className="p-2 text-right">คงเหลือ</th>
                    <th className="p-2">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td className="p-8 text-center text-sm text-slate-500" colSpan={9}>ไม่พบรายการรับเงินล่วงหน้า</td>
                    </tr>
                  ) : data.rows.map((row) => (
                    <tr
                      className={`cursor-pointer ${row.docNo === lastCreatedDocNo ? 'bg-emerald-50/70 hover:bg-emerald-50' : 'hover:bg-slate-50'}`}
                      key={row.id}
                      tabIndex={0}
                      onClick={() => openDetail(row)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openDetail(row)
                        }
                      }}
                    >
                      <td className="p-3 font-medium text-slate-900">
                        {row.docNo}
                        {row.docNo === lastCreatedDocNo ? <span className="ml-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">ล่าสุด</span> : null}
                      </td>
                      <td className="p-3">{formatDateDisplay(row.documentDate)}</td>
                      <td className="p-3 text-slate-700">{row.branchName}</td>
                      <td className="p-3">
                        <p className="font-medium text-slate-900">{row.customerName}</p>
                        <p className="text-xs text-slate-500">{row.customerCode}</p>
                      </td>
                      <td className="p-3 text-slate-600">
                        <p>{row.invoiceNo || '-'}</p>
                        <p className="text-xs">{row.contractNo || '-'}</p>
                      </td>
                      <td className="p-3 text-right tabular-nums">{formatQuantity(row.totalNetWeight)} กก.</td>
                      <td className="p-3 text-right tabular-nums"><p>{formatMoney(row.targetAmount)} {row.currencyCode}</p><p className="text-xs text-slate-500">{row.vatTypeLabel}</p></td>
                      <td className="p-3 text-right tabular-nums">{formatMoney(row.availableAmount)} {row.currencyCode}</td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-slate-700">
                          <span className="size-1.5 rounded-full bg-slate-500" />
                          {row.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}

function FilterSegment({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`rounded-md border px-3 py-1 text-xs font-medium ${active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-transparent text-slate-600 hover:bg-slate-200'}`} type="button" onClick={onClick}>
      {label}
    </button>
  )
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-base font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  )
}

function DetailGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div className="rounded-md bg-slate-50 px-3 py-2" key={label}>
          <dt className="text-xs font-medium text-slate-500">{label}</dt>
          <dd className="mt-1 break-words text-sm font-medium text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function DecimalInput({ className, digits = 2, error, onChange, ...props }: Omit<ComponentProps<typeof Input>, 'onChange' | 'type'> & { digits?: number; error?: string; onChange: (value: string) => void }) { return <div><Input className={`text-right tabular-nums ${className ?? ''}`.trim()} inputMode="decimal" placeholder={digits === 2 ? '0.00' : '0.000'} {...props} onChange={(event) => onChange(decimalValue(event.target.value))} />{error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}</div> }
function Field({ children, className = '', error, label }: { children: React.ReactNode; className?: string; error?: string; label: string }) { const required = label.trim().endsWith('*'); const labelText = required ? label.trim().slice(0, -1).trimEnd() : label; return <div className={className}><div className="mb-1 text-xs font-medium text-slate-600">{labelText}{required ? <span className="ml-1 text-red-600">*</span> : null}</div>{children}{error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}</div> }
function FormSection({ children, description, title }: { children: React.ReactNode; description: string; title: string }) { return <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-4"><h3 className="text-sm font-semibold text-slate-900">{title}</h3><p className="mt-1 text-xs text-slate-500">{description}</p></div>{children}</section> }
function SummaryRow({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) { return <div className={strong ? 'flex items-start justify-between gap-3 text-base font-semibold text-slate-900' : 'flex items-start justify-between gap-3 text-slate-600'}><dt>{label}</dt><dd className="text-right tabular-nums">{value}</dd></div> }
