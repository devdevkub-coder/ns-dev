import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-xl border border-slate-200/60 bg-white p-8 text-center shadow-sm">
      <div className="text-5xl" aria-hidden="true">🔍</div>
      <h1 className="text-xl font-bold text-slate-900">ไม่พบหน้านี้ (404)</h1>
      <p className="max-w-md text-sm text-slate-500">
        หน้าที่คุณค้นหาไม่มีอยู่ หรือถูกย้าย/ลบออกจากระบบแล้ว<br />
        กรุณากลับไปยังหน้าแรก หรือลองตรวจสอบลิงก์ใหม่อีกครั้ง
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          className="inline-flex h-10 items-center rounded-md bg-slate-800 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
          href="/"
        >
          กลับหน้าหลัก
        </Link>
        <Link
          className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          href="/dashboard-overview"
        >
          ไปหน้าแดชบอร์ด
        </Link>
      </div>
    </div>
  )
}
