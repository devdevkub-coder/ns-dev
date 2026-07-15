import type { Metadata } from 'next'
import { PostingRulesTable } from './PostingRulesTable'

export const metadata: Metadata = {
  title: 'กฎการลงบัญชี | NS Scrap ERP',
}

const ruleGroups = [
  {
    group: 'ขาย',
    source: 'SB, RCP, allocation เงินรับล่วงหน้าลูกค้า',
    concern: 'รายได้, AR, VAT ขาย, เงินสด/ธนาคาร, หนี้สินเงินรับล่วงหน้า',
    readiness: 'ต้อง map ก่อนเปิด GL',
  },
  {
    group: 'ซื้อ',
    source: 'PB, PMT, allocation เงินจ่ายล่วงหน้าซัพพลายเออร์',
    concern: 'สต็อก/ค่าใช้จ่าย, AP, VAT ซื้อ, เงินสด/ธนาคาร, สินทรัพย์เงินจ่ายล่วงหน้า',
    readiness: 'ต้อง map ก่อนเปิด GL',
  },
  {
    group: 'สต็อก',
    source: 'stock_ledger, WAC/COGS, status convert',
    concern: 'บัญชีสต็อก, COGS, กำไร/ขาดทุนจากการปรับปรุง',
    readiness: 'ต้อง reconcile ก่อน',
  },
  {
    group: 'ธนาคาร/เงินสด',
    source: 'bank_statement, transfer, correction',
    concern: 'เงินสด, ธนาคาร, OD, FCD และประเภท movement',
    readiness: 'policy เท่านั้น',
  },
  {
    group: 'ทรัพย์สิน',
    source: 'acquisition, depreciation, disposal',
    concern: 'ต้นทุนทรัพย์สิน, ค่าเสื่อมสะสม, ค่าเสื่อมงวด, กำไร/ขาดทุน',
    readiness: 'บาง lifecycle เปิดแล้ว',
  },
  {
    group: 'เงินกู้',
    source: 'loan schedule, payment, interest',
    concern: 'เงินต้น, ดอกเบี้ย, หนี้สินระยะสั้น/ระยะยาว',
    readiness: 'รอออกแบบ',
  },
  {
    group: 'ภาษี',
    source: 'VAT/WHT facts',
    concern: 'ภาษีค้างจ่าย/รับคืน และความพร้อมยื่นแบบ',
    readiness: 'ยังไม่ใช่ filing ledger',
  },
  {
    group: 'ส่วนทุน',
    source: 'opening balance, equity, year close',
    concern: 'ทุน, กำไรสะสม, กำไร/ขาดทุนปีปัจจุบัน',
    readiness: 'ต้องมี close policy',
  },
] as const

const controlRules = [
  {
    title: 'ต้องเห็น mapping ที่ยังหาย',
    detail: 'ถ้า source type ยังไม่มี account mapping ต้องแสดงเป็น readiness issue ไม่ default เข้าบัญชีสำรองแบบเงียบ',
  },
  {
    title: 'ความหมาย source ต้องนิ่ง',
    detail: 'Rule ต้องอ้าง source type และ business meaning ที่ stable ไม่อิงเฉพาะ label บน UI',
  },
  {
    title: 'ต้องมี version และ audit',
    detail: 'การแก้ mapping ต้องมี version/audit เพราะมีผลกับงวดที่ close แล้วและการ repost ในอนาคต',
  },
  {
    title: 'แยกรายงานกับ journal',
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
  'กำหนด schema ของ posting rule, versioning และ audit table',
  'กำหนดรายการ mapping ที่จำเป็นต่อ source type',
  'กำหนด API ตรวจความพร้อมก่อน posting',
  'ผูกความสัมพันธ์กับ Accounting Periods lock/close',
  'แยก GL/statutory posting ออกจาก helper รายงานผู้บริหารปัจจุบัน',
] as const

export default function PostingRulesPage() {
  return (
    <section className="space-y-4">
      <section className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h3 className="text-sm font-bold text-slate-900">เงื่อนไขก่อนเปิดใช้งานจริง</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {controlRules.map((rule) => (
            <div key={rule.title} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <h4 className="text-sm font-bold text-slate-900">{rule.title}</h4>
              <p className="mt-3 text-xs leading-5 text-slate-600">{rule.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <PostingRulesTable rows={ruleGroups} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <section className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">ขอบเขตที่ต้องรักษา</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {boundaries.map(([title, detail]) => (
              <div key={title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="text-sm font-bold text-slate-800">{title}</h4>
                <p className="mt-2 text-xs leading-5 text-slate-600">{detail}</p>
              </div>
            ))}
          </div>
        </section>

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

function StatusBadge({ children, tone }: { children: string; tone: 'blue' | 'slate' }) {
  const toneClass = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    slate: 'border-slate-200 bg-slate-100 text-slate-700',
  }[tone]

  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>{children}</span>
}
