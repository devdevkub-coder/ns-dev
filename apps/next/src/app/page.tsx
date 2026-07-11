import { Card } from '@/components/ui/Card'

const nextSteps = [
  'กำหนด route protection และ permission guard ให้แต่ละ module',
  'กำหนด shared service contract กับ Supabase dev-target',
  'เลือกว่าจะ migrate route ไหนจาก Vue มาเป็น Next.js ก่อน',
]

export default function HomePage() {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-scrap-accent">Next.js workspace</p>
        <h1 className="mt-1 text-2xl font-bold text-scrap-ink">NS Scrap ERP</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {nextSteps.map((step, index) => (
          <Card key={step}>
            <div className="text-xs font-bold text-scrap-accent">Step {index + 1}</div>
            <div className="mt-2 text-sm font-semibold text-scrap-ink">{step}</div>
          </Card>
        ))}
      </div>
    </section>
  )
}
