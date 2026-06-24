---
title: Pending Sale Page Flow
aliases:
  - Pending Sale
  - Stock Issue Before Billing
  - เบิกออกรอบิล
  - Flow หน้าเบิกออกรอบิล
tags:
  - ns-scrap-erp
  - sales
  - stock
  - pending-sale
  - page-flow
status: removed-target-flow
created: 2026-06-11
updated: 2026-06-23
---

# Pending Sale Page Flow / Flow หน้าเบิกออกรอบิล

## Current Target Decision

`Pending Sale / PSALE / เบิกออกรอบิล` ถูกถอดออกจาก target runtime แล้ว

เหตุผลคือ flow ใหม่ให้ `WTO` เป็นเอกสารที่แสดงว่าสินค้าออก/รอออกแล้ว และสร้าง `pending_out` โดยตรงใน `stock_holds` เพื่อกัน available stock ก่อนเปิดบิลขาย จากนั้น `Sales Bill` ที่ดึง `WTO` ไปใช้จะเป็นจุดเดียวที่ consume pending_out และเขียน `stock_ledger.ref_type = SB`

Target flow ที่ต้องใช้:

```text
WTO / ใบส่งของ
-> pending_out / รอออก ใน stock_holds
-> Sales Bill จาก WTO
-> stock_ledger ref_type = SB
-> Receipt
```

ดังนั้นระบบใหม่ต้องไม่สร้างเอกสาร `PSALE`, ไม่สร้าง `PSALE-CANCEL`, และไม่เปิด Sales Bill จาก `pendingStockIssueId` หรือ `fromPsale...`

## Runtime Contract

| Area | Target behavior |
|---|---|
| Route `/sales/stock-issue` | deleted from active app routing; no runtime page exists |
| API `/api/sales/stock-issue` | deleted from active app routing; no runtime API exists |
| Sales Bill create | form schema no longer accepts `pendingStockIssueId` / `fromPsale...`; active API flow parses the target Sales Bill schema only and has no PSALE conversion path |
| UI/report links | must not point to `/sales/stock-issue`; pending-out summaries link to Sales Bill/WTO flow instead |
| Stock ledger source link | `PSALE` / `PSALE-CANCEL` legacy ledger rows do not link to the removed page |
| Stock ledger | no new `PSALE` or `PSALE-CANCEL` rows |
| Stock status before billing | use `pending_out / รอออก` from active WTO hold |
| Stock cut | happens only when Sales Bill consumes WTO and writes `SB` ledger |
| Sales Bill cancel | writes `SB-CANCEL`, restores WTO pending_out, and returns WTO to delivered |

## Legacy Finding

Legacy had a real `stockIssues` / `PSALE` flow:

- page component `view-stockIssue` in `old-apps/legacy/index.html`
- generated document number `PSALE...`
- created stock ledger movement before billing
- later converted or linked to Sales Bill

That legacy behavior is kept here only as historical reference. It must not be used as target behavior for new writes because it creates two competing stock concepts between WTO pending_out and PSALE stock-out.

## What Replaced Pending Sale

| Old concept | New target concept |
|---|---|
| เบิกออกรอบิล page | no page in target runtime |
| `stock_issues` / `PSALE` | legacy data only |
| `PSALE` stock-out before billing | `WTO` active pending_out, no ledger yet |
| Convert PSALE to SB | create SB from WTO |
| Cancel PSALE | cancel/reverse WTO or SB depending on stage |
| `usedPending` calculation | active pending_out from `stock_holds` |

## Correct Stock Meaning

ต้องแยกสถานะเอกสารกับสถานะ stock:

- `WTO.status = delivered` หรือ UI ว่า `ออกบิลแล้ว/ยังไม่ออกบิล` เป็นสถานะเอกสารส่งของ
- `stock_holds.status = active` คือสินค้านั้นอยู่ในสถานะ `pending_out / รอออก` และลด available แล้ว แต่ยังไม่ลง stock ledger
- `stock_ledger.ref_type = SB` คือเกิด stock-out จริงในบัญชี stock แล้ว เพราะเปิดบิลขายสำเร็จ
- `stock_ledger.ref_type = SB-CANCEL` คือ reversal เมื่อยกเลิกบิลขาย และต้อง restore pending_out กลับให้ WTO

## Implementation Notes

- `stock_issues` และ `stock_issue_status_logs` อาจยังมีอยู่ใน schema เพื่อรองรับ legacy data หรือ migration reference แต่ไม่ใช่ runtime write path
- shared Sales Bill validation no longer exposes PSALE form fields; target Sales Bill creation is owned by `WTO -> SB` schema fields only
- verification scripts ที่สร้าง/cancel PSALE ถูกถอดออกจาก target type-check surface แล้ว; QA ใหม่ต้องครอบคลุม `WTO -> SB -> SB-CANCEL` โดยไม่สร้าง PSALE
- read model/report wording that used Pending Sale has been moved toward `WTO pending out`; remaining legacy historical docs may still say PSALE only as source-reference context

## Related Notes

- [[Sales Flow]]
- [[Sales Bills Page Flow]]
- [[Stock Ledger and Stock Balance]]
- [[Stock Ledger DB API Design]]
- [[WTI-WTO Flow]]
