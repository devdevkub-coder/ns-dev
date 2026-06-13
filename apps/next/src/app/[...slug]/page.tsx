import Link from 'next/link'
import { notFound } from 'next/navigation'
import { navigationItems } from '@/lib/navigation'

type PlaceholderPageProps = {
  params: Promise<{
    slug: string[]
  }>
}

const retiredRoutes = new Set(['/production/wip-report'])

export default async function PlaceholderPage({ params }: PlaceholderPageProps) {
  const { slug } = await params
  const pathname = `/${slug.join('/')}`
  if (retiredRoutes.has(pathname)) notFound()
  const item = navigationItems.find((entry) => entry.href === pathname)
  const title = item?.label ?? 'ยังไม่ได้ย้ายหน้า'

  return (
    <section className="space-y-4">
      <div className="rounded-md bg-white p-5 shadow">
        <div className="text-sm text-slate-500">Next.js route scaffold</div>
        <h2 className="mt-1 text-xl font-bold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">หน้านี้มี route และ sidebar แล้ว แต่เนื้อหาด้านในยังรอ port จาก Vue/legacy เป็น batch ถัดไป</p>
      </div>

      <Link className="inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white" href="/sitemap">
        ดู sitemap
      </Link>
    </section>
  )
}
