import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Posting Rules | NS Scrap ERP',
}

const ruleGroups = [
  {
    group: 'Sales',
    source: 'SB, RCP, customer advance allocation',
    concern: 'Revenue, AR, VAT output, cash/bank, advance liability',
    readiness: 'ต้อง map ก่อนเปิด GL',
  },
  {
    group: 'Purchase',
    source: 'PB, PMT, supplier advance allocation',
    concern: 'Inventory/expense, AP, VAT input, cash/bank, advance asset',
    readiness: 'ต้อง map ก่อนเปิด GL',
  },
  {
    group: 'Stock',
    source: 'stock_ledger, WAC/COGS, status convert',
    concern: 'Inventory account, COGS, adjustment gain/loss',
    readiness: 'ต้อง reconcile ก่อน',
  },
  {
    group: 'Bank/Cash',
    source: 'bank_statement, transfer, correction',
    concern: 'Cash, bank, OD, FCD account and movement classification',
    readiness: 'policy เท่านั้น',
  },
  {
    group: 'Assets',
    source: 'acquisition, depreciation, disposal',
    concern: 'Asset cost, accumulated depreciation, depreciation expense, gain/loss',
    readiness: 'บาง lifecycle เปิดแล้ว',
  },
  {
    group: 'Loans',
    source: 'loan schedule, payment, interest',
    concern: 'Principal, interest, current/non-current liability',
    readiness: 'design-only',
  },
  {
    group: 'Tax',
    source: 'VAT/WHT facts',
    concern: 'Tax payable/receivable and filing readiness',
    readiness: 'ยังไม่ใช่ filing ledger',
  },
  {
    group: 'Equity',
    source: 'opening balance, equity, year close',
    concern: 'Capital, retained earnings, current year profit/loss',
    readiness: 'ต้องมี close policy',
  },
] as const

const controlRules = [
  {
    title: 'Missing mapping must be visible',
    detail: 'ถ้า source type ยังไม่มี account mapping ต้องแสดงเป็น readiness issue ไม่ default เข้าบัญชีสำรองแบบเงียบ',
  },
  {
    title: 'Stable source meaning',
    detail: 'Rule ต้องอ้าง source type และ business meaning ที่ stable ไม่อิงเฉพาะ label บน UI',
  },
  {
    title: 'Version and audit',
    detail: 'การแก้ mapping ต้องมี version/audit เพราะมีผลกับงวดที่ close แล้วและการ repost ในอนาคต',
  },
  {
    title: 'Report boundary',
    detail: 'รายงาน management ปัจจุบันยังอ่าน operational facts/helpers ไม่ได้กลายเป็น journal source',
  },
] as const

const boundaries = [
  ['ไม่สร้าง GL journal เองใน runtime ปัจจุบัน', 'รอ schema, versioning, audit, reversal และ posting policy แยก'],
  ['ไม่แก้ source documents หรือ fact tables', 'SB, PB, stock_ledger, bank_statement, assets และ loans ยังเป็น source owner ของตัวเอง'],
  ['ไม่ fallback account mapping แบบเงียบ', 'mapping ที่หายต้องขึ้นเป็น issue ให้แก้ก่อน close/posting'],
  ['ไม่ใช้ rule ใหม่ทับ period เก่าที่ lock แล้ว', 'งวดที่ปิดแล้วต้องถือ rule version/snapshot เดิม หรือมี reopen/repost policy'],
] as const

const pendingWork = [
  'Define posting rule schema, versioning, and audit table',
  'Define required mapping list per source type',
  'Define readiness check API',
  'Define relationship to Accounting Periods lock/close',
  'Keep GL/statutory posting separate from current management report helpers',
] as const

export default function PostingRulesPage() {
  return (
    <section className="space-y-4">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-4 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">FA5 mapping readiness</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">Posting Rules และ source-to-account mapping</h2>
            <p className="mt-1 text-sm leading-6 text-slate-700">
              หน้านี้ใช้บอกว่า source document หรือ movement ใดต้อง map ไปบัญชีใดก่อนเปิด GL/statutory posting ในอนาคต
              สถานะปัจจุบันยังเป็น policy UI และยังไม่ post journal อัตโนมัติ
            </p>
          </div>
          <StatusBadge tone="blue">GL posting deferred</StatusBadge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryCard label="Runtime write" value="ปิดอยู่" detail="ไม่มี save, apply, post, repost หรือ journal mutation" />
        <SummaryCard label="Fallback policy" value="ห้าม fallback" detail="mapping ที่หายต้องแสดงเป็น issue ไม่ default แบบเงียบ" />
        <SummaryCard label="Close dependency" value="ต้อง complete" detail="Posting Rules ต้องพร้อมก่อน Accounting Periods lock/statutory close" />
      </div>

      <section className="rounded-md bg-white p-4 shadow">
        <div className="mb-3">
          <h3 className="text-sm font-bold text-slate-900">Controls ก่อนเปิดใช้งานจริง</h3>
          <p className="mt-1 text-xs text-slate-500">กติกานี้ป้องกันไม่ให้ report page กลายเป็น GL source หรือทำ mapping หายแบบเงียบ</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {controlRules.map((rule) => (
            <div key={rule.title} className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <h4 className="text-sm font-bold text-slate-900">{rule.title}</h4>
              <p className="mt-3 text-xs leading-5 text-slate-600">{rule.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-md bg-white shadow">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">Target rule groups</h3>
          <p className="mt-1 text-xs text-slate-500">รายการนี้เป็น readiness matrix ยังไม่ใช่ account mapping ที่บันทึกลง DB</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="w-36 p-2 text-left font-semibold text-slate-700">Group</th>
                <th className="min-w-64 p-2 text-left font-semibold text-slate-700">Example source</th>
                <th className="min-w-80 p-2 text-left font-semibold text-slate-700">Target mapping concern</th>
                <th className="w-52 p-2 text-left font-semibold text-slate-700">Readiness</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {ruleGroups.map((rule) => (
                <tr key={rule.group}>
                  <td className="p-2 align-top font-semibold text-slate-900">{rule.group}</td>
                  <td className="p-2 align-top text-slate-700">{rule.source}</td>
                  <td className="p-2 align-top text-slate-700">{rule.concern}</td>
                  <td className="p-2 align-top">
                    <StatusBadge tone="slate">{rule.readiness}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <section className="rounded-md bg-white p-4 shadow">
          <h3 className="text-sm font-bold text-slate-900">Boundary ที่ยังต้องรักษา</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {boundaries.map(([title, detail]) => (
              <div key={title} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="text-sm font-bold text-slate-800">{title}</h4>
                <p className="mt-2 text-xs leading-5 text-slate-600">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md bg-white p-4 shadow">
          <h3 className="text-sm font-bold text-slate-900">งานที่ยังต้องออกแบบก่อนเปิดใช้</h3>
          <div className="mt-3 space-y-2">
            {pendingWork.map((item, index) => (
              <div key={item} className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                  {index + 1}
                </span>
                <span className="leading-5">{item}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}

function SummaryCard({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div className="rounded-md bg-white p-4 shadow">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p>
    </div>
  )
}

function StatusBadge({ children, tone }: { children: string; tone: 'blue' | 'slate' }) {
  const toneClass = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    slate: 'border-slate-200 bg-slate-100 text-slate-700',
  }[tone]

  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>{children}</span>
}
