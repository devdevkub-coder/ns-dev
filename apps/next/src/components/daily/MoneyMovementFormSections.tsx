'use client'

import { Button as UiButton } from '@/components/ui/Button'
import { Input as UiInput } from '@/components/ui/Input'
import { Select as UiSelect } from '@/components/ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { formatMoney, type DailyAccountOption } from '@/lib/daily'

type Bill = {
  approvalId?: string
  docNo: string
  id: string
  payableBalance?: number
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
  formNetAmount,
  moneyInputValue,
  paymentSplits,
  paymentSplitTotal,
  onAddPaymentSplit,
  onChangeMoneyInput,
  onFinishMoneyInput,
  onRemovePaymentSplit,
  onStartMoneyInput,
  onUpdatePaymentSplit,
}: {
  activeAccounts: DailyAccountOption[]
  formNetAmount: number
  moneyInputValue: (key: string, value: number) => string
  paymentSplits: PaymentSplitLike[]
  paymentSplitTotal: number
  onAddPaymentSplit: () => void
  onChangeMoneyInput: (key: string, rawValue: string, onValue: (value: number) => void) => void
  onFinishMoneyInput: (key: string) => void
  onRemovePaymentSplit: (index: number) => void
  onStartMoneyInput: (key: string, value: number) => void
  onUpdatePaymentSplit: (index: number, patch: Partial<PaymentSplitLike>) => void
}) {
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
            <div key={split.id ?? splitIndex} className="grid grid-cols-12 items-center gap-2 rounded-md border bg-white p-2">
              <div className="col-span-1 text-center text-xs font-bold text-slate-500">#{splitIndex + 1}</div>
              <div className="col-span-6">
                <UiSelect
                  className="h-9 w-full rounded-md border px-2 py-1.5 text-sm"
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
                  className="h-9 w-full rounded-md border px-2 py-1.5 text-right text-sm"
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
      <div className="mt-2 grid grid-cols-3 gap-2 border-t pt-2 text-sm">
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
  form,
  formNetAmount,
  isBillLocked,
  moneyInputValue,
  partyMap,
  paymentLineBalanceTotal,
  paymentLines,
  paymentSelectableBills,
  paymentSelectableBillsForLine,
  paymentLineInputValue,
  selectedBill,
  onAddPaymentLine,
  onChangeMoneyInput,
  onFinishMoneyInput,
  onRemovePaymentLine,
  onSelectPaymentLineBill,
  onStartMoneyInput,
  onUpdatePaymentLine,
}: {
  billMap: Map<string, Bill>
  form: MoneyFormLike
  formNetAmount: number
  isBillLocked: boolean
  moneyInputValue: (key: string, value: number) => string
  partyMap: Map<string, string>
  paymentLineBalanceTotal: number
  paymentLines: PaymentLineLike[]
  paymentSelectableBills: Bill[]
  paymentSelectableBillsForLine: (index: number) => Bill[]
  paymentLineInputValue: (line: PaymentLineLike) => string
  selectedBill: Bill | null
  onAddPaymentLine: () => void
  onChangeMoneyInput: (key: string, rawValue: string, onValue: (value: number) => void) => void
  onFinishMoneyInput: (key: string) => void
  onRemovePaymentLine: (index: number) => void
  onSelectPaymentLineBill: (index: number, rawValue: string) => void
  onStartMoneyInput: (key: string, value: number) => void
  onUpdatePaymentLine: (index: number, patch: Partial<PaymentLineLike>) => void
}) {
  return (
    <div className="order-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-slate-800">รายการจ่าย ({paymentLines.length}) — เลือกบิลที่ต้องการจ่ายได้เลย ระบบจะ auto-fill Supplier</h4>
        <UiButton className="bg-emerald-600 font-semibold hover:bg-emerald-700" size="xs" type="button" variant="default" onClick={onAddPaymentLine}>+ เพิ่มบรรทัด</UiButton>
      </div>
      {paymentSelectableBills.length === 0 ? <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">⚠️ ไม่มีบิลซื้อค้างจ่ายของ Supplier นี้</div> : null}
      <Table className="min-w-[780px] text-xs">
        <TableHeader className="text-slate-700">
          <tr>
            <TableHead className="w-80 p-1 text-left">บิล (เลขที่ · วันที่ · Supplier · ยอดค้าง)</TableHead>
            <TableHead className="p-1 text-right">ค้าง</TableHead>
            <TableHead className="p-1 text-right">จ่าย</TableHead>
            <TableHead className="p-1 text-right">WHT</TableHead>
            <TableHead className="p-1 text-right">Discount</TableHead>
            <TableHead className="p-1 text-right">Bank Fee</TableHead>
            <TableHead className="w-10 p-1" />
          </tr>
        </TableHeader>
        <TableBody>
          {paymentLines.map((line, lineIndex) => {
            const lineBill = line.billId ? billMap.get(line.billId) : null
            const lineBalance = lineBill?.payableBalance ?? 0
            const lineBillOptions = paymentSelectableBillsForLine(lineIndex)
            const lineAmountKey = `line-${line.id ?? lineIndex}-amount`
            const lineDiscountKey = `line-${line.id ?? lineIndex}-discount`
            const lineFeeKey = `line-${line.id ?? lineIndex}-fee`
            return (
              <TableRow key={line.id ?? lineIndex}>
                <TableCell className="p-1">
                  {isBillLocked && lineIndex === 0 && selectedBill ? (
                    <UiInput className="h-8 w-full bg-slate-50 px-1 py-1 text-xs disabled:opacity-100" disabled value={paymentLineInputValue(line)} />
                  ) : (
                    <UiInput
                      autoComplete="off"
                      className="h-8 w-full px-1 py-1 text-xs"
                      list={`payment-bill-options-${line.id ?? lineIndex}`}
                      placeholder="พิมพ์เลขบิล / ชื่อ supplier..."
                      value={paymentLineInputValue(line)}
                      onChange={(event) => onSelectPaymentLineBill(lineIndex, event.target.value)}
                    />
                  )}
                  <datalist id={`payment-bill-options-${line.id ?? lineIndex}`}>
                    {lineBillOptions.map((bill, optionIndex) => {
                      const optionKey = `${bill.id}:${bill.approvalId ?? bill.docNo}:${optionIndex}`
                      return (
                        <option
                          key={optionKey}
                          value={`${bill.docNo} | ${partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? '-'} | ค้าง ${formatMoney(bill.payableBalance ?? 0)}`}
                        />
                      )
                    })}
                  </datalist>
                </TableCell>
                <TableCell className="p-1"><UiInput className="h-8 w-full bg-slate-50 px-1 py-1 text-right text-amber-700 disabled:opacity-100" disabled type="text" value={formatMoney(lineBalance)} /></TableCell>
                <TableCell className="p-1"><UiInput className="h-8 w-full px-1 py-1 text-right" inputMode="decimal" type="text" value={moneyInputValue(lineAmountKey, Number(line.amount) || 0)} onBlur={() => onFinishMoneyInput(lineAmountKey)} onChange={(event) => onChangeMoneyInput(lineAmountKey, event.target.value, (amount) => onUpdatePaymentLine(lineIndex, { amount }))} onFocus={() => onStartMoneyInput(lineAmountKey, Number(line.amount) || 0)} /></TableCell>
                <TableCell className="p-1"><UiInput className="h-8 w-full bg-slate-50 px-1 py-1 text-right disabled:opacity-100" disabled type="text" value={formatMoney(line.withholdingTax)} /></TableCell>
                <TableCell className="p-1"><UiInput className="h-8 w-full px-1 py-1 text-right" inputMode="decimal" type="text" value={moneyInputValue(lineDiscountKey, Number(line.discount) || 0)} onBlur={() => onFinishMoneyInput(lineDiscountKey)} onChange={(event) => onChangeMoneyInput(lineDiscountKey, event.target.value, (discount) => onUpdatePaymentLine(lineIndex, { discount }))} onFocus={() => onStartMoneyInput(lineDiscountKey, Number(line.discount) || 0)} /></TableCell>
                <TableCell className="p-1"><UiInput className="h-8 w-full px-1 py-1 text-right" inputMode="decimal" type="text" value={moneyInputValue(lineFeeKey, Number(line.fee) || 0)} onBlur={() => onFinishMoneyInput(lineFeeKey)} onChange={(event) => onChangeMoneyInput(lineFeeKey, event.target.value, (fee) => onUpdatePaymentLine(lineIndex, { fee }))} onFocus={() => onStartMoneyInput(lineFeeKey, Number(line.fee) || 0)} /></TableCell>
                <TableCell className="p-1 text-center"><UiButton className="h-8 w-8 px-0 text-red-500 disabled:text-slate-300" disabled={paymentLines.length <= 1 || (isBillLocked && lineIndex === 0)} size="icon" type="button" variant="ghost" onClick={() => onRemovePaymentLine(lineIndex)}>×</UiButton></TableCell>
              </TableRow>
            )
          })}
        </TableBody>
        <tfoot className="bg-slate-50 font-semibold">
          <tr>
            <td className="p-2 text-right">รวม</td>
            <td className="p-2 text-right text-amber-700">{formatMoney(paymentLineBalanceTotal)}</td>
            <td className="p-2 text-right text-red-700">{formatMoney(form.amount)}</td>
            <td className="p-2 text-right">{formatMoney(form.withholdingTax)}</td>
            <td className="p-2 text-right">{formatMoney(form.discount)}</td>
            <td className="p-2 text-right">{formatMoney(form.fee)}</td>
            <td />
          </tr>
          <tr><td className="p-2 text-right" colSpan={7}>Net Cash Out: <span className="text-base font-bold text-red-700">{formatMoney(formNetAmount)}</span></td></tr>
        </tfoot>
      </Table>
      <div className="mt-1 text-xs text-slate-500">* Net Cash Out = ยอดจ่าย - WHT + Bank Fee</div>
    </div>
  )
}
