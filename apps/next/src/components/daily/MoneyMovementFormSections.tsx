'use client'

import { useMemo } from 'react'
import { paymentMethodGroupFromValue, type PaymentMethodGroup } from '@/lib/account-payment-method'
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
  sourceType?: 'advance_payment' | 'expense' | 'petty_advance_return' | 'purchase_bill'
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
  method?: string
}

export function PaymentSplitsSection({
  activeAccounts,
  addButtonLabel = '+ เพิ่มบัญชี',
  afterLabel = '📊 หลังจ่าย',
  amountLabel = '➖ จ่าย',
  balanceMode = 'subtract',
  form,
  formNetAmount,
  moneyInputValue,
  netTargetLabel = '🎯 ยอดสุทธิที่ต้องจ่าย',
  paymentSplits,
  paymentSplitTotal,
  sectionHelp = 'เลือกได้หลายบัญชี กรณีวงเงินเต็ม → split',
  sectionTitle = '💳 บัญชีจ่าย *',
  totalLabel = '💰 รวมแยกบัญชี',
  onAddPaymentSplit,
  onChangeMoneyInput,
  onFinishMoneyInput,
  onRemovePaymentSplit,
  onStartMoneyInput,
  onUpdatePaymentForm,
  onUpdatePaymentSplit,
  paymentMethods,
  methodValue,
  onMethodChange,
  methodDisabled,
}: {
  activeAccounts: DailyAccountOption[]
  addButtonLabel?: string
  afterLabel?: string
  amountLabel?: string
  balanceMode?: 'add' | 'subtract'
  form: MoneyFormLike
  formNetAmount: number
  moneyInputValue: (key: string, value: number) => string
  netTargetLabel?: string
  paymentSplits: PaymentSplitLike[]
  paymentSplitTotal: number
  sectionHelp?: string
  sectionTitle?: string
  totalLabel?: string
  onAddPaymentSplit: () => void
  onChangeMoneyInput: (key: string, rawValue: string, onValue: (value: number) => void) => void
  onFinishMoneyInput: (key: string) => void
  onRemovePaymentSplit: (index: number) => void
  onStartMoneyInput: (key: string, value: number) => void
  onUpdatePaymentForm: (patch: Partial<MoneyFormLike>) => void
  onUpdatePaymentSplit: (index: number, patch: Partial<PaymentSplitLike>) => void
  paymentMethods?: Array<{ name: string; type: PaymentMethodGroup }>
  methodValue?: string
  onMethodChange?: (value: string) => void
  methodDisabled?: boolean
}) {
  const formDiscountKey = 'payment-form-discount'
  const formFeeKey = 'payment-form-fee'

  const getAccountLabel = (account: DailyAccountOption) => {
    if (account.subtype === 'current') {
      const odLimit = account.odLimit ?? 0
      const odRemaining = account.odRemaining ?? 0
      const available = account.availableToPay ?? 0
      return `${account.name} (คงเหลือจริง ${formatMoney(account.balance ?? 0)} / OD คงเหลือ ${formatMoney(odRemaining)} / ใช้ได้รวม ${formatMoney(available)})`
    }
    return `${account.name} (คงเหลือจริง ${formatMoney(account.balance ?? 0)})`
  }

  // Calculate summary values for the entire document
  let totalNormalBalanceUsed = 0
  let totalOdUsed = 0

  paymentSplits.forEach((split) => {
    const account = activeAccounts.find((a) => a.id === split.accountId)
    const amount = Number(split.amount) || 0
    if (account) {
      if (account.subtype === 'current') {
        const balance = account.balance ?? 0
        const normalUsed = Math.min(amount, Math.max(0, balance))
        const odUsed = Math.max(0, amount - Math.max(0, balance))
        totalNormalBalanceUsed += normalUsed
        totalOdUsed += odUsed
      } else {
        totalNormalBalanceUsed += amount
      }
    }
  })

  // Check if any selected account in splits is current account
  const hasCurrentAccount = paymentSplits.some((split) => {
    const account = activeAccounts.find((a) => a.id === split.accountId)
    return account?.subtype === 'current'
  })

  const showSummaryCard = balanceMode === 'subtract' && hasCurrentAccount

  return (
    <div className="order-3 rounded-md border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium text-blue-900">{sectionTitle} <span className="text-xs font-normal text-slate-600">({sectionHelp})</span></h4>
        <UiButton
          className="bg-blue-600 font-semibold hover:bg-blue-700 disabled:opacity-50"
          disabled={methodDisabled}
          size="xs"
          type="button"
          variant="default"
          onClick={onAddPaymentSplit}
        >
          {addButtonLabel}
        </UiButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Side: Splits List */}
        <div className={showSummaryCard ? "lg:col-span-8 space-y-2" : "lg:col-span-12 space-y-2"}>
          {paymentSplits.map((split, splitIndex) => {
            const splitAccount = activeAccounts.find((account) => account.id === split.accountId)
            const splitBalance = splitAccount?.balance ?? 0
            const splitAmount = Number(split.amount) || 0
            const balanceAfter = balanceMode === 'add' ? splitBalance + splitAmount : splitBalance - splitAmount
            const splitAmountKey = `split-${split.id ?? splitIndex}-amount`

            const splitMethodGroup = split.method && paymentMethods ? paymentMethodGroupFromValue(split.method, paymentMethods) : null
            const rowFilteredAccounts = !paymentMethods
              ? activeAccounts
              : !split.method || !splitMethodGroup
              ? []
              : activeAccounts.filter((account) => {
                  const accountGroup = paymentMethodGroupFromValue(account.type, paymentMethods) ??
                    (String(account.type ?? '').toLowerCase().includes('cash') || String(account.type ?? '').includes('เงินสด') ? 'cash' : 'bank')
                  return accountGroup === splitMethodGroup
                })

            return (
              <div key={split.id ?? splitIndex} className="grid grid-cols-12 items-center gap-2 rounded-md border border-slate-200 bg-white p-2">
                <div className="col-span-1 text-center text-xs font-bold text-slate-500">#{splitIndex + 1}</div>

                {paymentMethods ? (
                  <>
                    <div className="col-span-3">
                      <UiSelect
                        disabled={methodDisabled}
                        className="h-9 w-full rounded-md border border-slate-300 disabled:bg-slate-100 disabled:opacity-80 px-2 py-1.5 text-sm bg-white"
                        required
                        value={split.method ?? ''}
                        onChange={(event) => onUpdatePaymentSplit(splitIndex, { method: event.target.value })}
                      >
                        <option disabled value="">วิธีรับเงิน</option>
                        {paymentMethods.map((method) => (
                          <option key={method.name} value={method.name}>{method.name}</option>
                        ))}
                      </UiSelect>
                    </div>
                    <div className="col-span-4">
                      <UiSelect
                        disabled={!split.method || methodDisabled}
                        className="h-9 w-full rounded-md border border-slate-300 disabled:bg-slate-100 disabled:opacity-80 px-2 py-1.5 text-sm bg-white"
                        required
                        value={split.accountId}
                        onChange={(event) => onUpdatePaymentSplit(splitIndex, { accountId: event.target.value })}
                      >
                        <option disabled value="">-- เลือกบัญชี --</option>
                        {rowFilteredAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {getAccountLabel(account)}
                          </option>
                        ))}
                      </UiSelect>
                    </div>
                    <div className="col-span-3">
                      <UiInput
                        disabled={methodDisabled}
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
                  </>
                ) : (
                  <>
                    <div className="col-span-6">
                      <UiSelect
                        disabled={methodDisabled}
                        className="h-9 w-full rounded-md border border-slate-300 disabled:bg-slate-100 disabled:opacity-80 px-2 py-1.5 text-sm bg-white"
                        required
                        value={split.accountId}
                        onChange={(event) => onUpdatePaymentSplit(splitIndex, { accountId: event.target.value })}
                      >
                        <option disabled value="">-- เลือกบัญชี --</option>
                        {activeAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {getAccountLabel(account)}
                          </option>
                        ))}
                      </UiSelect>
                    </div>
                    <div className="col-span-4">
                      <UiInput
                        disabled={methodDisabled}
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
                  </>
                )}

                <div className="col-span-1 text-center">
                  <UiButton
                    className="h-8 w-8 px-0 font-bold text-red-500 hover:text-red-700 disabled:text-slate-300"
                    disabled={paymentSplits.length <= 1 || methodDisabled}
                    size="icon"
                    type="button"
                    variant="ghost"
                    onClick={() => onRemovePaymentSplit(splitIndex)}
                  >
                    ×
                  </UiButton>
                </div>
                {split.accountId ? (
                  splitAccount?.subtype === 'current' && balanceMode === 'subtract' ? (
                    <div className="col-span-12 pl-2 space-y-2 border-t border-slate-100 pt-2 text-xs">
                      <div className="grid grid-cols-4 gap-2">
                        <label className="block text-blue-700">
                          <span>ยอดคงเหลือจริง</span>
                          <input className="mt-1 w-full bg-transparent p-0 text-right font-semibold text-blue-700 disabled:opacity-100" disabled type="text" value={formatMoney(splitBalance)} />
                        </label>
                        <label className="block text-amber-700">
                          <span>OD คงเหลือ</span>
                          <input className="mt-1 w-full bg-transparent p-0 text-right font-semibold text-amber-700 disabled:opacity-100" disabled type="text" value={formatMoney(splitAccount.odRemaining ?? 0)} />
                        </label>
                        <label className="block text-emerald-700">
                          <span>ยอดใช้ได้รวม</span>
                          <input className="mt-1 w-full bg-transparent p-0 text-right font-semibold text-emerald-700 disabled:opacity-100" disabled type="text" value={formatMoney(splitAccount.availableToPay ?? 0)} />
                        </label>
                        <label className={`block ${balanceAfter < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                          <span>หลังจ่าย คงเหลือจริง</span>
                          <input className={`mt-1 w-full bg-transparent p-0 text-right font-bold disabled:opacity-100 ${balanceAfter < 0 ? 'text-rose-600' : 'text-slate-600'}`} disabled type="text" value={formatMoney(balanceAfter)} />
                        </label>
                      </div>
                      <div className={`text-[10px] font-medium ${splitAmount <= (splitAccount.availableToPay ?? 0) ? 'text-emerald-600' : 'text-rose-600'}`}>
                        Validation: ยอดจ่าย {formatMoney(splitAmount)} &le; ยอดใช้ได้รวม {formatMoney(splitAccount.availableToPay ?? 0)} {splitAmount <= (splitAccount.availableToPay ?? 0) ? 'ผ่าน' : 'ไม่ผ่าน'}
                      </div>
                    </div>
                  ) : (
                    <div className="col-span-12 grid grid-cols-3 gap-2 pl-2 text-xs">
                      <label className="block text-blue-700">
                        <span>💵 คงเหลือ</span>
                        <input className="mt-1 w-full bg-transparent p-0 text-right font-semibold text-blue-700 disabled:opacity-100" disabled type="text" value={formatMoney(splitBalance)} />
                      </label>
                      <label className="block text-amber-700">
                        <span>{amountLabel}</span>
                        <input className="mt-1 w-full bg-transparent p-0 text-right font-semibold text-amber-700 disabled:opacity-100" disabled type="text" value={splitAmount ? formatMoney(splitAmount) : ''} />
                      </label>
                      <label className="block text-emerald-700">
                        <span>{afterLabel}</span>
                        <input className="mt-1 w-full bg-transparent p-0 text-right font-semibold text-emerald-700 disabled:opacity-100" disabled type="text" value={formatMoney(balanceAfter)} />
                      </label>
                    </div>
                  )
                ) : null}
              </div>
            )
          })}
        </div>

        {/* Right Side: OD Summary Card */}
        {showSummaryCard && (
          <div className="lg:col-span-4 rounded-lg border border-blue-200 bg-white p-3 space-y-2 text-xs shrink-0 self-start shadow-sm">
            <h5 className="font-bold text-slate-800 border-b border-slate-100 pb-1.5 mb-1.5">สรุปการใช้เงินของรายการนี้</h5>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">ใช้เงินคงเหลือปกติก่อน</span>
                <span className="font-semibold text-slate-700">{formatMoney(totalNormalBalanceUsed)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ใช้ OD</span>
                <span className="font-semibold text-orange-600">{formatMoney(totalOdUsed)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Bank Fee</span>
                <span className="font-semibold text-slate-700">{formatMoney(form.fee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Discount</span>
                <span className="font-semibold text-slate-700">{formatMoney(form.discount)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-1.5 font-bold">
                <span className="text-slate-800">รวมแยกบัญชี</span>
                <span className="text-blue-700">{formatMoney(paymentSplitTotal)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-1 font-bold">
                <span className="text-slate-800">ตรงกับยอดที่ต้องจ่าย</span>
                <span className={Math.abs(paymentSplitTotal - formNetAmount) < 0.01 ? "text-emerald-600" : "text-rose-600"}>
                  {formatMoney(formNetAmount - paymentSplitTotal)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-end justify-end gap-3 border-t border-slate-200 pt-2">
        <label className="block min-w-32 text-left text-xs font-medium text-slate-600">
          <span>Discount</span>
          <UiInput
            disabled={methodDisabled}
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
            disabled={methodDisabled}
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
      {!showSummaryCard && (
        <div className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-200 pt-2 text-sm">
          <div className="rounded-md bg-slate-100 p-2">
            <div className="text-xs text-slate-600">{totalLabel}</div>
            <div className="font-bold">{formatMoney(paymentSplitTotal)}</div>
          </div>
          <div className="rounded-md bg-amber-50 p-2">
            <div className="text-xs text-amber-700">{netTargetLabel}</div>
            <div className="font-bold text-amber-700">{formatMoney(formNetAmount)}</div>
          </div>
          <div className={`rounded-md p-2 ${Math.abs(paymentSplitTotal - formNetAmount) < 0.01 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            <div className="text-xs">{Math.abs(paymentSplitTotal - formNetAmount) < 0.01 ? 'ตรงกัน' : '⚠️ ผลต่าง'}</div>
            <div className="font-bold">{formatMoney(formNetAmount - paymentSplitTotal)}</div>
          </div>
        </div>
      )}
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
