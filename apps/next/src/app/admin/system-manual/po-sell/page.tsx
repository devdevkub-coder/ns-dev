import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'คู่มือระบบ | PO Sell',
}

const moduleGroups = [
  {
    title: 'รายการประจำวัน',
    items: ['PO Buy', 'PO Sell', 'ใบรับ-ส่งของ', 'บิลรับซื้อ', 'บิลขาย'],
  },
  {
    title: 'การเงิน & หนี้',
    items: ['รับเงิน Customer', 'จ่ายเงิน', 'อนุมัติจ่ายเงิน', 'เงินสำรองจ่าย'],
  },
  {
    title: 'Dual Costing',
    items: ['Cost Pool', 'Waiting Allocations', 'Cost Allocator', 'Allocation Ledger'],
  },
  {
    title: 'ระบบ',
    items: ['คู่มือระบบ', 'Users & Permissions', 'Audit Log'],
  },
]

const pageSections = [
  { href: '#overview', label: 'ภาพรวม' },
  { href: '#menu-path', label: 'เข้าใช้งานจากเมนู' },
  { href: '#steps', label: 'ขั้นตอนการทำงาน' },
  { href: '#fields', label: 'ความหมายของ Field' },
  { href: '#result', label: 'ผลลัพธ์หลังบันทึก' },
  { href: '#warnings', label: 'ข้อควรระวัง' },
  { href: '#related-flow', label: 'Flow ที่เกี่ยวข้อง' },
]

const fieldGroups = [
  {
    title: 'ข้อมูลหัวเอกสาร',
    rows: [
      ['เลขที่', 'เลขที่ PO Sell ที่ระบบออกให้ ใช้อ้างอิงกับการส่งของ เปิดบิลขาย และ Dual Costing'],
      ['วันที่', 'วันที่สร้างเอกสารจองขาย'],
      ['Customer', 'ลูกค้าที่จองซื้อสินค้า ต้องตรงกับเอกสารปลายทาง เช่น WTO หรือบิลขาย'],
      ['Credit Term (วัน)', 'จำนวนวันเครดิตเพื่อใช้ติดตามกำหนดชำระหรืออายุหนี้'],
      ['สาขา', 'สาขาที่รับผิดชอบเอกสารขาย'],
      ['คลัง', 'คลังที่เกี่ยวข้องกับสินค้าในรายการขาย'],
      ['ช่องทางขาย', 'ช่องทางหรือประเภทการขาย เช่น ภายในประเทศ / Export'],
      ['ทะเบียนรถส่งของ', 'ข้อมูลรถที่ใช้ส่งของ กรอกเมื่อมีข้อมูลแล้ว'],
      ['เบอร์โทรลูกค้า', 'เบอร์ติดต่อปลายทางหรือผู้ประสานงาน'],
      ['ผู้รับของ', 'ชื่อผู้รับสินค้าหน้างาน'],
      ['หมายเหตุ', 'ข้อมูลเพิ่มเติมของดีลหรือเงื่อนไขเฉพาะ'],
    ],
  },
  {
    title: 'รายการสินค้า',
    rows: [
      ['สินค้า / Grade', 'สินค้าที่ลูกค้าจองซื้อ เช่น SKU108 - ทองแดงเบอร์ 1'],
      ['ที่มา', 'ระบุแหล่งสินค้า เช่น Stock หรือ Trading ตามรูปแบบธุรกรรม'],
      ['จำนวน (กก.)', 'น้ำหนักที่ลูกค้าจองซื้อ'],
      ['ราคา/หน่วย', 'ราคาขายต่อกิโลกรัม'],
      ['ยอดรวม', 'จำนวน (กก.) x ราคา/หน่วย'],
      ['Stock/ทุน หลังขาย', 'ข้อมูลคาดการณ์สำหรับดูผลกระทบต่อ Stock หรือต้นทุน'],
      ['ตัด PO Sell', 'ใช้เลือก/ผูก PO ที่เกี่ยวข้อง กรณีรายการนี้ต่อยอดจาก PO หลายใบ'],
    ],
  },
  {
    title: 'ยอดรวมและ VAT',
    rows: [
      ['มี VAT 7%', 'เลือกเมื่อเอกสารนี้คิด VAT'],
      ['ส่วนลดท้ายบิล', 'ส่วนลดรวมทั้งเอกสาร หน่วยบาท'],
      ['ยอดรวมรายการ', 'ผลรวมมูลค่าทุกรายการก่อนส่วนลด'],
      ['หลังส่วนลด', 'ยอดรวมหลังหักส่วนลดท้ายบิล'],
      ['ยอดรวมสุทธิ', 'ยอดสุดท้ายของ PO Sell หลังคำนวณ VAT/ส่วนลดตามเงื่อนไข'],
    ],
  },
]

export default function SystemManualPoSellPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">ระบบ / ตั้งค่าระบบ / คู่มือระบบ</p>
            <h1 className="mt-2 text-2xl font-bold">คู่มือระบบ</h1>
            <p className="mt-1 text-sm text-slate-500">ตัวอย่างคู่มือการใช้งานแบบ Documentation สำหรับ Module รายการประจำวัน</p>
          </div>
          <label className="relative block w-full lg:w-[360px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
            <input
              className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="ค้นหาคู่มือ / Flow / ชื่อเมนู..."
              type="search"
            />
          </label>
        </div>
      </header>

      <div className="grid gap-6 px-6 py-6 xl:grid-cols-[260px_minmax(0,1fr)_220px]">
        <aside className="h-fit rounded-lg border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4">
          <h2 className="text-sm font-bold">สารบัญคู่มือ</h2>
          <div className="mt-4 space-y-4">
            {moduleGroups.map((group) => (
              <section key={group.title}>
                <h3 className="text-xs font-bold uppercase text-slate-400">{group.title}</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {group.items.map((item) => {
                    const isActive = item === 'PO Sell'
                    return (
                      <li key={item}>
                        <a
                          className={`block rounded-md px-3 py-2 ${isActive ? 'bg-blue-50 font-bold text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                          href={isActive ? '#overview' : '#'}
                        >
                          {item}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </aside>

        <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-8 py-8">
            <p className="text-sm font-bold text-blue-700">คู่มือรายการประจำวัน</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight">PO Sell (จองขาย)</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              ใช้สำหรับบันทึกการจองขายสินค้าให้ลูกค้า ล็อกจำนวน ราคา และเงื่อนไขการขาย ก่อนนำไปส่งของ เปิดบิลขาย
              หรือใช้เป็นเอกสารปลายทางสำหรับ Dual Costing ในกรณีสินค้าทองแดงและทองเหลือง
            </p>
          </div>

          <div className="space-y-10 px-8 py-8">
            <section id="overview" className="scroll-mt-6">
              <h3 className="text-xl font-bold">ภาพรวม</h3>
              <p className="mt-3 leading-7 text-slate-700">
                PO Sell คือเอกสารจองขายล่วงหน้า ใช้บันทึกว่าลูกค้าต้องการซื้อสินค้าอะไร จำนวนเท่าไร ราคาเท่าไร
                และจะเกี่ยวข้องกับสาขา/คลังใด เมื่อบันทึกแล้วสามารถนำไปใช้ต่อใน Flow ส่งของ เปิดบิลขาย และ Cost Allocation ได้
              </p>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                  <div className="text-xs font-bold text-blue-600">ใช้เพื่อ</div>
                  <div className="mt-1 font-bold">จองขายล่วงหน้า</div>
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                  <div className="text-xs font-bold text-emerald-600">ต่อยอดไป</div>
                  <div className="mt-1 font-bold">WTO / Sales Bill</div>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
                  <div className="text-xs font-bold text-amber-600">เกี่ยวข้องกับ</div>
                  <div className="mt-1 font-bold">Dual Costing</div>
                </div>
              </div>
            </section>

            <section id="menu-path" className="scroll-mt-6">
              <h3 className="text-xl font-bold">เข้าใช้งานจากเมนู</h3>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-sm text-slate-700">
                รายการประจำวัน &gt; PO Sell (จองขาย) &gt; + PO Sell ใหม่
              </div>
            </section>

            <section id="steps" className="scroll-mt-6">
              <h3 className="text-xl font-bold">ขั้นตอนการทำงาน</h3>
              <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                <li className="rounded-lg border border-slate-200 p-4"><strong>1. เปิดหน้า PO Sell</strong> แล้วกดปุ่ม <strong>+ PO Sell ใหม่</strong></li>
                <li className="rounded-lg border border-slate-200 p-4"><strong>2. กรอกข้อมูลหัวเอกสาร</strong> เช่น วันที่ ลูกค้า สาขา คลัง ช่องทางขาย และข้อมูลผู้รับของ</li>
                <li className="rounded-lg border border-slate-200 p-4"><strong>3. เพิ่มรายการสินค้า</strong> เลือกสินค้า/Grade กรอกจำนวน ราคา และตรวจยอดรวม</li>
                <li className="rounded-lg border border-slate-200 p-4"><strong>4. ระบุ VAT / ส่วนลด</strong> ถ้ามีเงื่อนไขภาษีหรือส่วนลดท้ายเอกสาร</li>
                <li className="rounded-lg border border-slate-200 p-4"><strong>5. บันทึกเอกสาร</strong> ระบบสร้างเลข PO Sell และแสดงในรายการจองขาย</li>
              </ol>
            </section>

            <section id="fields" className="scroll-mt-6">
              <h3 className="text-xl font-bold">ความหมายของ Field</h3>
              <div className="mt-4 space-y-6">
                {fieldGroups.map((group) => (
                  <div key={group.title} className="overflow-hidden rounded-lg border border-slate-200">
                    <div className="bg-slate-100 px-4 py-3 font-bold">{group.title}</div>
                    <table className="w-full text-left text-sm">
                      <tbody>
                        {group.rows.map(([field, description]) => (
                          <tr key={field} className="border-t border-slate-200">
                            <th className="w-48 bg-white px-4 py-3 align-top font-bold text-slate-800">{field}</th>
                            <td className="px-4 py-3 leading-6 text-slate-600">{description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </section>

            <section id="result" className="scroll-mt-6">
              <h3 className="text-xl font-bold">ผลลัพธ์หลังบันทึก</h3>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
                <li>ระบบสร้างเอกสาร PO Sell พร้อมเลขที่เอกสาร</li>
                <li>รายการจะถูกใช้เป็นเอกสารอ้างอิงสำหรับส่งของหรือเปิดบิลขาย</li>
                <li>สินค้าหมวดทองแดง/ทองเหลืองสามารถไปปรากฏใน Waiting Allocations เพื่อจัดสรรต้นทุน</li>
                <li>ยอดคงเหลือของ PO Sell จะลดลงเมื่อมีการส่งของหรือเปิดบิลตาม Flow ที่กำหนด</li>
              </ul>
            </section>

            <section id="warnings" className="scroll-mt-6">
              <h3 className="text-xl font-bold">ข้อควรระวัง</h3>
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                หาก PO Sell ถูกนำไปเปิดบิลขาย ส่งของ หรือจัดสรรต้นทุนแล้ว การแก้ไข/ยกเลิกควรตรวจเอกสารปลายทางก่อน
                เพื่อไม่ให้ยอดขาย ยอดส่งของ และต้นทุนใน Dual Costing ไม่ตรงกัน
              </div>
            </section>

            <section id="related-flow" className="scroll-mt-6">
              <h3 className="text-xl font-bold">Flow ที่เกี่ยวข้อง</h3>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-700">
                PO Sell → ส่งของ WTO → เปิดบิลขาย → รับเงิน Customer
              </div>
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-700">
                PO Sell → Waiting Allocations → Cost Allocator → Allocation Ledger
              </div>
            </section>
          </div>
        </article>

        <aside className="hidden h-fit rounded-lg border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4 xl:block">
          <h2 className="text-sm font-bold">On this page</h2>
          <nav className="mt-3 space-y-1 text-sm">
            {pageSections.map((section) => (
              <a key={section.href} className="block rounded-md px-2 py-1.5 text-slate-600 hover:bg-slate-50 hover:text-blue-700" href={section.href}>
                {section.label}
              </a>
            ))}
          </nav>
        </aside>
      </div>
    </main>
  )
}
