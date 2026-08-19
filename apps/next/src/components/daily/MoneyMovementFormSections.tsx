'use client'

import { useMemo, type ReactNode } from 'react'
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
  accountLabel,
  activeAccounts,
  addButtonLabel = '+ เพิ่มบัญชี',
  afterLabel = '📊 หลังจ่าย',
  amountLabel = '➖ จ่าย',
  balanceMode = 'subtract',
  calculationSummary,
  discountLabel = 'Discount',
  feeLabel = 'Bank Fee',
  form,
  formNetAmount,
  introContent,
  equalSplitFieldWidths = false,
  moneyInputValue,
  netTargetLabel = '🎯 ยอดสุทธิที่ต้องจ่าย',
  paymentSplits,
  paymentSplitTotal,
  sectionHelp = 'เลือกได้หลายบัญชี กรณีวงเงินเต็ม → split',
  sectionTitle = '💳 บัญชีจ่าย *',
  showDiscount = true,
  showReconciliationSummary = true,
  showSplitBalancePreview = true,
  splitAmountHelper,
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
  accountLabel?: (account: DailyAccountOption) => string
  activeAccounts: DailyAccountOption[]
  addButtonLabel?: string
  afterLabel?: string
  amountLabel?: string
  balanceMode?: 'add' | 'subtract'
  calculationSummary?: ReactNode
  discountLabel?: string
  feeLabel?: string
  form: MoneyFormLike
  formNetAmount: number
  introContent?: ReactNode
  equalSplitFieldWidths?: boolean
  moneyInputValue: (key: string, value: number) => string
  netTargetLabel?: string
  paymentSplits: PaymentSplitLike[]
  paymentSplitTotal: number
  sectionHelp?: string
  sectionTitle?: string
  showDiscount?: boolean
  showReconciliationSummary?: boolean
  showSplitBalancePreview?: boolean
  splitAmountHelper?: (split: PaymentSplitLike, splitIndex: number) => ReactNode
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

  const getAccountLabel = accountLabel ?? ((account: DailyAccountOption) => {
    if (account.subtype === 'current') {
      const odLimit = account.odLimit ?? 0
      const odRemaining = account.odRemaining ?? 0
      const available = account.availableToPay ?? 0
      return `${account.name} (คงเหลือจริง ${formatMoney(account.balance ?? 0)} / OD คงเหลือ ${formatMoney(odRemaining)} / ใช้ได้รวม ${formatMoney(available)})`
    }
    return `${account.name} (คงเหลือจริง ${formatMoney(account.balance ?? 0)})`
  })

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
        const odUsed = Math.min(account.odRemaining ?? 0, Math.max(0, amount - Math.max(0, balance)))
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
    <div className="order-3 rounded-xl border border-blue-500/50 bg-[#0f172a] p-4 shadow-md space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/80 pb-3">
        <div>
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            {sectionTitle}
          </h4>
          <p className="mt-0.5 text-xs text-slate-400 font-normal">
            {sectionHelp}
          </p>
        </div>
        <UiButton
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3.5 py-1.5 rounded-lg shadow-sm text-xs transition-all active:scale-95 disabled:opacity-50"
          disabled={methodDisabled}
          size="sm"
          type="button"
          variant="default"
          onClick={onAddPaymentSplit}
        >
          {addButtonLabel}
        </UiButton>
      </div>

      {introContent ? <div className="rounded-lg bg-[#182642] border border-slate-700 p-3">{introContent}</div> : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Side: Splits List */}
        <div className={showSummaryCard ? "lg:col-span-8 space-y-3" : "lg:col-span-12 space-y-3"}>
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
                  return account.accountGroup === splitMethodGroup
                })

            return (
              <div
                key={split.id ?? splitIndex}
                className={`grid gap-2.5 rounded-xl border border-slate-700 bg-[#182640] p-3 shadow-sm ${equalSplitFieldWidths && paymentMethods ? 'grid-cols-[40px_190px_280px_350px_40px] items-start justify-start' : 'grid-cols-12 items-center'}`}
              >
                <div className={equalSplitFieldWidths && paymentMethods ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white font-black text-sm shadow-sm' : 'col-span-1 flex h-10 w-full items-center justify-center rounded-lg bg-blue-600 text-white font-black text-sm shadow-sm'}>
                  #{splitIndex + 1}
                </div>

                {paymentMethods ? (
                  <>
                    <div className={equalSplitFieldWidths ? '' : 'col-span-3'}>
                      <UiSelect
                        disabled={methodDisabled}
                        className="h-10 w-full rounded-lg border border-slate-600 bg-[#131d2e] text-white font-semibold px-3 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
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
                    <div className={equalSplitFieldWidths ? '' : 'col-span-4'}>
                      <UiSelect
                        disabled={!split.method || methodDisabled}
                        className="h-10 w-full rounded-lg border border-slate-600 bg-[#131d2e] text-white font-semibold px-3 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
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
                    <div className={equalSplitFieldWidths ? 'grid grid-cols-[150px_minmax(0,1fr)] items-center gap-2' : 'col-span-3'}>
                      <UiInput
                        disabled={methodDisabled}
                        className={`h-10 rounded-lg border border-slate-600 bg-[#131d2e] text-amber-300 font-bold px-3 text-right text-base tabular-nums focus:border-amber-400 focus:ring-1 focus:ring-amber-400 disabled:opacity-50 ${equalSplitFieldWidths ? 'w-[150px] flex-none' : 'w-full'}`}
                        inputMode="decimal"
                        placeholder={paymentSplits.length === 1 ? formatMoney(formNetAmount) : 'จำนวนเงิน'}
                        type="text"
                        value={moneyInputValue(splitAmountKey, splitAmount)}
                        onBlur={() => onFinishMoneyInput(splitAmountKey)}
                        onChange={(event) => onChangeMoneyInput(splitAmountKey, event.target.value, (amount) => onUpdatePaymentSplit(splitIndex, { amount }))}
                        onFocus={() => onStartMoneyInput(splitAmountKey, splitAmount)}
                      />
                      {splitAmountHelper ? <div className="min-w-0 whitespace-nowrap text-right text-xs font-bold text-slate-300">{splitAmountHelper(split, splitIndex)}</div> : null}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="col-span-6">
                      <UiSelect
                        disabled={methodDisabled}
                        className="h-10 w-full rounded-lg border border-slate-600 bg-[#131d2e] text-white font-semibold px-3 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
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
                        className="h-10 w-full rounded-lg border border-slate-600 bg-[#131d2e] text-amber-300 font-bold px-3 text-right text-base tabular-nums focus:border-amber-400 focus:ring-1 focus:ring-amber-400 disabled:opacity-50"
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

                <div className={equalSplitFieldWidths && paymentMethods ? 'text-center' : 'col-span-1 text-center'}>
                  <UiButton
                    className="h-10 w-10 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600 hover:text-white font-bold flex items-center justify-center text-lg disabled:opacity-20 transition-colors"
                    disabled={paymentSplits.length <= 1 || methodDisabled}
                    size="icon"
                    type="button"
                    variant="ghost"
                    onClick={() => onRemovePaymentSplit(splitIndex)}
                  >
                    ×
                  </UiButton>
                </div>
                {showSplitBalancePreview && split.accountId ? (
                  splitAccount?.subtype === 'current' && balanceMode === 'subtract' ? (
                    <div className="col-span-12 pl-2 space-y-2 border-t border-slate-700/80 pt-2 text-xs">
                      <div className="grid grid-cols-4 gap-2">
                        <label className="block text-blue-400">
                          <span className="font-medium">ยอดคงเหลือจริง</span>
                          <input className="mt-1 w-full bg-transparent p-0 text-right font-bold text-blue-300 text-sm tabular-nums disabled:opacity-100" disabled type="text" value={formatMoney(splitBalance)} />
                        </label>
                        <label className="block text-amber-400">
                          <span className="font-medium">OD คงเหลือ</span>
                          <input className="mt-1 w-full bg-transparent p-0 text-right font-bold text-amber-300 text-sm tabular-nums disabled:opacity-100" disabled type="text" value={formatMoney(splitAccount.odRemaining ?? 0)} />
                        </label>
                        <label className="block text-emerald-400">
                          <span className="font-medium">ยอดใช้ได้รวม</span>
                          <input className="mt-1 w-full bg-transparent p-0 text-right font-bold text-emerald-300 text-sm tabular-nums disabled:opacity-100" disabled type="text" value={formatMoney(splitAccount.availableToPay ?? 0)} />
                        </label>
                        <label className="block text-slate-300">
                          <span className="font-medium">หลังจ่าย คงเหลือจริง</span>
                          <input className="mt-1 w-full bg-transparent p-0 text-right font-bold text-slate-200 text-sm tabular-nums disabled:opacity-100" disabled type="text" value={formatMoney(Math.max(0, balanceAfter))} />
                        </label>
                      </div>
                      <div className={`text-xs font-bold ${splitAmount <= (splitAccount.availableToPay ?? 0) ? 'text-emerald-400' : 'text-rose-400'}`}>
                        Validation: ยอดจ่าย {formatMoney(splitAmount)} &le; ยอดใช้ได้รวม {formatMoney(splitAccount.availableToPay ?? 0)} {splitAmount <= (splitAccount.availableToPay ?? 0) ? 'ผ่าน' : 'ไม่ผ่าน'}
                      </div>
                    </div>
                  ) : (
                    <div className="col-span-12 grid grid-cols-3 gap-2 pl-2 text-xs border-t border-slate-700/60 pt-2">
                      <label className="block text-blue-400">
                        <span className="font-medium">💵 คงเหลือ</span>
                        <input className="mt-1 w-full bg-transparent p-0 text-right font-bold text-blue-300 text-sm tabular-nums disabled:opacity-100" disabled type="text" value={formatMoney(splitBalance)} />
                      </label>
                      <label className="block text-amber-400">
                        <span className="font-medium">{amountLabel}</span>
                        <input className="mt-1 w-full bg-transparent p-0 text-right font-bold text-amber-300 text-sm tabular-nums disabled:opacity-100" disabled type="text" value={splitAmount ? formatMoney(splitAmount) : '0.00'} />
                      </label>
                      <label className="block text-emerald-400">
                        <span className="font-medium">{afterLabel}</span>
                        <input className="mt-1 w-full bg-transparent p-0 text-right font-bold text-emerald-300 text-sm tabular-nums disabled:opacity-100" disabled type="text" value={formatMoney(balanceAfter)} />
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
          <div className="lg:col-span-4 rounded-xl border border-blue-500/50 bg-[#182640] p-3.5 space-y-2 text-xs shrink-0 self-start shadow-sm">
            <h5 className="font-bold text-white border-b border-slate-700 pb-2 mb-2">สรุปการใช้เงินของรายการนี้</h5>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">ใช้เงินคงเหลือปกติก่อน</span>
                <span className="font-bold text-slate-200">{formatMoney(totalNormalBalanceUsed)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">ใช้ OD</span>
                <span className="font-bold text-orange-400">{formatMoney(totalOdUsed)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Bank Fee</span>
                <span className="font-bold text-slate-200">{formatMoney(form.fee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Discount</span>
                <span className="font-bold text-slate-200">{formatMoney(form.discount)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-700 pt-2 font-bold">
                <span className="text-slate-200">รวมแยกบัญชี</span>
                <span className="text-blue-400 font-extrabold">{formatMoney(paymentSplitTotal)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-700 pt-1.5 font-bold">
                <span className="text-slate-200">ตรงกับยอดที่ต้องจ่าย</span>
                <span className={Math.abs(paymentSplitTotal - formNetAmount) < 0.01 ? "text-emerald-400 font-extrabold" : "text-rose-400 font-extrabold"}>
                  {formatMoney(formNetAmount - paymentSplitTotal)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-end gap-4 border-t border-slate-700/80 pt-3">
        {showDiscount ? <label className="block min-w-36 text-left text-xs font-semibold text-slate-200">
          <span>{discountLabel}</span>
          <UiInput
            disabled={methodDisabled}
            className="mt-1.5 h-10 w-full rounded-lg border border-slate-600 bg-[#131d2e] text-white font-bold px-3 text-right text-sm tabular-nums focus:border-blue-400"
            inputMode="decimal"
            type="text"
            value={moneyInputValue(formDiscountKey, Number(form.discount) || 0)}
            onBlur={() => onFinishMoneyInput(formDiscountKey)}
            onChange={(event) => onChangeMoneyInput(formDiscountKey, event.target.value, (discount) => onUpdatePaymentForm({ discount }))}
            onFocus={() => onStartMoneyInput(formDiscountKey, Number(form.discount) || 0)}
          />
        </label> : null}
        <label className="block min-w-36 text-left text-xs font-semibold text-slate-200">
          <span>{feeLabel}</span>
          <UiInput
            disabled={methodDisabled}
            className="mt-1.5 h-10 w-full rounded-lg border border-slate-600 bg-[#131d2e] text-white font-bold px-3 text-right text-sm tabular-nums focus:border-blue-400"
            inputMode="decimal"
            type="text"
            value={moneyInputValue(formFeeKey, Number(form.fee) || 0)}
            onBlur={() => onFinishMoneyInput(formFeeKey)}
            onChange={(event) => onChangeMoneyInput(formFeeKey, event.target.value, (fee) => onUpdatePaymentForm({ fee }))}
            onFocus={() => onStartMoneyInput(formFeeKey, Number(form.fee) || 0)}
          />
        </label>
      </div>
      {!showSummaryCard && showReconciliationSummary && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-700/80 pt-3 text-sm">
          <div className="rounded-xl bg-[#182640] border border-blue-500/50 p-3.5 shadow-sm text-left">
            <div className="text-xs text-blue-300 font-semibold">{totalLabel}</div>
            <div className="font-black text-white text-xl tabular-nums mt-1">{formatMoney(paymentSplitTotal)}</div>
          </div>
          <div className="rounded-xl bg-[#182640] border border-amber-500/60 p-3.5 shadow-sm text-left">
            <div className="text-xs text-amber-300 font-bold">{netTargetLabel}</div>
            <div className="font-black text-amber-300 text-xl tabular-nums mt-1">{formatMoney(formNetAmount)}</div>
          </div>
          <div className={`rounded-xl p-3.5 border shadow-sm text-left bg-[#182640] ${Math.abs(paymentSplitTotal - formNetAmount) < 0.01 ? 'border-emerald-500/70' : 'border-rose-500/70'}`}>
            <div className={`text-xs font-bold ${Math.abs(paymentSplitTotal - formNetAmount) < 0.01 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {Math.abs(paymentSplitTotal - formNetAmount) < 0.01 ? '🟢 ยอดตรงกัน' : '⚠️ ผลต่าง'}
            </div>
            <div className={`font-black text-xl tabular-nums mt-1 ${Math.abs(paymentSplitTotal - formNetAmount) < 0.01 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatMoney(formNetAmount - paymentSplitTotal)}
            </div>
          </div>
        </div>
      )}
      {calculationSummary ? <div className="mt-3 border-t border-slate-700/80 pt-3">{calculationSummary}</div> : null}
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
        <h4 className="font-semibold text-slate-800 dark:text-slate-200">รายการจ่าย ({paymentLines.length}) — เลือก PMA ที่ต้องการจ่ายได้เลย ระบบจะ auto-fill ผู้รับเงิน</h4>
        <UiButton className="bg-emerald-600 font-semibold hover:bg-emerald-700" size="xs" type="button" variant="default" onClick={onAddPaymentLine}>+ เพิ่มบรรทัด</UiButton>
      </div>
      {paymentSelectableBills.length === 0 ? <div className="mb-2 rounded-md border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">ไม่มี PMA ค้างจ่ายของผู้รับเงินนี้</div> : null}
      <Table className="min-w-[640px] text-xs">
        <TableHeader className="text-slate-700 dark:text-slate-300">
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
                    <UiInput className="h-9 w-full bg-slate-50 dark:bg-[#182640] dark:border-slate-700 dark:text-slate-100 px-1 py-1 text-xs disabled:opacity-100" disabled value={displayValue} />
                  ) : (
                    <UiInput
                      autoComplete="off"
                      className="h-9 w-full px-1 py-1 text-xs bg-white dark:bg-[#182640] dark:border-slate-700 dark:text-slate-100"
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
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>เอกสารต้นทาง: <span className="whitespace-nowrap font-mono font-medium text-slate-700 dark:text-slate-200">{lineBill.sourceDocNo || lineBill.docNo}</span></span>
                      <span>ช่องทางรับเงิน: <span className="font-medium text-slate-700 dark:text-slate-200">{approvalPaymentMethod}</span></span>
                      <span>บัญชีรับเงิน: <span className="font-medium text-slate-700 dark:text-slate-200">{destinationAccount}</span></span>
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="p-1 align-top"><UiInput className="h-9 w-full bg-slate-50 dark:bg-[#182640] dark:border-slate-700 px-1 py-1 text-right text-amber-700 dark:text-amber-400 disabled:opacity-100" disabled type="text" value={formatMoney(lineBalance)} /></TableCell>
                <TableCell className="p-1 text-center align-top"><UiButton className="h-8 w-8 px-0 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:text-slate-300 dark:disabled:text-slate-600" disabled={paymentLines.length <= 1 || (isBillLocked && lineIndex === 0)} size="icon" type="button" variant="ghost" onClick={() => onRemovePaymentLine(lineIndex)}>×</UiButton></TableCell>
              </TableRow>
            )
          })}
        </TableBody>
        <tfoot className="bg-slate-50 dark:bg-slate-800/80 font-semibold text-slate-800 dark:text-slate-200">
          <tr>
            <td className="p-2 text-right">รวม</td>
            <td className="p-2 text-right text-amber-700 dark:text-amber-400">{formatMoney(paymentLineBalanceTotal)}</td>
            <td />
          </tr>
        </tfoot>
      </Table>
    </div>
  )
}
