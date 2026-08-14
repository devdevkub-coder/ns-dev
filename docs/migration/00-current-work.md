## WTI/WTO realtime preview request optimization — 2026-08-14

Active objective: ลดงานซ้ำระหว่างแท็บเมื่อมีการแก้ไข WTI/WTO พร้อมคงการอัปเดตรูปให้ถูกต้อง

ล่าสุด: realtime event มี `imageChanged`; การแก้ตัวเลข/ข้อมูลที่ไม่เปลี่ยนรูปจะโหลดเฉพาะ ticket หลัก ส่วนการเปลี่ยนหรือลบรูปจึงโหลด signed preview ใหม่ การลบเต๋าที่มีรูปยัง refresh preview เพื่อเอารูปออกจากแท็บอื่นได้ เพิ่มการส่งเฉพาะ line ที่เปลี่ยน และ coalesce event ที่เข้ามาภายใน 50ms; ข้อมูล ticket/สิ่งเจือปน apply ก่อน preview. PATCH ที่ใช้ collaboration baseline คง summary ID เดิมด้วย upsert ตาม ticket/product และลบเฉพาะ summary สินค้าที่หายไป. แก้ทุกจุด publish ของ WTI/WTO จาก fire-and-forget เป็น Next.js `after()` หลัง transaction เพื่อไม่ให้ Vercel ตัดงาน broadcast ก่อนส่ง event. Local follow-up ให้แถวสิ่งเจือปนใหม่เริ่มด้วยค่า impurity ว่างและ focus น้ำหนักหัก โดยไม่เปิด dropdown อัตโนมัติ; validation เดิมยังบล็อกการเพิ่มรายการถัดไปเมื่อแถวก่อนหน้าไม่ครบ

Validation: type-check, targeted ESLint, production build 338 pages, WTI/WTO calculation and collaboration tests 35/35, realtime/attachment/preview/rebuild tests 25/25 และ focused product-entry tests 49/49 ผ่าน พร้อม `git diff --check`; ปรับ source-contract expectation ให้ตรวจ contract ปัจจุบันแทนรูปแบบโค้ดเดิม

Remaining risk: ยังไม่ได้ทำ browser UAT และยังไม่ได้ push batch นี้ขึ้น SIT

Immediate next: code review แล้วค่อย commit/push เมื่อผู้ใช้สั่ง

## Print performance optimization batch 2 (A+B) — 2026-08-12

Active objective: prefetch ticket detail + preload attachment images ตอน hover ที่ `พิมพ์` menu item ของ WTI/WTO เพื่อให้คลิกแล้ว popup render ทันทีโดยไม่ต้องรอ fetch ticket + download รูป

Active batch:
- `print-asset-prefetch.ts` เพิ่ม `prefetchWeightTicketForPrint`, `peekCachedWeightTicketForPrint`, `preloadWeightTicketAttachmentImages`, `invalidateWeightTicketForPrintCache` (TTL 20s, in-flight dedup)
- `WeightTicketListPageClient.tsx` เพิ่ม `onMouseEnter`/`onFocus` prefetch ที่ menu item พิมพ์ (desktop + mobile), และ `handlePrintTicket` ใช้ cache ก่อน ถ้ามี cache hit ข้าม `getWeightTicket` fetch
- ข้าม C (document.write → innerHTML) เพราะ risk ไม่คุ้มผล — font-face/CSP edge cases

Validation: type-check, lint, 105/105 related tests ผ่าน

Remaining risk: native browser UAT ยังไม่ได้ทำ; prefetch ทำงานเฉพาะตอน user hover ก่อนคลิก (user ที่คลิกเลยจะใช้ path เดิม)

Immediate next: รอ user ตรวจ Code Review ก่อน commit; **จะไม่ push จนกว่า user บอก**

## Print performance optimization — 2026-08-12

Active objective: ลดเวลารอตอนกดปุ่มพิมพ์เอกสาร (popup preview ช้า) โดย prefetch font/logo/company-profile ตอน hover และ warm cache ไว้ และ batch signed URL generation ฝั่ง server เพื่อลด HTTP round-trip

Active batch:
- เพิ่ม `apps/next/src/lib/print-asset-prefetch.ts` (ใหม่) เป็น helper กลาง — `prefetchPrintFonts()` (idempotent ต่อ tab), `fetchCompanyProfileForPrint(branchId?)` (cache TTL 30s + in-flight dedup), `prefetchPrintAssets(branchId?)` (font + profile + logo preload ผ่าน `new Image()`)
- แก้ print module ทั้ง 9 ไฟล์ให้ใช้ `fetchCompanyProfileForPrint` แทน `fetch('/api/admin/company-profile')` ตรง ๆ และลบ `companyProfilePayloadSchema` ที่ซ้ำกันออก (schema canonical อยู่ใน helper)
- `WeightTicketListPageClient` prefetch font ตอน mount + warm profile ขนานกับ ticket fetch ใน `handlePrintTicket`
- `SalesBillPrintButton`/`PurchaseBillPrintButton` เพิ่ม `onMouseEnter`/`onFocus` prefetch
- `weight-ticket-storage.ts` batch signed URLs ทั้งหมดผ่าน `createSignedUrls` 1 ครั้ง แทน N ครั้งของ `createSignedUrl` (fallback ทีละรูปเฉพาะตอน batch miss)

Validation: type-check (with `NODE_OPTIONS=--max-old-space-size=4096`), lint, และ related tests ผ่าน — `weight-ticket-storage.test.ts` 13/13, `weight-ticket-print.test.ts` 30/30, `corporate-print-layout.test.ts` 11/11, `document-print-contract.test.ts` 51/51, `purchase-bill-print.test.ts` 25/25, `weight-tickets/[id]/images/preview/route.test.ts` 1/1

Remaining risk: ไม่มีการแก้ contract ใด ๆ — visual output เหมือนเดิม 100%, แค่ latency ลดลง. Native browser UAT ยังไม่ได้ทำในรอบนี้ (ตามคำสั่งให้แก้ code อย่างเดียว)

Immediate next: commit + push `sit-origin/main`

## Active WTI/WTO image upload checkpoint — 2026-08-10

Objective: upload private original images without browser resize, let WTI/WTO save wait only for durable original uploads, and generate high-quality thumbnails asynchronously on the server. Active code adds a durable image-asset/job ledger, explicit `system_settings` for upload/thumbnail limits, Sharp Lanczos3/WebP processing with decoded-pixel protection, ownership binding during ticket save, and detail/form polling that progressively reveals ready thumbnails without falling back to original images. File selection now renders a local `blob:` thumbnail immediately while the durable upload is in flight, then keeps the server reference for save. SIT migration `20260810160000_add_weight_ticket_image_processing_jobs.sql` is applied and postflight found 204 ready assets with no missing originals or thumbnails. The asset ledger indexes thumbnail keys instead of enforcing uniqueness because historical references legitimately reuse a thumbnail object. Focused upload/thumbnail tests, lint, type-check and `git diff --check` pass; build and deployment smoke remain before push/promotion.

## Latest payment timeline/action checkpoint — 2026-08-09

PB Timeline now reads PMT payment date plus the paying company bank/account from persisted PMT snapshots and legacy payment allocation facts; it no longer presents Voucher UUID as the primary user-facing detail. Runtime list pages use the shared ellipsis/dropdown contract on Desktop and labelled `จัดการ` on Mobile; cancelled rows have no action trigger, while editable detail modals expose the same permitted edit/cancel commands. PMT History remains read-only by business rule. Focused action/payment tests, lint, type-check, build (337 static pages), and `git diff --check` pass. Browser UAT was not run because this request asked for code changes only.

## Current objective — Corporate print/PDF standardization — 2026-08-08

Active corporate print follow-up: keep every formal business document on the PB A4 standard. PB retains its two-pass `194 × 281 มม.` measurement, REMARK splitting, 15-row ceiling and 30 มม. signature zone; the shared `corporate-print-layout` now measures and redistributes complete rows for ADV, EXP, PMA, POB, POS, RV, SB, PMT/RCP vouchers, and WTI/WTO form pages. Attachment albums and daily PMT/RCP reports keep their dedicated contracts. Print buttons stay disabled until layout and overflow checks complete; API, DB, Storage, Cache and business calculations are unchanged. Focused tests, lint, type-check and production build are passing; native browser print preview remains the only unverified evidence because this environment has no Chromium distribution.

Latest PB unit-display correction: equivalent kilogram labels are normalized to `กก.` at the detail and print presentation boundaries. PB print now keeps numeric quantity and `หน่วย` in separate table cells (including the final multi-unit totals), while numbered REMARK text is shown as separate lines and unit words inside REMARK are normalized too. True non-weight units such as `ลัง` remain separate; the detail trace label uses `รายการ` instead of `lot`; no persisted snapshot or business calculation changes.

Latest visible PB detail correction: product-summary and allocation tables now also keep numeric quantity and `หน่วย` in separate columns, with empty-state `colSpan` values updated for the added column. This closes the remaining UI mismatch that made the change look like a font-only update.

Apply the accepted A4 preview and unlimited-pagination contract to every formal business document, not only WTI/WTO. The active uncommitted batch covers POB, PB, SB, PO Sell, ADV, RV, PMT, RCP, WTI/WTO, PMA and EXP while preserving document snapshots, cancellation marks, permissions and read-only printing.

Latest gap closed: PMA and EXP now use 15 table rows per page, repeat header/document metadata, keep a blank table footer plus two titled placeholder panels and continuation text on pages `1..N-1`, and show real totals/notes/signatures only on page `N`. PMA group-total rows count toward the 15-row physical table capacity.

WTI/WTO continuation follow-up: the three reserved summary panels on pages `1..N-1` now keep the titles `สรุปตามหมวดสินค้า`, `หมายเหตุ`, `ข้อมูลน้ำหนัก / Weight Info` with `-` placeholders in both browser print HTML and React-PDF; real totals, business notes and signatures remain final-page-only.

Latest layout correction: keep the signature block anchored at the original bottom position (`margin-top: auto`). Browser WTI/WTO Preview/Print distributes every table row slot evenly across its page capacity, so data rows and blank rows stay proportionate instead of a populated row absorbing all remaining height; long rows still reflow before the footer moves. React-PDF mirrors the same rule: the table container grows with `flexGrow` to fill the page and the empty rows inside share that space equally, so twenty cells fit on one A4 form page.

Latest browser-print color correction: `purchase-bill-print.ts` now applies `print-color-adjust: exact` (and the WebKit equivalent) to preserve the accent gradient, table total fills, and final-total color when the document is printed; screen preview styling remains unchanged.

Latest RV preview/print correction (2026-08-11): `receipt-voucher-print.ts` now declares the same A4 `210 × 297 mm` screen page and `194 × 281 mm` print content box as the shared corporate layout, while the shared layout applies `print-color-adjust: exact` to corporate pages and descendants. The top accent bar is non-shrinking so the flex page cannot collapse it when the table/footer consumes available height. This fixes the reported RV preview/print drift in page width, table/summary background colors, and missing top accent without changing snapshot, signer, payment, or posting contracts. Focused RV/corporate layout tests pass; native Chromium print output remains the only unverified evidence in this environment.

Latest shared reflow correction: when a full source page has no empty-row prototype, `corporate-print-layout` synthesizes a presentation-only empty row from the existing table structure before redistributing rows, so every measured continuation page can still fill available space consistently with PB.

Latest WTI/WTO 20-row capacity correction (2026-08-11): WTI/WTO form pages use a 20-row logical ceiling with conservative height-aware row budgeting; a long row moves intact rather than overflowing or disappearing. Browser print reflows after the Thai font/logo load and fails closed on A4 overflow. React-PDF shares the ordered source-row plan and uses dense styling only above 14 items. The 31-row WTI and WTO fixtures now render as two form pages without a continuation-only PDF page; attachment albums stay separate. The 20-cell form also uncovered a React-PDF quirk: a unitless `lineHeight` on the page resolves once (12.4pt) and is inherited by every Text, so the tiny filler cells had to set their own explicit `lineHeight` to avoid twenty 12.4pt-tall empty rows overflowing A4.

Latest WTI/WTO fixed 20-cell form (2026-08-11): the table now always renders the full 20-row grid on every page, including the final page that carries totals, the three summary panels, and signatures; short tickets fill the unused slots with empty rows. The final page uses the same 20-unit height budget, so up to twenty short rows fit on one A4 form and 21+ rows spill to a continuation page; a row that does not fit moves to the next page as a whole row. The former WTI 12 / WTO 14 final-page reserve is removed; dense styling still applies above 14 items.

All other formal multi-page print templates now follow the same non-empty continuation rule: POB, PB, SB, PO Sell use `สรุปตามหมวดสินค้า` + `หมายเหตุ`; ADV, EXP, PMA use a document-specific summary title + `หมายเหตุ`; RV/RCP use `รายละเอียดการรับเงิน` + `หมายเหตุ`; PMT uses `รายละเอียดการจ่ายเงิน` + `หมายเหตุ`. No active continuation template uses an empty reserved panel.

Validation checkpoint after the WTI/WTO capacity correction: focused `weight-ticket-print.test.ts` and `corporate-print-layout.test.ts` pass `40/40`, covering 0/1/15/16/20/21/30/31 rows, long-row movement, long-name/no-impurity dense-height parity, a continuation-to-empty-final handoff when the final reserve cannot fit a row, a single-final-page DOM reflow that preserves the three-panel `.bottom-grid`, 31-row WTI/WTO HTML/React-PDF page alignment, visible no-impurity detail in dense 20-row mode, and attachment pagination. Full Next lint, type-check, production build (338 static pages), and `git diff --check` pass. The Windows package `build` script still uses Unix `NODE_OPTIONS=...` syntax, so the equivalent PowerShell command was used for the successful build; no package-script change is included in this batch. Local Codex Browser opens both WTI/WTO lists and their `พิมพ์` actions with no page-console error, but the native print popup is not exposed to this runner, so browser HTML overflow remains documented as unverified.

Full Vitest was also run: print/PDF suites remain green; the workspace still has 15 unrelated failures in form-action, reference-cache, gallery, WTO collaboration, finance-route and table-action contracts. Those files are outside this print/PDF batch and were left untouched.

Delivery checkpoint: fetched `sit-origin/main` at `85f545c4` with ahead/behind `0/0`; the active local line is ready for the user-requested delivery step, with unrelated dirty/untracked files preserved. No push/deploy was performed in this task.

## Current objective — WTI/WTO Production baseline — 2026-08-07

Restore the WTI/WTO runtime to the locally cached `production-origin/main` commit `0e15be424a208f4dbdf43d0422b4723653af6efa`, then apply collaboration changes incrementally instead of carrying the whole experimental SIT redesign forward.

Active batch: the WTI/WTO API, form, section helpers, server write handlers, focused section tests, and flow note match that Production ref. The previous uncommitted collaboration work is preserved in `stash@{0}` (`wip-wti-wto-realtime-before-production-baseline-20260807`) for selective reference only. `ProfitCostAnalysisPageClient.tsx` is unrelated local work and must remain untouched. No database migration is part of this rollback.

Validation: focused WTI/WTO tests `55/55`, targeted lint, generated route types, TypeScript, full production build, and `git diff --check` pass. Independent review result is `COMMENT/WATCH`: the files match the cached Production ref, but this baseline must not be described as final multi-user concurrency safety because it removes SIT's WTO stock-bucket advisory lock and does not yet provide the full target line-level conflict contract. Live Vercel Production SHA is still unverified because the available Vercel connector and Git credential do not currently authorize the Production project/repository.

Immediate next task: add only the agreed minimal flow changes such as removing the per-product/per-lot save controls and defining server-persisted add boundaries without reapplying the full stash. Restore sorted WTO stock-bucket locking before shipping concurrent WTO edit/confirm work, then implement and validate line-level conflict handling incrementally with two authenticated sessions.

## Authentication objective — 2026-08-07

Reduce `/api/auth/me` latency by removing duplicate proxy RPC work and repeated AppShell requests while keeping verified session checks and private no-store responses.

Active batch: bypass proxy RPC only for `/api/auth/me`, load auth context once per AppShell session, remove unverified `getSession()` fallback, then focused auth tests and lint/type-check review before any SIT push.

# WTI/WTO Storage Visibility Boundary — 2026-08-06

Objective: แยก source evidence ของ WTI/WTO ออกจาก outbound artifact ให้ชัดเจน: รูปหลักฐานเก็บใน `WEIGHT_TICKET_IMAGE_BUCKET` แบบ private และ PDF/ภาพอัลบั้มที่สร้างเพื่อส่งต่อเก็บใน `WEIGHT_TICKET_PDF_BUCKET` แบบ public.

Active batch: harden upload, read/preview, browser print, ZIP download, PDF/LINE generation, canonical image references และ migration/backfill scripts. Runtime ไม่รับ data URL, URL-only, filename-only หรือ bucket ผิดเป็น write path อีกต่อไป; signed URL สร้างใหม่เฉพาะ response/preview/print/PDF/LINE.

Status: โค้ด bucket split และ stock-transfer permission migration อยู่บน SIT/Production commit เดียวกัน `7be59207`. ตรวจ live schema แล้วทั้งสอง environment มี migration `20260806120000` และ `20260806130000` ครบ; bucket รูปหลักฐานเป็น private และ PDF เป็น public ตาม contract. ย้ายรูปหลักฐานจาก `weight-ticket-pdfs` ไป `weight-ticket-images` ครบ 153 references โดยไม่ลบต้นฉบับ; audit หลังย้ายผ่านและไม่พบ missing/orphaned reference.

Required rollout gate: ตรวจ bucket จริงราย environment ให้ image private/PDF public, รัน dry-run แล้วจึง apply migration/backfill ด้วย manifest ภายนอก, audit legacy/filename-only references ให้หมด และค่อย deploy runtime. SIT และ Production ผ่าน schema gate แล้ว; ห้ามลบ source object อัตโนมัติ.

Immediate next task: ตรวจ runtime deployment ให้ใช้ migration/config ล่าสุด แล้ว retry โหลด detail และส่ง LINE ของ WTI/WTO; Git promotion เสร็จแล้ว แต่ deployment/runtime smoke ยังต้องยืนยันแยกจาก Git.

# LINE Notification Reliability — 2026-08-05

Objective: ทำให้ Connection/Webhook, Targets, Routing, Test Send, Queue/Retry และเอกสาร WTI/WTO/PB/SB/PMT/RCP ใช้ contract เดียวกันและรายงานผลตรงกับ LINE จริง

Active batch: แก้ trusted WTI/WTO queue lookup, branch-scoped admin test send, permanent/transient HTTP classification, accepted 409 retry response, shared-worker fail-closed เมื่อไม่มี LINE request ID และ timeout 10 วินาทีของ LINE transports; เพิ่ม focused tests และบันทึก flow ใน `docs/notes/LINE Notification Control Center Ultimate Plan.md`

Expected write areas: LINE server services/routes, focused tests และ LINE flow note เท่านั้น; ห้าม stage local logs/reports/config หรือทับ Dual Costing commit ที่อยู่ก่อนหน้า

Required validation: focused Vitest, full lint, type-check, production build, `git diff --check`, independent acceptance audit, fresh `sit-origin/main` integration, deploy SHA verification และ Codex Browser runtime checks หลัง deploy

Immediate next task: รัน full validation, ตรวจ intended diff, fetch/integrate SIT, commit/push/deploy แล้ว retry job จริงและทดสอบ target send; automatic frequent retry ยังต้องใช้ Vercel Pro หรือ external scheduler เพราะ SIT อยู่ Hobby plan

Latest connection UX checkpoint 2026-08-06: แท็บ `การเชื่อมต่อ` แสดงผลสำเร็จ/ผิดพลาดเหนือปุ่มที่ผู้ใช้เพิ่งกดแทน alert ส่วนบนของหน้า และเก็บผล async ไว้กับแท็บนี้แม้ผู้ใช้สลับแท็บระหว่างรอ; ปุ่ม Token/บันทึก/Webhook เป็น grid ขนาดคงที่และใช้ spinner โดยไม่เปลี่ยนข้อความ; สถานะสภาพแวดล้อม, Token, Secret และ Webhook อยู่ใน surface เดียว แบ่งเป็น 4 ช่อง responsive ด้วยเส้นคั่นบาง โดยเอาการ์ดพื้นหลังชั้นนอกและการ์ดย่อยซ้อนออกแล้ว. ไม่เปลี่ยน API, credential, permission หรือการส่ง LINE จริง. Focused connection/API tests `12/12`, targeted ESLint และ workspace type-check ผ่านหลัง regenerate route types.

# Dual Costing Allocation Ledger Audit — 2026-08-05

## Active implementation batch

- ปรับ `/dual-costing/cost-allocation-ledger` ให้เป็นหน้าตรวจสอบรายการจัดสรรที่อ่านจาก API แบบแบ่งหน้าตามกลุ่ม `matchId` โดยไม่ตัดรายละเอียดของ Match เดียวกันข้ามหน้า
- API รองรับ `page`, `pageSize` (`10/25`), `sortBy`, `sortDir`, ส่ง `pagination` metadata และคงการส่งออก Excel ตามผลลัพธ์ทั้งหมดของตัวกรอง ไม่จำกัดเฉพาะหน้าปัจจุบัน
- UI desktop/mobile ใช้คำว่า `รายการ`, แสดงหน่วย `กก.`/`บาท`, ใช้ตาราง/รายละเอียดที่สอดคล้องกับ design baseline, แสดงสถานะ reversed ด้วยพื้นหลัง/ขอบแทนการลด opacity และไม่แสดงค่า `mixed` ดิบ
- ปรับชื่อผู้ใช้ให้เป็น `สมุดรายวันจัดสรรต้นทุน` ใน sidebar, workflow, related link, filter และข้อความ API ที่เกี่ยวข้อง

Latest Plane Issue #195 checkpoint (2026-08-07):
- ปรับปรุงตารางหลักในหน้าสมุดรายวันจัดสรรต้นทุน: เปลี่ยน `วันที่บันทึก` ➔ `วันที่ตามเอกสาร`, เพิ่มคอลัมน์ `ผู้ซื้อ` (`customerName`) และ `ผู้บันทึกข้อมูล` (`allocatedBy`), ตัดคอลัมน์ `กลุ่มต้นทุน` ออกจากตารางหลัก.
- ปรับปรุงตารางย่อย (Row Expansion) และ Modal รายละเอียด (`LedgerMatchedCostDetails`): แสดงผล `ชื่อผู้ขาย` (`supplierName`) ของล๊อตต้นทุนนั้นๆ สั้นกระชับ สอดคล้องกับมาตรฐาน UI.
- อัปเดต Excel export ให้ครอบคลุมคอลัมน์ `Customer` และ `Supplier`.
- Verified 0 type-check errors, 16/16 Vitest tests passed. Pushed commit `ec1d1818` to `sit-origin/main` and updated Plane Issue #195 to `wait for test` with full Thai completion summary comment.

Expected write areas: API ledger/reverse, Allocation Ledger client, shared naming/navigation, targeted tests และ flow note ของหน้า

Required validation: focused Vitest, full lint, type-check, production build และ `git diff --check`; browser UAT ยังไม่ทำเพราะผู้ใช้ยังไม่ได้สั่งทดสอบและ session ใน Codex Browser อยู่หน้า login

Immediate next task: ตรวจ final diff/ไฟล์ที่ stage, fetch `sit-origin/main` ก่อน commit หรือ push และรายงานสถานะ deploy แยกจาก Git หากมีคำสั่ง promote

# Department Role Access Boundary — 2026-08-04

## Active implementation batch

- ตรวจและจำกัด `sorting_department` / `production_department` บน SIT ให้เห็นและทำเฉพาะ WTI/WTO และงาน production ของฝ่ายผลิตตาม permission action.
- ห้ามทั้งสอง role เปิดบิลจาก WTI/WTO (`daily.weight_tickets.open_bill`) หรือเข้าถึง/สร้าง/แก้ Purchase Bill และ Sales Bill.
- ถอน `stock.ledger.view` จากทั้งสอง role; `GET /api/production/orders/product-stock` ใช้ `production.orders.view` ที่ central proxy และยังคง route guard แบบ OR เพื่อรองรับ warehouse.
- บังคับ production role ให้มี dashboard landing grant และตรวจ action ยกเลิกผลผลิตด้วย `production.orders.reverse`.
- ไม่เขียนทับ direct user overrides; SIT preflight พบ forbidden override ของสอง role เป็นศูนย์. ไม่ใช้ Super Admin และไม่แตะ Production.
- Local focused permission/API tests ผ่าน `15/15`; lint, type-check, webpack production build และ `git diff --check` ผ่าน. Migration postflight ผ่าน `forbidden_role_grants=0`, `forbidden_user_overrides=0`, history `20260804140000` ครบ.
- Code push ไป `sit-origin/main` ที่ `991d1349` และ Vercel SIT deployment `dpl_DiLtdiCAUvnmyr42gM4gMZnf3yun` ขึ้น READY แล้ว. Browser run ถูก discard เพราะ session ที่ได้เป็น `system_admin`/`isAdmin=true`; local env ไม่มี credential non-admin ที่ยืนยันได้แยกสำหรับสอง role.

Expected write areas: navigation/API tests, production output reverse guard, role-scope migration, and the related WTI/production flow notes.

Required validation: focused positive/negative UI permission contracts, API guard tests, workspace lint/type-check/build, `git diff --check`, SIT migration postflight, and SIT browser smoke with non-admin department accounts.

Immediate next task: ขอ/เปิด session SIT ของ `sorting_department` และ `production_department` ที่ไม่ใช่ Super Admin แล้ว rerun browser UI/API matrix; ห้ามสร้างหรือบันทึก password ใน repo.

# Coordinator Page/API Permission Alignment — 2026-08-04

## Active implementation batch

- Align the coordinator role and dependent APIs on the current SIT baseline.
- Fix the product-type/product-unit read API to use each page's specific view permission.
- Map the shared Thai-address lookup API to the customer/supplier page permissions instead of the broad reference fallback.
- Require `master.customers.update` when the customer form saves an existing record; keep create and update actions separate.
- Grant coordinator export permissions for customers, products, and suppliers only.
- Enforce `daily.weight_tickets.open_bill` at WTI/WTO bill-creation APIs and gate generic master-data write controls by the same page/action permissions used by the routes.
- Keep the change focused on the coordinator's visible operational menus. Grant WTI/WTO `open_bill` and visible salesperson/product-type/product-unit actions resource-by-resource; do not grant hidden finance/payment/approval or broad shared-reference access.
- Branch scope remains `all` until coordinator users receive deliberate branch assignments; current users have no branch-access rows.
- Code changes now map product-type/product-unit writes to resource-scoped action permissions instead of `master.reference.manage`.
- SIT migration applied/recorded: `20260804150000_grant_coordinator_visible_menu_actions.sql`. Postflight confirms the ten new coordinator grants and keeps both shared-reference permissions absent.
- Coordinator browser/API rerun used `watcharathat@9stepsdigital.com` (`coordinator`, `isAdmin=false`) on SIT. Auth 200, 59 permissions, no `master.reference.view`; 22 read APIs and 6 `?format=xlsx` exports returned 2xx with XLSX content. Valid master import, CRUD/status, WTI, PO Buy/Sell, purchase bill, sales bill, and stock fixtures passed in the same coordinator session; the LINE share action remains blocked only because SIT has no routed notification target.
- Sales STOCK now normalizes an omitted optional `deliveryTicketDocNo` to the selected WTO document in commit `7cb1cdbf`; local lint, type-check, and diff check pass. The SIT GitHub `main` ref is at that commit, but the SIT deployment status still points to `faaa7d7d`, so the omitted-field runtime regression must be rerun after the new deployment before this batch is accepted.

Objective: ให้ role `coordinator` ใช้ทุกเมนูที่เปิดไว้ได้จริง โดยไม่เพิ่ม `master.reference.view` ที่จะเปิดเมนูสาขา/คลังเกินขอบเขต.

Active batch: แก้ API อ่านประเภทสินค้า/หน่วยสินค้าและ Thai address lookup ให้ตรงกับ permission เฉพาะหน้า, บังคับ open-bill API boundary, และซ่อน action ของ master-data ที่ role ไม่มีสิทธิ์; ทุกสาขายังคงเป็น scope ที่ถูกต้องตามการตั้งค่าปัจจุบัน.

Validation: focused permission tests, lint, type-check, build, `git diff --check`, SIT role postflight, and a fresh coordinator browser auth/API probe are required after this batch. The first DOM probe hit a Vercel Security Checkpoint after high request volume; do not classify that checkpoint as an app permission result.

Immediate next task: verify SIT deployment of `7cb1cdbf`, then rerun Sales STOCK create/update/cancel without `deliveryTicketDocNo`; record PASS/FAIL in the coordinator flow note. Do not use a broad permission as a workaround and do not promote or test against Production.

# Vercel UAT Deployment Dependency Fix 2026-08-02

Objective: ให้ Vercel project ใหม่ที่ deploy branch `uat` ของ `nserprich99-creator/ns-erp` resolve dependency ของ Next workspace ได้เหมือน local.

Checkpoint: `vitest` ถูกประกาศใน `apps/next` โดยตรงและ lockfile ถูกอัปเดต; workspace lint, type-check, production build และ `git diff --check` ผ่าน. ยังไม่ได้ push fix ขึ้น `uat` จนกว่าจะตรวจ diff และยืนยัน target remote.

Immediate next task: commit และ push เฉพาะ `uat-origin/uat` เพื่อให้ Vercel redeploy; `main` ไม่เปลี่ยนใน batch นี้.

# Foreign Receipt Settlement FX Follow-up 2026-07-31

Objective: ให้ foreign SB receipt คำนวณ cash applied/AR settlement/FX gain จาก facts ที่ persist แล้ว, แยก FX fact ตามสาขา และคง THB consumer เดิมโดยไม่สร้าง GL, fallback หรือ hardcode.

Checkpoint: `FCD-RCP-FX-07` ถึง `FCD-RCP-FX-16` เสร็จแล้ว. Migration `20260731160000_enforce_foreign_ar_settlement_fx_fact.sql` applied และ recorded บน production: เพิ่ม `fx_gain_loss.branch_id`, positive AR-settlement FX fact หนึ่งครั้งต่อ RCP, และ deferred reconciliation `cash applied + FX gain = Settlement THB`. Server, receipt detail, FX report และ P&L ใช้ persisted snapshot เดียวกัน; cancel append reversal fact พร้อมคืน AR/FCD/BST ใน transaction เดียว. ไม่มีการแก้ Sales Bill currency, CADV, AP, conversion, revaluation หรือเพิ่ม GL.

Validation: focused unit/consumer/P&L tests `33/33`, production write integration `2/2`, lint, type-check, build และ `git diff --check` ผ่าน. Browser UAT และ SIT promotion ยังไม่ได้ทำใน batch นี้.

Immediate next task: review/commit batch นี้; promote code และ apply migration บน SIT หรือทำ browser UAT เฉพาะเมื่อได้รับคำสั่งแยก.

# Active FCD Foreign Receipt Batch 2026-07-30

Objective: เพิ่ม foreign receipt/FCD โดยใช้ native currency เป็น subledger และ book amount เป็นยอดหลัก โดยไม่มี fallback หรือ hardcode สกุลเงิน/rate/account mapping.

Active batch: `finance_currency_policies` เป็น source of truth แบบ singleton สำหรับ functional currency และตั้งค่า `THB` จาก Currency Master แล้วทั้ง production/SIT. Runtime reader fail closed หากไม่มีหรือมีเกินหนึ่ง policy row. Receipt จะใช้ rate จาก API ตามวันรับเงิน, อนุญาตกรอก/แก้เอง และบันทึก snapshot ที่ใช้จริงโดยไม่มี latest-rate fallback. ยอด native/book และ FX rate ของ Customer Receipt คำนวณและแสดง 2 ตำแหน่ง. FCD OD ใช้วงเงินต่อบัญชี. Carrying rate ใช้ moving weighted average ต่อ account+currency. เพื่อรักษา compatibility ของรายงานเดิม foreign receipt จะเขียนยอด THB ที่คำนวณแล้วลง `bank_statement.amount_in/out` และ mirror กับ `book_amount_*`; native/rate อยู่เฉพาะ FCD subledger/audit ไม่ย้าย reader เดิมไปอ่าน `book_amount_*`.

Blockers: ไม่มี blocker ของ FCD UAT แล้ว. `ACC01-002` ถูกตรวจยืนยันแล้วทั้ง Dev/SIT ว่าเป็น active FCD bank account และรองรับ `THB` กับ `USD`; account reference cache ถูก invalidate แล้วเมื่อ 2026-07-31. SIT browser/API lifecycle UAT ผ่านครบ: foreign receipt -> revaluation -> conversion -> reverse conversion/revaluation -> cancel receipt; ยอดสุดท้ายกลับเป็น `0 USD / 0 THB` และเหลือเฉพาะ append-only reversal history. ห้ามใช้ account currency, `THB` หรือ `USD` เป็น fallback ใน runtime. GL journal, chart-of-account mapping และ GL reconciliation ไม่อยู่ใน active FCD scope: ระบบปัจจุบันไม่มี GL posting engine และยังไม่มี requirement ให้สร้าง.

Write areas: FCD schema/ledger migration, money/rate/posting services, Customer Receipt API/UI, Bank Statement/Cash Position readers, FCD conversion/revaluation and their reconciliation/tests.

Validation: policy migration plus FCD contract migration `20260730120000_add_fcd_transaction_ledger_contract.sql` applied/recorded in production and SIT. Migrations `20260730130000_persist_customer_receipt_fx_rate_type.sql`, `20260730140000_enforce_canonical_bank_statement_facts.sql`, `20260730150000_lock_fcd_posted_revaluation_periods.sql`, `20260730160000_enforce_foreign_customer_receipt_contract.sql` and `20260730170000_allow_foreign_customer_advance_receipts.sql` are also applied/recorded in Dev/SIT. The period lock blocks receipt/conversion ledger events dated on or before an active posted revaluation for the same account+currency; the revaluation/reversal events themselves remain append-only exceptions. Deferred receipt/split guards require foreign RCP to reconcile settlement/carrying/bank fee/allocation values, require each split to link matching FCD/BST facts, and reject mixed SB/CADV allocation. Migration 170 extends that contract to CADV: its settlement THB must reconcile exactly to CADV allocation, without AR settlement FX or automatic overpayment. Dev/SIT preflight was zero invalid rows; no transaction was backfilled. Prisma generate, targeted lint/type-check, `git diff --check`, focused FCD tests `31/31`, and focused receipt tests `13/13` passed before the current UI/read-model follow-up.

Immediate next task: ทุก task ที่ทำได้ถูกปิดและ promote Dev/SIT แล้ว; `FCD-908` browser/API UAT ปิดแล้วเมื่อ 2026-07-31. หากต้องการ promote customer UAT ต้องมีคำสั่งแยก. GL posting tasks ถูกปิดออกจาก FCD scope เพราะระบบไม่มี GL engine และไม่มี requirement แยก. `FCD-903` service integration ครอบคลุม THB receipt/cancel, foreign partial/multiple bills, Bank Fee, settlement FX และ foreign cancel. Multi-bill customer receipt ใช้ named 30-second interactive transaction option เพื่อให้การเขียน RCP/BST/FCD/allocation อยู่ใน transaction เดียวโดยไม่หมด default 5 seconds. Migration `20260730220000_allow_cancelled_foreign_receipt_contract.sql` ทำให้ deferred guard ตรวจ reconciliation เฉพาะ receipt ที่ active; cancellation ยังคง append reversal และเก็บ allocation history เป็น cancelled. `FCD-904` ยืนยัน concurrent conversion บน Dev/SIT แล้ว: OD สูงไม่ถูกนำมาแทน native FCD balance และ cleanup เป็นศูนย์. `FCD-905` ยืนยัน lifecycle receipt -> revaluation -> conversion -> reversals แล้วทั้ง Dev/SIT. Migration `20260730210000_fix_foreign_receipt_split_statement_currency.sql` แก้ deferred foreign-receipt split trigger ให้ใช้ `bank_statement.movement_currency_code` ตาม schema จริง; ก่อนแก้ trigger นี้ foreign receipt จะ commit ไม่ได้. `FCD-113` applied/recorded ใน Dev/SIT แล้ว: Account Master ไม่มี currency opening balance และยอดคงเหลือเริ่มจาก Bank Statement/FCD ledger ที่ post เท่านั้น. RCP history/print/LINE ใช้ named THB book amounts; native currency/rate อยู่เฉพาะ foreign audit snapshot. Cash Position อ่าน THB ที่ persist แล้วเท่านั้น; FCD native เป็น projection แยก account+currency ไม่รวมเข้ากับ THB. `/sales/receipts` รองรับ foreign ทั้ง SB และ CADV โดยดึง rate ตามวันรับเงินและอนุญาตให้แก้ rate ในช่องเดิม, ใช้ FCD split ที่รองรับ currency และแยก Bank Fee จาก settlement FX. Conversion/revaluation ใช้ append-only reversal และ internal transfer classification เดียวกัน. FX report drilldown เปิด FCD conversion/revaluation ตามเลขเอกสาร และเปิด FCD ledger ตาม account+currency+entry ที่ persist; FX rowเก่าเปิด Bank Statement ต้นทางเท่านั้น.

# Active Dev/SIT Transaction Reset Checkpoint 2026-07-29

Objective: ลบข้อมูล transaction และ derived transaction data ทั้งหมดบน Dev และ SIT เพื่อเริ่มทดสอบ flow code ใหม่ โดยคง master data, auth/permission, settings และ migration history ไว้.

Completed: truncate แบบ transactional ของ transaction tables 79 ตารางใน Dev และ SIT สำเร็จ; postflight ทุกตารางเป้าหมายเป็น 0 แถว. Accounts 12, products 236, branches 2 และ migration history ยังคงอยู่ครบทั้งสอง environment. Dev มี app users 27 ราย, SIT มี 24 ราย.

Immediate next task: ตรวจ SIT runtime smoke หลัง reset แล้วเริ่มสร้าง transaction ใหม่ตาม flow ที่ไม่มี fallback.

## Super Admin Authorization Checkpoint 2026-07-29

`system_admin` is now the Super Admin role. The application authorization context treats it as an admin bypass, and migration `20260729100000_promote_system_admin_to_super_admin.sql` updates the role label/flags and backfills every active permission grant in Dev and SIT. Postflight confirms `system_admin = Super Admin`, 122 active permission grants, and `daily.weight_tickets.open_bill` present in both environments. No transaction data changed.

WTI open-bill handoff fix 2026-07-29: `/purchase/bills?new=1&wti=...` now loads purchase options before resolving the WTI source. Previously the auto-open effect searched the still-empty client option state and showed a false `ไม่พบ WTI` error even when the SIT WTI was `received`, had product summaries, and had no active allocation. What is what: the list button only creates the deep link; the purchase page owns source preload. Why it has to be like this: preload must finish before source lookup so the handoff uses the same option contract as manual WTI selection.

---

# Active Production PO Event Identity Batch 2026-07-29

Objective: ทำให้ `PO` เป็นเลขเอกสารการผลิตเพียงตัวเดียว โดย PO ต้องมีรหัสสาขา; input/output/return/void เป็น event ภายใน PO และรอบรับผลผลิตแสดงเป็น `PO.../01`, `PO.../02` โดยไม่มีเลข `PI`, `PO2`, `PI-REV`, `PO2-REV` และไม่มี fallback.

Plan: `docs/superpowers/plans/2026-07-28-production-event-identity.md`. Batch 1 เพิ่ม contract helper และ unit test ผ่าน `6/6`; Batch 2-4 ปรับ schema/write path/API/UI/ledger reference แล้ว.

Write areas: `apps/next/src/lib/server/production-orders.ts`, production API/UI/report/reconciliation, Prisma schema/migration, stock ledger contracts, production flow notes. ไม่ backfill ข้อมูลเก่า.

Validation: focused production tests `25/25`, full lint `0 errors/6 warnings`, type-check, production build และ `git diff --check` ผ่าน. Full Vitest ยังมี 37 failures จาก 12 suites และต้อง triage ก่อนปิด batch.

Environment/migration checkpoint: แก้ env ให้เหลือชุด canonical ใน `apps/next/.env.local`, `apps/next/.env.sit.local`, `apps/next/.env.uat.local`; ลบ root `.env.local` และ `apps/next/.env` ที่ซ้ำ/เก่า. Migration `20260728110000_add_production_event_identity.sql` apply และ record ใน Dev/SIT/UAT แล้ว; postflight ผ่าน 3 columns, 3 indexes และ 1 migration-history row ต่อ environment.

Git checkpoint: commit `0a0d7a24` ถูก push ไป `new-origin/dev` และ `sit-origin/main` แล้ว; worktree สะอาด. Customer UAT ยังไม่ได้รับ code promotion.

Immediate next tasks after reset: (1) verify deployed SIT runtime and production flow smoke, (2) triage/fix or explicitly classify the 37 full-test failures, (3) re-run full validation, and (4) promote code to customer UAT only after SIT sign-off.

# Active Strict Branch-Coded ADV Batch 2026-07-28

Objective: เอา fallback `00` ออกจากเลข ADV และบังคับใช้รหัสสาขาที่ active เท่านั้น.

Checkpoint: `nextAdvanceDocNo` reject เมื่อ branch code ไม่มี/ผิดรูปแบบ; ไม่มี migration เพิ่มเพราะ `supplier_advance_payments.branch_id` เป็น required อยู่แล้ว. Type-check, lint และ `git diff --check` ต้องผ่านหลังแก้.

# Active Branch-Coded Payment Approval Batch 2026-07-28

Objective: เพิ่ม `branch_id` ใน PMA, ออกเลข `PMA<branch><YYMM>-####`, และกรองตาราง PMA ด้วยสาขาของ PMA โดยตรง โดยไม่ใช้ fallback.

Checkpoint: migration `20260728100000_add_branch_to_payment_approvals.sql` apply/record ใน production กับ SIT แล้ว. แก้ PMA ทุก source และ petty-advance return ให้บังคับสาขา; type-check, lint และ `git diff --check` ผ่าน. ยังไม่ได้ทำ browser UAT หรือ push code.

# Active Branch-Coded Document Flow Batch 2026-07-28

Objective: เพิ่มเลขสาขาในเลขที่เอกสาร BST, TRF, TCS และ SP ให้ flow code บังคับเลือกสาขา โดยไม่ใช้ fallback และไม่ backfill ข้อมูลเก่า.

Checkpoint: implementation และ migration `20260728090000_add_branch_to_bst_trf_tcs_sp.sql` เสร็จแล้วและ apply/record ใน production กับ SIT. Type-check, lint และ `git diff --check` ผ่าน. ยังไม่ได้ทำ browser UAT หรือ push code ตามคำขอในรอบนี้.

# Active Production Dashboard Query Separation Batch 2026-07-23

Objective: แยก query/service ของ `/production/dashboard` ออกจาก shared `production-reports.ts` โดยคง API contract เดิมของหน้าไว้ และแก้ branch scope, WIP scope, aggregation correctness, BigInt serialization, cache header และ test coverage.

Approved design: batch นี้โฟกัสเฉพาะ `/production/dashboard` และ `GET /api/production/dashboard`; ยังไม่ refactor `/production/report`, `/api/production/report` หรือ `/api/production/machine-utilization`. ใช้ `production-dashboard.service.ts` และ query module เฉพาะหน้า โดยใช้ shared module เฉพาะ scope/ledger/serialization ที่ไม่เปลี่ยน behavior ของหน้าอื่น.

Task list: `docs/notes/page-flows/production-production-dashboard.md` หัวข้อ `Dashboard Query Separation Task List 2026-07-23`.

Write areas: `apps/next/src/app/api/production/dashboard/route.ts`, new dashboard service/query/serializer modules, focused dashboard tests, and only targeted DB migration/index changes after `EXPLAIN ANALYZE`.

Checkpoint: Dashboard query separation batch completed for `DASH-01` through `DASH-12`. Focused production tests `19/19`, production formula verification `ok: true` for 7 rows, workspace type-check, production build, and `git diff --check` pass. Workspace lint has zero errors with four existing warnings. No DB migration was needed after `EXPLAIN ANALYZE` review.

# Active Profit & Cost Performance Batch 2026-07-19

WTI/WTO gallery checkpoint 2026-07-22: detail row galleries now form one continuous sequence across image-bearing lots in table order. Opening a row starts at that lot, Next moves from the last image of one lot to the first image of the next, and the heading follows the active lot; the separate document-level album is unchanged. This batch intentionally excludes working-draft autosave, team visibility, recovery, APIs, and migrations from the SIT promotion.

Shared row-action SIT checkpoint 2026-07-22: runtime `จัดการ` columns use the shared Desktop ellipsis and full-width Mobile button. The opened menu matches the Mobile trigger width, centers each label between a fixed left icon and equal trailing spacer, uses subtle row dividers, keeps destructive commands red, and stops portalled menu clicks from opening the parent row/modal. Existing permissions, disabled states, confirmations, and business handlers remain unchanged.

## Accountant Default Landing And PO Permission Split 2026-07-24

Implemented locally and applied transactionally to production: Role
`accountant` uses `/daily/expense-dashboard` as its default landing page, while
PO Buy and PO Sell use independent `view`, `create`, `update`, `cancel`, and
`short_close` permissions instead of `finance.cash.view`. Migrations
`20260724020000_split_po_buy_sell_permissions.sql` and
`20260724120000_set_accountant_expense_dashboard_landing.sql` are recorded in
production migration history. The PO migration preserved existing access with
10 active permission rows and 60 copied grants across 6 Roles; the accountant
migration fails closed unless the Role already holds
`reports.expense_dashboard.view`.

Objective: cut `/profit-cost-analysis` over from transaction-wide Node aggregation to strict PostgreSQL fact/daily read models with split APIs, applied filters, request cancellation, branch scope, and server pagination/sort.

Active batch: implementation is promoted to Dev and SIT, and migration `20260719160000_create_profit_cost_reporting_read_model.sql` is applied to both production and SIT. SIT backfill produced 266 facts and 135 daily rows; reconciliation reports zero issues and exact purchase/revenue/COGS parity. Focused Vitest is 16/16 after the Dev/SIT semantic merges, full lint and source type-check pass, and `git diff --check` passes. Summary, rankings, and the active table fail independently; alerts are evaluated directly from the full scoped daily read model rather than a capped product page. No browser/UAT run was requested.

Latest decisions: financial/report facts are L5 and remain `private, no-store`; no Redis/browser fact cache; daily rollup owns summary/product numeric aggregation; fact ledger remains the source for distinct document counts; AP/AR remain direct PB/SB balance reads; old aggregate endpoint is retired with `410 Gone`.

Blocker: the full Next build reaches successful Webpack compilation but fails route-type validation on the pre-existing export `getCostPoolRowsData` in `dual-costing/cost-pool/route.ts`; this file is unchanged by the batch. Immediate next task: perform deployed SIT smoke verification when explicitly requested; customer UAT migration/promotion remains separate and pending explicit instruction.

## Previous Active Access Control Batch

Objective: implement the approved Access Control Module design across User Admin, Security Admin, multiple roles, action permissions, and branch-scoped finance flows.

## Active Sales Plan UX Batch 2026-07-19

Objective: ปรับ `/sales-plan` ตาม UX audit โดยคงหน้าเดียวและ line-tab วิเคราะห์ 2 มุมมองเดิม ไม่แยกเป็น 4 tabs ระดับหน้า; แก้ wording/status, LME/assumption grouping, KPI, modal, filter, table, dark-mode classes และ no-fallback calculation contract.

Write areas: `apps/next/src/components/main/MainSalesControlClients.tsx`, `apps/next/src/lib/server/main-sales-control.ts`, `docs/notes/page-flows/main-dashboard-reports-sales-plan.md`.

Completed locally: UI restructuring and Thai status wording; server analysis now uses only same-product Sales Plan price/% LME and returns no projected price/profit when no plan exists.

Validation checkpoint 2026-07-27: fixed the stale `periodFrom`/`periodTo` references in `buildSalesCommission`; the API now returns its existing string date range (`from`/`to`). Workspace type-check and production build pass; lint has zero errors with the existing warnings listed in the command output.

Completed locally: effective-permission helper/tests; action catalog and legacy-permission mapping migrations; User Admin/Security Admin split; multi-role user assignment; action checks for petty advance, payment approval, WTI open-bill buttons, purchase/sales bills, supplier payment, customer receipts, supplier ADV and daily expenses.

Validation: targeted ESLint, workspace type-check, focused Vitest `17/17`, and scoped diff checks pass.

Completed: four access-control migrations are now applied to production and SIT with controlled Supabase CLI workdirs; postflight confirmed the checked action catalog and admin/owner grants in both environments.
Blocker/next: continue the remaining broad finance-route audit documented in `docs/notes/access-control-broad-permission-audit-2026-07-19.md`.

# 00 Current Work

## Active nested impurity deduction batch — 2026-08-09

- Scope: WTI/WTO form, calculation, deletion confirmation, detail table and print-row classification.
- Contract: `parentId` and `impuritySourceLineId` are traversed recursively; every impurity line and every purchased impurity line can receive another impurity deduction. API, DB, Storage, Cache and existing PDF/Print layout contracts are preserved.
- Latest UI correction: `หักสิ่งเจือปนต่อ` is now a full-width action row under each completed impurity, nested rows render in the same editor with indentation, and the new field receives focus without opening a misleading product editor.
- Latest UI correction: every impurity entry, including `สินค้าอื่น` and nested entries, now uses the same collapsible card header as `เต๋าสินค้า` on desktop and mobile. Collapsed cards keep the status/weight summary and expose a delete action; expanded cards preserve all existing fields, image attachments and nested-deduction controls.
- Validation: focused nested/WTI tests `59/59`, product-entry contract tests `31/31`, formal print/PDF suites `158/158`, workspace lint, type-check, production build (with `NODE_OPTIONS=--max-old-space-size=4096`) and `git diff --check` passed. No commit, push or deploy yet.
- Remaining risk: native Chromium print preview was not available in this environment; React-PDF/HTML contract tests are the current evidence.

## NSERP-180 — Compact AR/AP filters — 2026-08-04

Active objective: reduce the desktop filter height on `/finance/ar` and `/finance/ap` while preserving every finance/query contract.

- Worktree: `C:\new-ns-scrap-erp-worktrees\nserp-180-ar-ap-compact-filters-20260804`
- Branch: `codex/nserp-180-ar-ap-compact-filters`
- Base: `sit-origin/main` at `6294a58dae2aebba4d9a3113d83996086322b1fc`
- Plane issue `NSERP-180` is `In Progress`; Plane access remains REST-only.
- Expected writes: AR/AP page clients and their page-flow notes only.
- Preserve: API/query behavior, date/status/customer/supplier/channel/branch filters, pagination, export, permissions, data and mobile filter behavior.

Required validation before publication:

1. Targeted lint, workspace lint, type-check, build and `git diff --check`.
2. Fresh desktop/mobile Codex Browser evidence for both AR and AP plus an independent acceptance verdict.
3. Fresh remote comparison, intended-only commit, normal SIT push and remote-SHA/deploy verification.
4. Upload evidence, add the Thai completion report and move Plane to `wait for test` through REST, then read everything back as UTF-8.
Latest integration safety fix (2026-08-08): batch RCP vouchers now pass an internal `data-print-group` boundary so each independent voucher is measured and rendered without merging rows, totals, or signatures. WTI/WTO keep their dedicated 12/14-row form paginator; the shared layer only applies the A4 asset/overflow gate for those forms. No public API or persisted contract changed.

Latest fallback hardening (2026-08-08): when a shared measured split is needed but a builder emitted only its final page, the derived continuation now preserves the document wrapper grid, reserves the placeholder footer height, keeps both continuation marker CSS contracts, and uses the exact ADV/PMA summary titles. Focused print/PDF tests are `155/155`; lint, type-check and production build pass. Native Chromium print-preview evidence remains unavailable in this environment.
## Audit follow-up — 2026-08-09

- Fixed nested impurity-purchase cleanup so every real lot and nested descendant is preserved when the derived purchase root is removed; the impurity/source branch itself is still removed.
- Fixed the desktop Sales Receipt history action column to stay sticky at the right edge of the table viewport.
- Added the missing SB detail print button using the existing Sales Bill print contract; no API, DB, Storage, Cache or business calculation changes.
- Fixed the print-header read path for document viewers (including sales-only users): document view permissions are read-only, the company-profile GET filters/validates the requested branch against `getBranchCodeIntersection`, and settings writes remain `system.settings.manage` only.
- Validation: focused audit/print/permission suites 208/208, lint, type-check, production build (337 static pages) and `git diff --check` pass. Browser smoke confirms sticky header geometry and the SB print button; local receipt-list API data loading, role-authenticated route integration, and native print popup remain environment-limited.
