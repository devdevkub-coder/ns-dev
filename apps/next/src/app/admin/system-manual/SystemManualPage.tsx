import Link from 'next/link'
import { manualModuleGroups, type ManualPage } from './manual-content'

const pageSections = [
  { href: '#overview', label: 'ภาพรวม' },
  { href: '#menu-path', label: 'เข้าใช้งานจากเมนู' },
  { href: '#steps', label: 'ขั้นตอนการทำงาน' },
  { href: '#fields', label: 'ความหมายของ Field' },
  { href: '#result', label: 'ผลลัพธ์หลังบันทึก' },
  { href: '#warnings', label: 'ข้อควรระวัง' },
  { href: '#related-flow', label: 'Flow ที่เกี่ยวข้อง' },
]

type SystemManualPageProps = {
  manual: ManualPage
}

export function SystemManualPage({ manual }: SystemManualPageProps) {
  const lastFlowStep = manual.flow[manual.flow.length - 1] ?? manual.flow[0]

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="mt-2 text-2xl font-bold">คู่มือระบบ</h1>
          </div>
          <label className="relative block w-full lg:w-[360px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
            <input
              className="h-11 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="ค้นหาคู่มือ / Flow / ชื่อเมนู..."
              type="search"
            />
          </label>
        </div>
      </header>

      <div className="grid gap-6 px-6 py-6 xl:grid-cols-[280px_minmax(0,1fr)_220px]">
        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4">
          <h2 className="text-sm font-bold">สารบัญคู่มือ</h2>
          <div className="mt-4 space-y-4">
            {manualModuleGroups.map((group) => (
              <section key={group.title}>
                <h3 className="text-xs font-bold uppercase text-slate-400">{group.title}</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {group.items.map((item) => {
                    const isActive = item.slug === manual.slug
                    return (
                      <li key={item.slug}>
                        <Link
                          className={`block rounded-md px-3 py-2 ${isActive ? 'bg-blue-50 font-bold text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                          href={`/admin/system-manual/${item.slug}`}
                        >
                          {item.label}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </aside>

        <article className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-8 py-8">
            <p className="text-sm font-bold text-blue-700">คู่มือ{manual.category}</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight">{manual.title}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{manual.overview}</p>
          </div>

          <div className="space-y-10 px-8 py-8">
            <section id="overview" className="scroll-mt-6">
              <h3 className="text-xl font-bold">ภาพรวม</h3>
              <p className="mt-3 leading-7 text-slate-700">{manual.overview}</p>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <div className="text-xs font-bold text-blue-600">Module</div>
                  <div className="mt-1 font-bold">{manual.category}</div>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                  <div className="text-xs font-bold text-emerald-600">เมนู</div>
                  <div className="mt-1 font-bold">{manual.title}</div>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                  <div className="text-xs font-bold text-amber-600">Flow</div>
                  <div className="mt-1 font-bold">{manual.flow[0]} → {lastFlowStep}</div>
                </div>
              </div>
            </section>

            <section id="menu-path" className="scroll-mt-6">
              <h3 className="text-xl font-bold">เข้าใช้งานจากเมนู</h3>
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm text-slate-700">{manual.menuPath}</div>
            </section>

            <section id="steps" className="scroll-mt-6">
              <h3 className="text-xl font-bold">ขั้นตอนการทำงาน</h3>
              <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                {manual.steps.map((step, index) => (
                  <li key={step} className="rounded-xl border border-slate-200 p-4">
                    <strong>{index + 1}. </strong>{step}
                  </li>
                ))}
              </ol>
            </section>

            <section id="fields" className="scroll-mt-6">
              <h3 className="text-xl font-bold">ความหมายของ Field</h3>
              <div className="mt-4 space-y-3">
                {manual.fieldGroups.map((group) => (
                  <details key={group.title} className="group overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-slate-100 px-4 py-3 font-bold text-slate-800 transition hover:bg-slate-200">
                      <span>{group.title}</span>
                      <span className="text-xs font-semibold text-slate-500 group-open:hidden">แสดงรายละเอียด</span>
                      <span className="hidden text-xs font-semibold text-blue-600 group-open:inline">ซ่อนรายละเอียด</span>
                    </summary>
                    <table className="ns-table w-full text-left text-sm">
                      <tbody>
                        {group.rows.map(([field, description]) => (
                          <tr key={`${group.title}-${field}`} className="border-t border-slate-200">
                            <th className="w-52 bg-white px-4 py-3 align-top font-bold text-slate-800">{field}</th>
                            <td className="px-4 py-3 leading-6 text-slate-600">{description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                ))}
              </div>
            </section>

            <section id="result" className="scroll-mt-6">
              <h3 className="text-xl font-bold">ผลลัพธ์หลังบันทึก</h3>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
                {manual.result.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </section>

            <section id="warnings" className="scroll-mt-6">
              <h3 className="text-xl font-bold">ข้อควรระวัง</h3>
              <div className="mt-4 space-y-3">
                {manual.warnings.map((item) => (
                  <div key={item} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{item}</div>
                ))}
              </div>
            </section>

            <section id="related-flow" className="scroll-mt-6">
              <h3 className="text-xl font-bold">Flow ที่เกี่ยวข้อง</h3>
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-700">
                {manual.flow.join(' → ')}
              </div>
              {manual.related.map((item) => (
                <div key={item} className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-700">{item}</div>
              ))}
            </section>
          </div>
        </article>

        <aside className="hidden h-fit rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4 xl:block">
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
