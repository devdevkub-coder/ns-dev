# 00 Current Work

## Purpose

ไฟล์นี้เป็น handoff สั้นสำหรับงานที่กำลัง active เท่านั้น ไม่ใช่ changelog

## Active Objective

ทำ reference master cache ให้เป็น execution ที่ชัดเจนและย้าย consumer จริงทีละ batch:

- read path ใช้ `short-lived server cache -> Redis -> DB`
- DB ยังคงเป็น source of truth
- write path invalidate key ที่เกี่ยวข้องหลัง DB สำเร็จ
- ไม่ใช้ runtime fallback เพื่อกลบข้อมูลหรือ contract ที่ผิด

## Canonical References

- cache design + completed history: `docs/notes/Reference Master Cache Flow.md`
- execution tracker: `docs/migration/09-implementation-tasklist.md`
- design baseline: `docs/design.md`
- environment/deploy target: `docs/migration/10-environment-status.md`

## Completed Scope In This Working Tree

- shared Redis/server cache service และ invalidation foundation
- active and historical readers สำหรับ branch, warehouse, customer, supplier, account และ lookup masters ที่ระบุใน cache flow
- master write routes ที่เกี่ยวข้อง invalidate cache key แล้ว
- branch/warehouse master GET ใช้ full master contract (active + inactive) แล้ว
- consumer option/filter/read-only หลายชุดถูกย้ายแล้ว; รายละเอียดอยู่ใน cache flow เพื่อไม่ให้ซ้ำที่นี่

## Latest Completed Batch: CACHE-P1 Product Reference Contract

Product option/search มี contract แยกชัดเจน:

1. `ProductReferenceRecord` มีเฉพาะ `id`, `code`, `name`, `unit`, `type`, `metalGroup`, `active`
2. ราคา, ต้นทุน, WAC, stock และ image URL ไม่อยู่ใน product reference cache
3. thumbnail storage key เป็น cache metadata คนละ key และ `/api/daily/weight-tickets/products` เป็นผู้ประกอบ URL เอง
4. product create/update/active-toggle/import ล้าง product option/search/thumbnail keys หลัง DB write สำเร็จ
5. consumer แรกคือ `GET /api/daily/weight-tickets/products`; shape ของ response เดิมยังคงเดิมสำหรับ WTI/WTO form

Validation completed:

- `reference-master-cache.test.ts`: 33 tests passed
- full `npm run type-check --workspace @ns-scrap-erp/next` passed
- `npm run lint --workspace @ns-scrap-erp/next` passed
- `npm run build --workspace @ns-scrap-erp/next` passed (Next.js 16.2.10, 308 routes)
- `git diff --check` passed

## Latest Completed Batch: CACHE-M1 Instrumentation Foundation

- production จะ emit structured cache read/error logs โดย redaction key ที่มี search query, branch code หรือ id
- ไม่เพิ่ม Redis counter write บน hot path; ใช้ Vercel runtime log เพื่อตรวจ hit/miss/error ก่อนตัดสินใจปรับ TTL
- `REFERENCE_CACHE_OBSERVABILITY_ENABLED=false` ปิด production logging ได้ชั่วคราว; local ต้อง opt-in ด้วย `true`
- `reference-master-cache.test.ts`: 33 tests passed รวม telemetry redaction และ full master branch/warehouse contract

## Next Batch Selection

เลือก batch ถัดไปจาก canonical queue ใน `docs/migration/09-implementation-tasklist.md` เท่านั้น:

1. `CACHE-P2`: วัด bottleneck ของการส่งภาพก่อนตัดสินใจปรับ image delivery
2. รอดู `CACHE-M1` runtime logs จาก production ก่อนปรับ TTL, ประเมิน error rate หรือ retire cache key

P2 code-path assessment เสร็จแล้ว: `GET /api/daily/weight-tickets/products` ไม่ fetch binary หรือ call Storage ต่อสินค้า; route อ่าน thumbnail storage key จาก cache แล้วประกอบ public URL ใน process เท่านั้น ส่วน browser โหลด thumbnail ผ่าน Storage/CDN ภายหลัง จึงยังไม่มีเหตุผลให้เพิ่ม image cache หรือเปลี่ยน image delivery โดยไม่มี runtime latency/transfer evidence.

`CACHE-A1` audit ปิดแล้ว: consumer account ที่เป็น option/label read-only ใช้ shared reader ครบใน scope; direct account query ที่เหลือเป็น master list/write resolution หรือ statement calculation จึงไม่เข้า cache contract.

ยังไม่มี batch ถัดไปที่เปิด active; ห้าม scan หรือย้าย consumer ทั้งระบบโดยไม่มีการเลือก batch

### Explicitly Out Of Scope

- write-time validation ของ stock/WTO/production และ transactional reads ที่ต้องเห็น state ปัจจุบันทันที
- product price/cost/stock/WAC และ binary image delivery ยังไม่อยู่ใน cache scope
- browser UAT และ deploy: ทำเมื่อ user สั่ง

## Validation Baseline For Next Batch

```bash
npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/reference-master-cache.test.ts
npm run type-check --workspace @ns-scrap-erp/next -- --pretty false
git diff --check -- <batch-files>
```

## Immediate Next Steps

1. ตรวจ Vercel logs ของ `reference_cache_read`/`reference_cache_error` หลัง deploy เพื่อวัด `CACHE-M1`.
2. เปิด `CACHE-P2` เฉพาะเมื่อพบว่า product thumbnail delivery เป็น bottleneck จริง.
3. Keep direct master reads in transactional write validation, detail, import, and master-write routes out of cache migration unless their contract is separately designed.

## Working Tree Boundary

- worktree currently contains broad cache work and unrelated edits; do not commit, push, or promote without first separating the intended batch.
- current branch: `dev` against `new-origin/dev`; follow `docs/agent-rules/git-communication.md` before any mutation.
