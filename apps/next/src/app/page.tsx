import { Card } from '@/components/ui/Card'

const nextSteps = [
  'ย้าย auth/session wiring เข้ามาที่ Next.js shell',
  'กำหนด shared service contract กับ Supabase dev-target',
  'เลือกว่าจะ migrate route ไหนจาก Vue มาเป็น Next.js ก่อน',
]

export default function HomePage() {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-scrap-accent">Next.js workspace</p>
        <h1 className="mt-1 text-2xl font-bold text-scrap-ink">NS Scrap ERP</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-scrap-muted">
          โฟลเดอร์นี้เป็น Next.js app แยกจาก Vue app เดิม ใช้สำหรับย้าย frontend รุ่นถัดไปโดยคง sidebar, topbar, sitemap และ business flow เดิมไว้ก่อน
        </p>
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
