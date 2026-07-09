import type { Metadata } from 'next'
import { AccountingPeriodsLockImpactTable } from './AccountingPeriodsLockImpactTable'

export const metadata: Metadata = {
  title: 'Accounting Periods | NS Scrap ERP',
}

const periodStates = [
  {
    code: 'open',
    label: 'เปิดงวด',
    meaning: 'เอกสารลงวันที่ในงวดนี้ยังบันทึก แก้ไข ยกเลิก หรือ reverse ได้ตามสิทธิ์ของแต่ละ flow',
    tone: 'green',
  },
  {
    code: 'soft_closed',
    label: 'ปิดงวดเบื้องต้น',
    meaning: 'เตือนและจำกัดงานย้อนหลังบางส่วน แต่ยังให้ admin แก้ได้พร้อม audit เมื่อมีเหตุผล',
    tone: 'amber',
  },
  {
    code: 'locked',
    label: 'ล็อกงวด',
    meaning: 'ต้อง block write ที่ลงวันที่ในงวดปิดตาม enforcement matrix ของ Sales, Purchase, Stock, Bank, Asset และ Tax',
    tone: 'red',
  },
  {
    code: 'reopened',
    label: 'เปิดงวดใหม่',
    meaning: 'เปิดงวดที่เคย lock แล้วแบบมีเหตุผล ผู้อนุมัติ และ rebuild snapshot หลังแก้ข้อมูล',
    tone: 'blue',
  },
  {
    code: 'year_closed',
    label: 'ปิดปี',
    meaning: 'freeze งบรายปีและ carry กำไรขาดทุนไป retained earnings ตาม policy ที่อนุมัติแล้ว',
    tone: 'slate',
  },
] as const

const readinessChecks = [
  {
    area: 'ความครบถ้วนของเอกสาร',
    detail: 'เอกสารต้นทางต้องไม่มีรายการค้างสถานะผิด เช่น PB/SB/PMT/RCP ที่ยังไม่ reconcile',
    status: 'ต้องออกแบบ check',
  },
  {
    area: 'กระทบยอดลูกหนี้/เจ้าหนี้',
    detail: 'ยอดลูกหนี้/เจ้าหนี้ต้องเทียบกับ allocation facts และ balance snapshot ได้',
    status: 'ต้องต่อ snapshot',
  },
  {
    area: 'สต็อกและ WAC',
    detail: 'ต้องไม่มี stock ติดลบ, missing WAC, หรือ pending_out ที่ขัดกับ ledger ก่อน lock',
    status: 'ต้องต่อ reconciliation',
  },
  {
    area: 'ธนาคารและเงินสด',
    detail: 'Bank statement ต้องแยก source ref และ movement ย้อนหลังให้ชัดก่อนปิดงวด',
    status: 'policy เท่านั้น',
  },
  {
    area: 'ทรัพย์สินและค่าเสื่อม',
    detail: 'ค่าเสื่อมและ disposal ในงวดต้องครบก่อน freeze asset report',
    status: 'บาง write flow เปิดแล้ว',
  },
  {
    area: 'ภาษี VAT/WHT',
    detail: 'ภาษีซื้อ ขาย และ WHT ต้องมี filing/readiness status แยกจากรายงานผู้บริหาร',
    status: 'ยังไม่ใช่ filing ledger',
  },
] as const

const lockImpacts = [
  ['ขาย', 'lock SB, RCP, customer advance allocation, stock return/cancel movement ที่ลงวันที่ในงวดปิด'],
  ['ซื้อ', 'lock PB, PMT, supplier advance allocation และ purchase stock movement ที่ลงวันที่ในงวดปิด'],
  ['สต็อก', 'lock stock movement, reversal, backdate และ freeze qty/value/WAC/pending_out snapshot'],
  ['ธนาคาร/เงินสด', 'lock bank statement correction/delete/backdate ยกเว้น reversal/audit path ที่ออกแบบแล้ว'],
  ['ทรัพย์สิน', 'lock acquisition, edit, depreciation, disposal และ reversal ในงวดปิด'],
  ['รายงาน', 'อ่านจาก frozen facts/snapshots เท่านั้น ไม่ mutate source document หรือ ledger'],
] as const

const pendingWork = [
  'นิยาม DB period state model และ audit table',
  'นิยาม closed-period write guard ให้ครบทุก write API',
  'นิยาม readiness checks ราย domain',
  'นิยาม snapshot build/rebuild flow',
  'นิยาม year-close retained earnings policy',
] as const

export default function AccountingPeriodsPage() {
  return (
    <section className="space-y-4">
      <section className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">สถานะงวดบัญชี</h3>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {periodStates.map((state) => (
            <div key={state.code} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900">{state.label}</h4>
                <StatusBadge tone={state.tone}>{state.code}</StatusBadge>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">{state.meaning}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h3 className="text-sm font-bold text-slate-900">ความพร้อมก่อนปิดงวด</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {readinessChecks.map((check) => (
            <div key={check.area} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-800">{check.area}</h4>
                <StatusBadge tone="slate">{check.status}</StatusBadge>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">{check.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <AccountingPeriodsLockImpactTable rows={lockImpacts} />

        <section className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">งานที่ยังต้องออกแบบก่อนเปิดใช้</h3>
          <div className="mt-3 space-y-2">
            {pendingWork.map((item, index) => (
              <div key={item} className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
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

function StatusBadge({ children, tone }: { children: string; tone: 'amber' | 'blue' | 'green' | 'red' | 'slate' }) {
  const toneClass = {
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    slate: 'border-slate-200 bg-slate-100 text-slate-700',
  }[tone]

  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>{children}</span>
}
