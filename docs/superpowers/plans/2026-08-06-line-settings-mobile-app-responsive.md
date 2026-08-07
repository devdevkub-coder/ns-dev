# LINE Settings Mobile App Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปรับ `/admin/line-settings` ให้ใช้งานบนมือถือเหมือนหน้าตั้งค่าใน Mobile App มากขึ้น โดยลดความยาวที่ไม่จำเป็น เพิ่มพื้นที่สัมผัส และคง flow/ความปลอดภัยของ LINE เดิมทั้งหมด

**Architecture:** แก้เฉพาะ presentation ใน `LineSettingsPageClient.tsx` และ focused tests เดิม ไม่แก้ API, DB, permission, credential contract, AppShell, shared Tabs หรือ Mobile Bottom Navigation. ใช้ responsive Tailwind และ native `<details>/<summary>` เพื่อหลีกเลี่ยง dependency/state ใหม่; desktop ยังคง 8/4 layout และ bottom navigation เดิมยังเป็น source of truth ของ app shell.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, Lucide React, Vitest

---

## Status

IMPLEMENTED LOCALLY — แก้ application code และ focused tests แล้ว; ยังไม่ commit และไม่ push

## Evidence Baseline

ตรวจหน้าเรนเดอร์จริงที่ `390×844` แล้ว:

- ไม่มี horizontal overflow (`390/390px`)
- tabs เป็น `3×2` และ bottom navigation สูง `64px`
- content scroll container สูงประมาณ `3,485px`
- field/button หลักสูง `42px` จาก geometry จริง แม้ class ปัจจุบันเป็น `h-10`
- card หลักใช้ `p-6` บนมือถือ ทำให้พื้นที่กรอกจริงเหลือประมาณ `252px`
- Google Sheets URL มีปุ่มข้อความ `แสดง` ซ้อนอยู่ด้านขวาและเบียด placeholder
- status 4 ช่องเรียงหนึ่งคอลัมน์บนมือถือ ทำให้กินพื้นที่แนวตั้ง

## Chosen Direction

| Topic | Decision |
|---|---|
| ระดับการปรับ | Balanced Mobile App UX — มากกว่าแค่เพิ่มขนาดปุ่ม แต่ไม่เปลี่ยนเป็น wizard หลายหน้า |
| Navigation | tabs เดิม `3×2` แต่ sticky ใน scroll area บน mobile/tablet และ touch target อย่างน้อย `44px` |
| Status | mobile เป็น `2×2`, desktop เป็น `4×1`; ซ่อนเฉพาะคำอธิบายรองบนจอแคบ แต่คงค่าจริงและ warning สำคัญ |
| Main form | mobile ใช้ `p-4`, desktop คง `p-6`; controls เป็น `h-11` ต่ำกว่า `lg` และ `h-10` บน desktop |
| Google Sheets | คงเป็น optional connector แต่ยุบได้ด้วย native disclosure; eye action ใช้ icon ไม่ใช้ข้อความทับ input |
| Guide | mobile ยุบ “6 ขั้นตอน” ได้; desktop ยังคง side guide เปิดเห็นครบ |
| Actions | ไม่เพิ่ม sticky footer ชุดที่สอง เพราะจะชน Mobile Bottom Navigation; action เดิมอยู่ใกล้ฟอร์มและเต็มความกว้าง |
| Backend | ไม่เปลี่ยน endpoint, payload, validation, credential masking, LINE send หรือ Google Sheets behavior |

## Files

- Modify: `apps/next/src/app/admin/line-settings/LineSettingsPageClient.tsx`
- Modify: `apps/next/src/app/admin/line-settings/LineSettingsPageClient.connection.test.ts`
- Modify: `apps/next/src/app/admin/line-settings/LineSettingsPageClient.google-sheets.test.ts`
- Modify after implementation: `docs/notes/LINE Notification Control Center Ultimate Plan.md`
- Modify after implementation: `docs/migration/00-current-work.md`
- Do not modify: `apps/next/src/components/layout/AppShell.tsx`
- Do not modify: `apps/next/src/components/layout/MobileBottomNavigation.tsx`
- Do not modify: `apps/next/src/components/ui/Tabs.tsx`

---

### Task 1: Lock The Mobile Layout Contract With Focused Tests

**Files:**
- Modify: `apps/next/src/app/admin/line-settings/LineSettingsPageClient.connection.test.ts`
- Modify: `apps/next/src/app/admin/line-settings/LineSettingsPageClient.google-sheets.test.ts`

- [ ] **Step 1: Add a failing mobile structure test**

Extend the existing source contract test; do not add a new test file:

```ts
it('keeps the connection flow app-like on mobile without changing desktop structure', () => {
  const credentials = pageSource.slice(
    pageSource.indexOf('/* Tab 2: Channel Credentials */'),
    pageSource.indexOf('/* Tab 3: Targets / Groups */'),
  )

  expect(pageSource).toContain('data-line-mobile-tabs')
  expect(pageSource).toContain('grid-cols-3')
  expect(pageSource).toContain('min-h-11')
  expect(credentials).toContain('grid-cols-2 xl:grid-cols-4')
  expect(credentials).toContain('p-4 lg:p-6')
  expect(credentials).toContain('h-11 lg:h-10')
  expect(credentials).toContain('data-line-mobile-guide')
})
```

- [ ] **Step 2: Add a failing Google Sheets disclosure/toggle test**

```ts
expect(pageSource).toContain('data-line-google-sheets-disclosure')
expect(pageSource).toContain("showGoogleSheetsWebhook ? 'ซ่อน Google Sheets Webhook URL' : 'แสดง Google Sheets Webhook URL'")
expect(pageSource).toContain('showGoogleSheetsWebhook ? <EyeOff')
expect(pageSource).not.toContain("{showGoogleSheetsWebhook ? 'ซ่อน' : 'แสดง'}")
```

- [ ] **Step 3: Run the tests and verify they fail for the intended missing classes/markup**

Working directory: `apps/next`

```powershell
npx vitest run src/app/admin/line-settings/LineSettingsPageClient.connection.test.ts src/app/admin/line-settings/LineSettingsPageClient.google-sheets.test.ts
```

Expected: FAIL only on the new responsive/disclosure assertions.

---

### Task 2: Make Tabs And Connection Status Compact On Mobile

**Files:**
- Modify: `apps/next/src/app/admin/line-settings/LineSettingsPageClient.tsx:1441-1473`
- Modify: `apps/next/src/app/admin/line-settings/LineSettingsPageClient.tsx:1522-1582`

- [ ] **Step 1: Make the tab bar sticky only below `lg`**

Add this opening wrapper immediately before the existing `<Tabs>` and add `</div>` immediately after its closing `</Tabs>`; do not edit shared `Tabs.tsx`:

```tsx
<div
  data-line-mobile-tabs
  className="sticky top-0 z-20 -mx-4 bg-slate-50/95 px-4 py-2 backdrop-blur lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none"
>
</div>
```

Each trigger keeps the existing active/focus behavior but changes to:

```tsx
className="min-h-11 min-w-0 px-1 text-sm focus-visible:!ring-0 focus-visible:!ring-offset-0 focus-visible:border-slate-400 lg:min-h-10 lg:px-3"
```

- [ ] **Step 2: Change status summary from `1×4` to `2×2` on mobile**

Use:

```tsx
<div className="grid grid-cols-2 xl:grid-cols-4">
```

Border contract:

```text
cell 1: border-r + border-b; remove bottom at xl
cell 2: border-b; add right and remove bottom at xl
cell 3: border-r
cell 4: no trailing border
```

Keep status labels and values visible. Apply `hidden sm:block` only to the third explanatory paragraph in each cell; critical mismatch remains visible in the existing red alert below the summary.

- [ ] **Step 3: Reduce mobile-only padding**

Change the summary outer surface to `p-3 sm:p-4` and the main connection form card to:

```tsx
className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:space-y-6 lg:p-6"
```

Desktop 8/4 columns and desktop padding remain unchanged.

- [ ] **Step 4: Run the focused connection test**

```powershell
npx vitest run src/app/admin/line-settings/LineSettingsPageClient.connection.test.ts
```

Expected: tabs/status/padding assertions pass; no connection behavior assertion regresses.

---

### Task 3: Normalize Mobile Touch Targets And Fix The Crowded URL Field

**Files:**
- Modify: `apps/next/src/app/admin/line-settings/LineSettingsPageClient.tsx:1602-1893`

- [ ] **Step 1: Apply one height rule to interactive connection controls**

For Token, Secret, Storage Bucket, Public App URL, Webhook URL, copy/open actions, Google Sheets URL, the three connection actions, test-target select and real-send button, replace mobile `h-10` with:

```text
h-11 lg:h-10
```

Do not change field width rules. All controls remain `w-full` when stacked.

- [ ] **Step 2: Keep labels readable and consistent**

Use the existing design baseline for labels (`text-xs`) and `text-sm` for values/actions. Do not enlarge helper copy or status metadata into competing headings.

- [ ] **Step 3: Make auto-send checkbox rows full touch targets**

Keep native checkboxes and business behavior; update each label to a row with at least 44px hit height:

```tsx
<label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-1 py-2 text-sm font-semibold text-slate-700">
  <input
    type="checkbox"
    className="mt-0.5 size-5 shrink-0 rounded border-slate-300 text-slate-900 focus:outline-none focus:ring-0"
    checked={form.lineAutoSendWti}
    onChange={(event) => setForm({ ...form, lineAutoSendWti: event.target.checked })}
  />
  <span>ส่งข้อความแจ้งเตือน WTI (บิลรับสินค้า) ไปไลน์กลุ่มอัตโนมัติเมื่อสร้างบิล</span>
</label>
```

Apply the same classes to the WTO row while preserving `lineAutoSendWto`.

Do not add a new switch dependency.

- [ ] **Step 4: Replace the Google Sheets text toggle with an icon toggle**

Keep the existing security behavior and `aria-label`, but use the same icon language as draft Token/Secret:

```tsx
className="h-11 w-full rounded-md border border-slate-300 bg-[#FFF7CC] px-3 py-2 pr-11 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none dark:bg-amber-200/15 lg:h-10"
<button
  type="button"
  aria-label={showGoogleSheetsWebhook ? 'ซ่อน Google Sheets Webhook URL' : 'แสดง Google Sheets Webhook URL'}
  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
  onClick={() => setShowGoogleSheetsWebhook((current) => !current)}
>
  {showGoogleSheetsWebhook
    ? <EyeOff aria-hidden="true" className="size-4" />
    : <Eye aria-hidden="true" className="size-4" />}
</button>
```

- [ ] **Step 5: Run focused tests and targeted lint**

```powershell
npx vitest run src/app/admin/line-settings/LineSettingsPageClient.connection.test.ts src/app/admin/line-settings/LineSettingsPageClient.google-sheets.test.ts
npx eslint src/app/admin/line-settings/LineSettingsPageClient.tsx src/app/admin/line-settings/LineSettingsPageClient.connection.test.ts src/app/admin/line-settings/LineSettingsPageClient.google-sheets.test.ts
```

Expected: PASS; no secret/token value appears in test output.

---

### Task 4: Reduce Scroll Length With Native Progressive Disclosure

**Files:**
- Modify: `apps/next/src/app/admin/line-settings/LineSettingsPageClient.tsx:1799-1966`
- Modify: both focused tests above

- [ ] **Step 1: Convert optional Google Sheets into a native disclosure**

Import `ChevronDown` and `useRef`, then add this ref next to the existing credential UI state:

```tsx
const googleSheetsDisclosureRef = useRef<HTMLDetailsElement>(null)
```

Wrap the current Google Sheets description, field, error and helper block at lines `1799-1836` without changing its state/API:

```tsx
<details
  ref={googleSheetsDisclosureRef}
  data-line-google-sheets-disclosure
  className="group overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
>
  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-200">
    <span>เชื่อมต่อ Google Sheets (ไม่บังคับ)</span>
    <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
      {form.googleSheetsWebhookUrl ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}
      <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
    </span>
  </summary>
  <div className="border-t border-slate-200 p-4">
  </div>
</details>
```

Move the current block between that `<div>` and `</div>`. Default is collapsed because the connector is explicitly optional. In the existing `!parsed.success` branch, compute the errors before setting state and open the disclosure when this field is invalid:

```tsx
const nextFieldErrors = parsed.error.flatten().fieldErrors as Partial<Record<keyof CredentialsFormValues, string>>
setFieldErrors(nextFieldErrors)
if (nextFieldErrors.googleSheetsWebhookUrl) {
  requestAnimationFrame(() => {
    if (googleSheetsDisclosureRef.current) googleSheetsDisclosureRef.current.open = true
  })
}
setConnectionError('กรุณากรอกข้อมูลให้ถูกต้อง')
return
```

This prevents a validation message from remaining hidden; it does not change API validation.

- [ ] **Step 2: Make the six-step guide collapsible only on mobile/tablet**

Extract the existing `<ol>` contents into a render helper inside the same component so the labels/state logic stay single-source:

```tsx
const connectionStepItems = [
  {
    title: '1. Environment',
    description: `${lineProfile.dataProfileLabel} → ${lineProfile.targetProfileLabel}`,
    icon: <CheckCircle2 aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${lineProfile.aligned ? 'text-emerald-600' : 'text-amber-600'}`} />,
  },
  {
    title: '2. Credentials',
    description: 'กรอกหรือใช้ค่าที่บันทึกแล้ว แล้วทดสอบ Access Token',
    icon: <CheckCircle2 aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${tokenCheck === 'passed' ? 'text-emerald-600' : 'text-slate-400'}`} />,
  },
  {
    title: '3. Save',
    description: 'บันทึก Secret และ Public App URL ก่อนทดสอบ Webhook',
    icon: <CheckCircle2 aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${!hasUnsavedWebhookConfig ? 'text-emerald-600' : 'text-slate-400'}`} />,
  },
  {
    title: '4. Internal Webhook',
    description: 'ทดสอบลายเซ็นกับ URL ที่บันทึกไว้ โดยไม่สร้างข้อมูลธุรกิจ',
    icon: <CheckCircle2 aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${webhookCheck === 'passed' ? 'text-emerald-600' : 'text-slate-400'}`} />,
  },
  {
    title: '5. LINE Developers',
    description: 'วาง URL, กด Verify และเปิด Use webhook ด้วยตนเอง',
    icon: <ExternalLink aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-400" />,
  },
  {
    title: '6. Target / ส่งจริง',
    description: 'ให้ OA ได้รับ event จริงก่อนเลือกปลายทางและส่งข้อความทดสอบ',
    icon: <Send aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-400" />,
  },
]

const renderConnectionSteps = (marginClass: string) => (
  <ol className={`${marginClass} space-y-3 text-sm`}>
    {connectionStepItems.map((step) => (
      <li key={step.title} className="flex gap-3">
        {step.icon}
        <div>
          <p className="font-medium text-slate-800">{step.title}</p>
          <p className="text-xs text-slate-500">{step.description}</p>
        </div>
      </li>
    ))}
  </ol>
)
```

Then render the helper in a mobile disclosure and the unchanged desktop surface:

```tsx
<details data-line-mobile-guide className="group lg:hidden">
  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">
    <span>ดู 6 ขั้นตอนการเชื่อมต่อ</span>
    <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
  </summary>
  {renderConnectionSteps('mt-3')}
</details>
<div className="hidden lg:block">
  {renderConnectionSteps('mt-4')}
</div>
```

Keep “ส่งข้อความทดสอบจริง” outside the collapsed guide so the operational action remains visible. Do not add carousel, swipe gesture, step router or localStorage.

- [ ] **Step 3: Preserve feedback/action ordering**

The DOM order must remain:

```text
required LINE fields
optional Google Sheets disclosure
connection feedback
Token → Save → Internal Webhook actions
guide / real test send
```

No alert moves back to the page top and button labels remain fixed during loading.

- [ ] **Step 4: Run focused tests**

```powershell
npx vitest run src/app/admin/line-settings/LineSettingsPageClient.connection.test.ts src/app/admin/line-settings/LineSettingsPageClient.google-sheets.test.ts
```

Expected: PASS; Google Sheets persistence and all six setup phases remain present.

---

### Task 5: Validate, Review And Document The Implemented Flow

**Files:**
- Review the three application/test files above
- Modify after implementation: `docs/notes/LINE Notification Control Center Ultimate Plan.md`
- Modify after implementation: `docs/migration/00-current-work.md`

- [ ] **Step 1: Run required code validation**

```powershell
npm run lint --workspace @ns-scrap-erp/next
npm run type-check --workspace @ns-scrap-erp/next
npm run build --workspace @ns-scrap-erp/next
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 2: Review the final diff**

Must prove:

- no API, DB, permission, secret masking or LINE/Google Sheets transport behavior changed;
- no shared AppShell/Tabs/Bottom Navigation regression;
- no new dependency, viewport listener, browser storage or duplicated connection state;
- a Google Sheets validation error opens its disclosure so the message is visible;
- focus styles remain visible and native disclosures work with keyboard;
- unrelated dirty files are untouched.

- [ ] **Step 3: Update flow documentation**

Add one checkpoint to `docs/notes/LINE Notification Control Center Ultimate Plan.md` describing:

- mobile status `2×2` and desktop `4×1`;
- 44px mobile controls;
- optional Google Sheets disclosure;
- collapsible mobile guide;
- unchanged credential/API/security contract.

Keep `docs/migration/00-current-work.md` operational: record only active scope, validation and next action.

- [ ] **Step 4: Browser QA only when explicitly requested**

Use Codex Browser and inspect before every interaction. Required evidence:

| Viewport | Acceptance |
|---|---|
| `390×844` | no horizontal overflow; tabs `3×2`; every main field/button at least `44px`; Google toggle does not overlap; bottom navigation unobstructed |
| `430×932` | same mobile contract; Thai labels do not clip or overlap |
| `768×1024` | six tabs fit one row; sticky tabs and bottom navigation remain usable below `lg` |
| `1440×900` | desktop status remains four columns; 8/4 connection layout and `h-10` controls remain unchanged |

Check keyboard focus for tabs, both disclosures, eye toggles and actions. Check console/network errors without submitting or sending a real LINE message unless separately authorized.

- [ ] **Step 5: Fresh acceptance audit before claiming implementation DONE**

Provide the exact request, final diff and validation evidence to an isolated reviewer when available. `DONE` requires `ACCEPTED`; if no independent reviewer is allowed/available, report the review as degraded self-audit.

- [ ] **Step 6: Git delivery only when requested**

Before commit/push: fetch `sit-origin/main`, verify ancestry, semantically integrate newer remote work, rerun affected validation, stage only the three intended code/test files plus the two flow docs, and push to `sit-origin/main` without force-push.

## Acceptance Contract

Implementation is accepted only when all are true:

- At `390px`, the page has zero horizontal overflow.
- Mobile tabs are `3×2`, readable at `text-sm`, and at least `44px` high.
- The status card is `2×2` on mobile and `4×1` at `xl`; no critical mismatch is hidden.
- Mobile connection-card padding is `16px`; desktop remains `24px`.
- All connection fields and actions are at least `44px` high below `lg` and keep desktop sizing.
- Google Sheets eye action never covers visible input text/placeholder.
- Google Sheets remains discoverable, optional, editable and persisted through the existing API.
- A hidden invalid Google Sheets field automatically becomes visible.
- Mobile users can collapse the long six-step explanation without losing the real test-send action.
- Feedback stays beside the action that produced it; loading does not move or resize buttons.
- Existing Mobile Bottom Navigation and safe bottom spacing remain unchanged.
- No stored Token/Secret is revealed, logged, cached or returned to the browser.
- Focused tests, lint, type-check, build and diff check pass.
- Final review has no unresolved high/medium finding.

## Explicit Non-Goals

- No native iOS/Android app or PWA conversion.
- No wizard route, carousel, swipe gesture or per-step page navigation.
- No sticky action footer competing with the existing bottom navigation.
- No AppShell, shared Tabs or global form-token refactor.
- No API, DB, migration, cache, permission, webhook, LINE send or Google Sheets transport change.
- No real external send during code validation without separate authorization.
