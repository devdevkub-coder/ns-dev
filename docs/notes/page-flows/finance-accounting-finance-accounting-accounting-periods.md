---
title: Accounting Periods Page Flow
tags:
  - page-flow
  - menu
  - finance-accounting
  - period-close
status: accepted-baseline
updated: 2026-06-24
route: /finance-accounting/accounting-periods
---

# Accounting Periods Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Finance Accounting |
| Route | `/finance-accounting/accounting-periods` |
| Page | Accounting Periods |
| Current Next | direct FA5 policy/readiness page baseline |

## Canonical References

[[Finance Accounting Flow]], [[Finance And Accounting Menu Summary]], [[Reporting History Snapshot Policy]], `docs/migration/23-finance-accounting-fa5-hardening-contract.md`

## Page Purpose

หน้า Accounting Periods เป็น target owner ของงวดบัญชีและ policy ปิดงวด. หน้านี้ควรเป็นศูนย์กลางสำหรับ create period, soft close, lock, reopen, และ year close เมื่อ runtime enforcement พร้อม.

สถานะปัจจุบันเป็น policy/readiness surface ยังไม่ใช่ตัว enforce closed-period lock กับทุก write API.

## Page Responsibilities

- แสดงงวดบัญชีและสถานะของแต่ละงวด.
- แยกสถานะเป้าหมายอย่างน้อย `open`, `soft_closed`, `locked`, `reopened`, `year_closed`.
- แสดง readiness ก่อนปิดงวด เช่น transaction incomplete, AR/AP mismatch, stock negative, missing WAC, bank unreconciled, tax gap, depreciation missing.
- เป็น entry point สำหรับ month close และ year close ในอนาคต.
- บันทึกเหตุผลและ audit เมื่อ reopen งวด.

## Non-Responsibilities

- ไม่แก้ business transaction ต้นทางโดยตรง.
- ไม่สร้าง `stock_ledger`, `bank_statement`, `SB`, `PB`, `RCP`, `PMT`, asset disposal หรือ depreciation row เอง.
- ไม่เป็น GL posting engine.
- ไม่แทนที่ source document/fact table หรือ snapshot table.

## Target Lifecycle

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด period list และ readiness summary |
| 2 | ตรวจงวด | แสดง issue ที่ต้องแก้ก่อน soft close/lock |
| 3 | Soft close | ตั้งสถานะเตือน/จำกัด backdated write แต่ยังให้ admin แก้พร้อม audit |
| 4 | Lock period | block create/edit/cancel/reverse/backdate ในงวดที่ปิดตาม enforcement matrix |
| 5 | Reopen | ต้องมี reason/actor/approval และ rebuild snapshot หลังแก้ |
| 6 | Year close | freeze annual statements และ carry profit/loss ไป retained earnings ตาม policy |

## Data Contract

- Period state must be separate from report calculation.
- Report pages read frozen facts/snapshots; Accounting Periods owns lock state and readiness.
- Month/year close must use [[Reporting History Snapshot Policy]] before historical dashboards/statements can be considered frozen.
- Runtime write APIs must reject closed-period mutations by document/business date, not by `created_at`.
- Reopen must be append-only audit; avoid editing old period state without history.

## Close / Freeze Impact

| Area | Target lock impact |
|---|---|
| Sales | lock `SB`, `RCP`, customer advance allocation, stock return/cancel movement dated in closed period |
| Purchase | lock `PB`, `PMT`, supplier advance allocation, purchase stock movement dated in closed period |
| Stock | lock stock movement/reversal/backdate and freeze qty/value/WAC/pending_out snapshots |
| Bank/Cash | lock bank statement correction/delete/backdated movement except reversal/audit path |
| Assets | lock acquisition/edit/depreciation/disposal/reversal in closed period |
| Reports | read from frozen snapshots; do not mutate source |

## Current Gap

- Runtime closed-period enforcement is not wired across all write APIs yet.
- Daily/monthly/yearly snapshot schema is not finalized.
- Reopen/rebuild snapshot audit flow is not implemented.
- GL/statutory posting scope is still separate from this page.

## Implementation Checklist

- [x] Document page purpose and close/freeze target
- [x] Add direct Next route that explains period states, readiness domains, close/freeze impact, and pending hardening work without enabling write/enforcement actions
- [ ] Define DB period state model and audit table
- [ ] Define closed-period write API guard contract
- [ ] Define readiness checks per source domain
- [ ] Define snapshot build/rebuild flow
- [ ] Define year-close retained earnings policy
