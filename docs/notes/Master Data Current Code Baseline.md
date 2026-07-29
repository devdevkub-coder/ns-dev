---
title: Master Data Current Code Baseline
tags:
  - master-data
  - baseline
  - page-flow
status: accepted
updated: 2026-06-11
---

# Master Data Current Code Baseline

เอกสารนี้บันทึก decision ล่าสุดจาก user: Master Data ใน current Next code ถือว่า “ถูกต้องแล้ว” และใช้เป็น accepted baseline สำหรับเอกสาร flow รายหน้า

## Decision

- Active source of truth สำหรับ Master Data คือ current code ใน `apps/next`
- ไม่ต้องใช้ legacy เป็นตัวตัดสินหลักของ master-data flow แล้ว
- ถ้า legacy ต่างจาก current code ให้ถือว่า current code ชนะ เว้นแต่ user สั่งเปลี่ยนเฉพาะหน้า
- Page-flow ของ master-data ต้อง sync ตาม current code ล่าสุด
- งานที่เหลือของ master-data คือ documentation sync และ future change tracking ไม่ใช่ proof/reconciliation กับ legacy

## Scope

ครอบคลุม active master-data routes ทั้งหมด:

| Route | Page |
|---|---|
| `/master-data/customers` | ลูกค้า |
| `/master-data/salespersons` | พนักงานขาย |
| `/master-data/suppliers` | ผู้ขาย |
| `/master-data/products` | สินค้า |
| `/master-data/product-types` | ประเภทสินค้า |
| `/master-data/product-units` | หน่วยสินค้า |
| `/master-data/impurities` | รายการสิ่งเจือปน |
| `/master-data/branches` | สาขา |
| `/master-data/warehouses` | คลัง |
| `/master-data/accounts` | บัญชีเงินบริษัท |
| `/master-data/payment-methods` | วิธีจ่าย/รับเงิน |
| `/master-data/bank-names` | ชื่อธนาคาร |
| `/master-data/channels` | ช่องทางขาย |
| `/master-data/expense-categories` | หมวดค่าใช้จ่าย |
| `/master-data/expense-types` | ประเภทค่าใช้จ่าย |
| `/master-data/directors` | พนักงาน / กรรมการ |
| `/master-data/machines` | เครื่องจักร |
| `/master-data/machine-types` | ประเภทเครื่องจักร |
| `/master-data/production-lines` | Production Line |
| `/master-data/currencies` | สกุลเงิน |
| `/master-data/beneficiaries` | ผู้รับเงินต่างประเทศ |
| `/master-data/remittance-purposes` | วัตถุประสงค์โอน |

## Documentation Rule

- Page-flow รายหน้าใน `docs/notes/page-flows/master-data-*.md` ต้องอ้าง current code เป็น accepted baseline
- ถ้าแก้ UI/API/master schema ภายหลัง ต้องอัปเดต page-flow ของหน้านั้นทันที
- Master Data ยังต้องทำตาม `docs/design.md` สำหรับ form/table/filter/input type
- Transaction pages ต้องเลือก master data เฉพาะ active rows และ snapshot ค่า master ที่จำเป็นลงเอกสารธุรกิจ

## Non-Scope

- ไม่รวม Admin/System pages
- ไม่รวม transaction pages ที่ใช้ master data เช่น PB, SB, PMT, WTI/WTO
- ไม่รวม report formula

## Remaining Work

- ไม่มี master-data page ที่ต้องรอ legacy proof
- ยังต้อง sync docs เมื่อ current code เปลี่ยน
- ยังต้อง verify downstream transaction pages ว่าใช้ master data ตาม accepted baseline นี้จริงหรือไม่
