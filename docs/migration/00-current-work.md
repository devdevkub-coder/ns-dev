# 00 Current Work

## Active WTI/WTO mobile layout follow-up — 2026-08-03

Objective: แก้ source chooser ของรูปภาพไม่ให้เหลือขอบขาวด้านข้างบนมือถือ และจัดช่อง `น้ำหนักรวม`, `หักภาชนะ`, `น้ำหนักหลังหักภาชนะ` ให้อยู่แถวเดียวกัน โดยไม่เปลี่ยนกล้อง/แกลเลอรี การอัปโหลด สูตรคำนวณ validation API DB หรือ storage contract.

Working state:

- Branch: `codex/weight-ticket-camera-gallery-20260803`
- Worktree: `C:\new-ns-scrap-erp-worktrees\weight-ticket-camera-gallery-20260803`
- Base and latest fetched SIT: `sit-origin/main` at `766bcfd36`; behind/ahead `0/0` before commit.
- Write areas: `WeightTicketAttachmentGrid`, `WeightTicketFormCore`, focused regression tests, WTI/WTO flow note และ daily-transactions tracker.
- Main workspace remains untouched because it contains unrelated dirty work.

Preserved decisions:

- กล้องหลังเลือกครั้งละหนึ่งรูป, gallery เลือกหลายรูป และ upload/preview/save contract เดิม.
- source chooser ยังใช้ transform-only slide 400ms ไม่มี opacity และจำกัด `max-w-lg` ตั้งแต่ breakpoint `sm` ขึ้นไป.
- ช่องน้ำหนักที่สามยังเป็นค่าคำนวณ read-only; สูตร หน่วย validation payload API DB และ storage ไม่เปลี่ยน.

Current proof:

- RED regression runs reproduced both prior layout defects.
- Focused attachment and product-entry suites pass `31/31`.
- Targeted ESLint passes; workspace lint passes with `0` errors and `10` existing warnings.
- Workspace type-check passes; SIT-env Webpack production build passes and generates `331/331` routes.
- `git diff --check`, conflict-marker scan และ sensitive/manifest diff scan pass.
- Dependency audit still reports existing advisories; this batch does not change package manifests or lockfiles.
- Fresh independent acceptance audit returned `ACCEPTED` after the active-handoff correction.

Immediate next tasks:

1. Commit the scoped batch, fetch/compare `sit-origin/main` again, integrate if it advanced, then push without force and verify the remote SHA.
2. Report Plane through REST only if an assigned issue mapping is confirmed; no issue mapping is currently known for this follow-up.
