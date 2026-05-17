import Link from 'next/link'
import { navigationItems, navigationSections } from '@/lib/navigation'

export default function SitemapPage() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Sitemap</h2>
        <p className="mt-1 text-sm text-slate-600">โครง route หลักจาก sidebar เดิม ใช้เป็น checklist สำหรับย้ายแต่ละหน้าเข้า Next.js</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {navigationSections.map((section) => {
          const items = navigationItems.filter((item) => item.section === section.key)
          if (!items.length) return null

          return (
            <section key={section.key} className="rounded-xl bg-white p-4 shadow">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">{section.label}</h3>
              <div className="mt-3 divide-y divide-slate-100">
                {items.map((item) => (
                  <Link key={item.href} className="flex items-center gap-3 py-2 text-sm hover:text-blue-700" href={item.href}>
                    <span className="w-6 text-center">{item.icon}</span>
                    <span className="font-medium text-slate-800">{item.label}</span>
                    <span className="ml-auto text-xs text-slate-400">{item.href}</span>
                  </Link>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </section>
  )
}
