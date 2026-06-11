'use client'

import { Button as UiButton } from '@/components/ui/Button'
import { Input as UiInput } from '@/components/ui/Input'
import { Select as UiSelect } from '@/components/ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { formatMoney, type DailyAccountOption } from '@/lib/daily'

type Bill = {
  approvalId?: string
  approvalAccountNo?: string
  approvalBankName?: string
  approvalPaymentMethod?: string
  docNo: string
  id: string
  payableBalance?: number
  sourceDocNo?: string
  sourceType?: 'advance_payment' | 'expense' | 'purchase_bill'
  supplierId?: string | null
}

type MoneyFormLike = {
  amount: number
  discount: number
  fee: number
  withholdingTax: number
}

type PaymentLineLike = {
  amount: number
  approvalId: string | null
  billId: string
  discount: number
  fee: number
  id: string | null
  supplierId: string
  withholdingTax: number
}

type PaymentSplitLike = {
  accountId: string
  amount: number
  id: string | null
}

export function PaymentSplitsSection({
  activeAccounts,
  form,
  formNetAmount,
  moneyInputValue,
  paymentSplits,
  paymentSplitTotal,
  onAddPaymentSplit,
  onChangeMoneyInput,
  onFinishMoneyInput,
  onRemovePaymentSplit,
  onStartMoneyInput,
  onUpdatePaymentForm,
  onUpdatePaymentSplit,
}: {
  activeAccounts: DailyAccountOption[]
  form: MoneyFormLike
  formNetAmount: number
  moneyInputValue: (key: string, value: number) => string
  paymentSplits: PaymentSplitLike[]
  paymentSplitTotal: number
  onAddPaymentSplit: () => void
  onChangeMoneyInput: (key: string, rawValue: string, onValue: (value: number) => void) => void
  onFinishMoneyInput: (key: string) => void
  onRemovePaymentSplit: (index: number) => void
  onStartMoneyInput: (key: string, value: number) => void
  onUpdatePaymentForm: (patch: Partial<MoneyFormLike>) => void
  onUpdatePaymentSplit: (index: number, patch: Partial<PaymentSplitLike>) => void
}) {
  const formDiscountKey = 'payment-form-discount'
  const formFeeKey = 'payment-form-fee'
  return (
    <div className="order-3 rounded-md border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium text-blue-900">💳 บัญชีจ่าย * <span className="text-xs font-normal text-slate-600">(เลือกได้หลายบัญชี กรณีวงเงินเต็ม → split)</span></h4>
        <UiButton className="bg-blue-600 font-semibold hover:bg-blue-700" size="xs" type="button" variant="default" onClick={onAddPaymentSplit}>+ เพิ่มบัญชี</UiButton>
      </div>
      <div className="space-y-2">
        {paymentSplits.map((split, splitIndex) => {
          const splitAccount = activeAccounts.find((account) => account.id === split.accountId)
          const splitBalance = splitAccount?.balance ?? 0
          const splitAmount = Number(split.amount) || 0
          const splitAmountKey = `split-${split.id ?? splitIndex}-amount`
          return (
            <div key={split.id ?? splitIndex} className="grid grid-cols-12 items-center gap-2 rounded-md border border-slate-200 bg-white p-2">
              <div className="col-span-1 text-center text-xs font-bold text-slate-500">#{splitIndex + 1}</div>
              <div className="col-span-6">
                <UiSelect
                  className="h-9 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  required
                  value={split.accountId}
                  onChange={(event) => onUpdatePaymentSplit(splitIndex, { accountId: event.target.value })}
                >
                  <option disabled value="">-- เลือกบัญชี --</option>
                  {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} (คงเหลือ {formatMoney(account.balance ?? 0)})</option>)}
                </UiSelect>
              </div>
              <div className="col-span-4">
                <UiInput
                  className="h-9 w-full rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm"
                  inputMode="decimal"
                  placeholder={paymentSplits.length === 1 ? formatMoney(formNetAmount) : 'จำนวนเงิน'}
                  type="text"
                  value={moneyInputValue(splitAmountKey, splitAmount)}
                  onBlur={() => onFinishMoneyInput(splitAmountKey)}
                  onChange={(event) => onChangeMoneyInput(splitAmountKey, event.target.value, (amount) => onUpdatePaymentSplit(splitIndex, { amount }))}
                  onFocus={() => onStartMoneyInput(splitAmountKey, splitAmount)}
                />
              </div>
              <div className="col-span-1 text-center">
                <UiButton
                  className="h-8 w-8 px-0 font-bold text-red-500 hover:text-red-700 disabled:text-slate-300"
                  disabled={paymentSplits.length <= 1}
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() => onRemovePaymentSplit(splitIndex)}
                >
                  ×
                </UiButton>
              </div>
              {split.accountId ? (
                <div className="col-span-12 grid grid-cols-3 gap-2 pl-2 text-xs">
                  <label className="block text-blue-700">
                    <span>💵 คงเหลือ</span>
                    <input className="mt-1 w-full bg-transparent p-0 text-right font-semibold text-blue-700 disabled:opacity-100" disabled type="text" value={formatMoney(splitBalance)} />
                  </label>
                  <label className="block text-amber-700">
                    <span>➖ จ่าย</span>
                    <input className="mt-1 w-full bg-transparent p-0 text-right font-semibold text-amber-700 disabled:opacity-100" disabled type="text" value={splitAmount ? formatMoney(splitAmount) : ''} />
                  </label>
                  <label className="block text-emerald-700">
                    <span>📊 หลังจ่าย</span>
                    <input className="mt-1 w-full bg-transparent p-0 text-right font-semibold text-emerald-700 disabled:opacity-100" disabled type="text" value={formatMoney(splitBalance - splitAmount)} />
                  </label>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-end gap-3 border-t border-slate-200 pt-2">
        <label className="block min-w-32 text-left text-xs font-medium text-slate-600">
          <span>Discount</span>
          <UiInput
            className="mt-1 h-8 w-full px-2 py-1 text-right"
            inputMode="decimal"
            type="text"
            value={moneyInputValue(formDiscountKey, Number(form.discount) || 0)}
            onBlur={() => onFinishMoneyInput(formDiscountKey)}
            onChange={(event) => onChangeMoneyInput(formDiscountKey, event.target.value, (discount) => onUpdatePaymentForm({ discount }))}
            onFocus={() => onStartMoneyInput(formDiscountKey, Number(form.discount) || 0)}
          />
        </label>
        <label className="block min-w-32 text-left text-xs font-medium text-slate-600">
          <span>Bank Fee</span>
          <UiInput
            className="mt-1 h-8 w-full px-2 py-1 text-right"
            inputMode="decimal"
            type="text"
            value={moneyInputValue(formFeeKey, Number(form.fee) || 0)}
            onBlur={() => onFinishMoneyInput(formFeeKey)}
            onChange={(event) => onChangeMoneyInput(formFeeKey, event.target.value, (fee) => onUpdatePaymentForm({ fee }))}
            onFocus={() => onStartMoneyInput(formFeeKey, Number(form.fee) || 0)}
          />
        </label>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-200 pt-2 text-sm">
        <div className="rounded-md bg-slate-100 p-2">
          <div className="text-xs text-slate-600">💰 รวมแยกบัญชี</div>
          <div className="font-bold">{formatMoney(paymentSplitTotal)}</div>
        </div>
        <div className="rounded-md bg-amber-50 p-2">
          <div className="text-xs text-amber-700">🎯 ยอดสุทธิที่ต้องจ่าย</div>
          <div className="font-bold text-amber-700">{formatMoney(formNetAmount)}</div>
        </div>
        <div className={`rounded-md p-2 ${Math.abs(paymentSplitTotal - formNetAmount) < 0.01 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          <div className="text-xs">{Math.abs(paymentSplitTotal - formNetAmount) < 0.01 ? 'ตรงกัน' : '⚠️ ผลต่าง'}</div>
          <div className="font-bold">{formatMoney(formNetAmount - paymentSplitTotal)}</div>
        </div>
      </div>
    </div>
  )
}

export function PaymentLinesSection({
  billMap,
  isBillLocked,
  partyMap,
  paymentLineBalanceTotal,
  paymentLines,
  paymentSelectableBills,
  paymentSelectableBillsForLine,
  paymentLineInputValue,
  selectedBill,
  onAddPaymentLine,
  onRemovePaymentLine,
  onSelectPaymentLineBill,
}: {
  billMap: Map<string, Bill>
  isBillLocked: boolean
  partyMap: Map<string, string>
  paymentLineBalanceTotal: number
  paymentLines: PaymentLineLike[]
  paymentSelectableBills: Bill[]
  paymentSelectableBillsForLine: (index: number) => Bill[]
  paymentLineInputValue: (line: PaymentLineLike) => string
  selectedBill: Bill | null
  onAddPaymentLine: () => void
  onRemovePaymentLine: (index: number) => void
  onSelectPaymentLineBill: (index: number, rawValue: string) => void
}) {
  return (
    <div className="order-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-slate-800">รายการจ่าย ({paymentLines.length}) — เลือก PMA ที่ต้องการจ่ายได้เลย ระบบจะ auto-fill ผู้รับเงิน</h4>
        <UiButton className="bg-emerald-600 font-semibold hover:bg-emerald-700" size="xs" type="button" variant="default" onClick={onAddPaymentLine}>+ เพิ่มบรรทัด</UiButton>
      </div>
      {paymentSelectableBills.length === 0 ? <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">ไม่มี PMA ค้างจ่ายของผู้รับเงินนี้</div> : null}
      <Table className="min-w-[640px] text-xs">
        <TableHeader className="text-slate-700">
          <tr>
            <TableHead className="p-1 text-left align-top">PMA / เอกสารต้นทาง / ผู้รับเงิน / ช่องทางรับเงิน</TableHead>
            <TableHead className="p-1 text-right align-top">ค้าง</TableHead>
            <TableHead className="w-10 p-1 align-top" />
          </tr>
        </TableHeader>
        <TableBody>
          {paymentLines.map((line, lineIndex) => {
            const lineBill = line.billId ? billMap.get(line.billId) : null
            const lineBalance = lineBill?.payableBalance ?? 0
            const lineBillOptions = paymentSelectableBillsForLine(lineIndex)
            const approvalPaymentMethod = lineBill?.approvalPaymentMethod?.trim() || '-'
            const approvalAccountNo = lineBill?.approvalAccountNo?.trim()
            const approvalBankName = lineBill?.approvalBankName?.trim()
            const destinationAccount = approvalAccountNo
              ? `${approvalBankName || '-'} ${approvalAccountNo}`
              : approvalBankName || '-'
            const inputValue = paymentLineInputValue(line)
            const displayValue = inputValue ? `#${lineIndex + 1} ${inputValue}` : ''
            return (
              <TableRow key={line.id ?? lineIndex}>
                <TableCell className="p-1 align-top">
                  {isBillLocked && lineIndex === 0 && selectedBill ? (
                    <UiInput className="h-8 w-full bg-slate-50 px-1 py-1 text-xs disabled:opacity-100" disabled value={displayValue} />
                  ) : (
                    <UiInput
                      autoComplete="off"
                      className="h-8 w-full px-1 py-1 text-xs"
                      list={`payment-bill-options-${line.id ?? lineIndex}`}
                      placeholder="พิมพ์เลข PMA / เอกสารต้นทาง / ผู้รับเงิน..."
                      value={displayValue}
                      onChange={(event) => onSelectPaymentLineBill(lineIndex, event.target.value.replace(/^#\d+\s+/, ''))}
                    />
                  )}
                  <datalist id={`payment-bill-options-${line.id ?? lineIndex}`}>
                    {lineBillOptions.map((bill, optionIndex) => {
                      const optionKey = `${bill.id}:${bill.approvalId ?? bill.docNo}:${optionIndex}`
                      const sourceLabel = bill.sourceDocNo && bill.sourceDocNo !== bill.docNo ? ` / อ้างอิง ${bill.sourceDocNo}` : ''
                      const methodLabel = bill.approvalPaymentMethod ? ` | ${bill.approvalPaymentMethod}` : ''
                      const accountLabel = bill.approvalAccountNo ? ` | ${bill.approvalBankName || '-'} ${bill.approvalAccountNo}` : ''
                      return (
                        <option
                          key={optionKey}
                          value={`${bill.docNo}${sourceLabel} | ${partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? '-'}${methodLabel}${accountLabel} | ค้าง ${formatMoney(bill.payableBalance ?? 0)}`}
                        />
                      )
                    })}
                  </datalist>
                  {lineBill ? (
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      <span>เอกสารต้นทาง: <span className="font-medium text-slate-700">{lineBill.sourceDocNo || lineBill.docNo}</span></span>
                      <span>ช่องทางรับเงิน: <span className="font-medium text-slate-700">{approvalPaymentMethod}</span></span>
                      <span>บัญชีรับเงิน: <span className="font-medium text-slate-700">{destinationAccount}</span></span>
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="p-1 align-top"><UiInput className="h-8 w-full bg-slate-50 px-1 py-1 text-right text-amber-700 disabled:opacity-100" disabled type="text" value={formatMoney(lineBalance)} /></TableCell>
                <TableCell className="p-1 text-center align-top"><UiButton className="h-8 w-8 px-0 text-red-500 disabled:text-slate-300" disabled={paymentLines.length <= 1 || (isBillLocked && lineIndex === 0)} size="icon" type="button" variant="ghost" onClick={() => onRemovePaymentLine(lineIndex)}>×</UiButton></TableCell>
              </TableRow>
            )
          })}
        </TableBody>
        <tfoot className="bg-slate-50 font-semibold">
          <tr>
            <td className="p-2 text-right">รวม</td>
            <td className="p-2 text-right text-amber-700">{formatMoney(paymentLineBalanceTotal)}</td>
            <td />
          </tr>
        </tfoot>
      </Table>
    </div>
  )
}
