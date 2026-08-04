---
title: Finance Currency Policy Contract
aliases:
  - FCD currency policy
  - นโยบายสกุลเงินการเงิน
tags:
  - finance
  - fcd
  - fx
status: in-progress
created: 2026-07-30
updated: 2026-07-30
---

# Finance Currency Policy Contract

## Purpose

`public.finance_currency_policies` เป็น source of truth เดียวสำหรับ functional currency ของระบบการเงิน เพราะ Account Master ระบุเพียงสกุลที่บัญชีรองรับ และห้ามใช้เพื่อเดา base currency ของบริษัท

ตารางเป็น singleton: ต้องมีได้เพียงหนึ่งแถว และไม่มี seed/default สำหรับสกุลเงิน

## Required Configuration

ก่อนเปิด write path ของ foreign receipt ผู้ดูแลการเงินต้องกำหนด functional currency จริง:

| Field | Meaning |
|---|---|
| `functional_currency_code` | สกุลเงิน functional ของบริษัท อ้างอิง Currency Master |

Runtime reader ต้อง fail closed เมื่อไม่มีหรือมีมากกว่าหนึ่ง policy row และต้องไม่แทนค่าด้วย `THB`, `USD` หรือ account currency

## Receipt Rate And OD Rules

- ยอดเงิน native และ book amount คำนวณ/เก็บ/แสดงที่ 2 ตำแหน่ง
- FX rate ใช้ 3 ตำแหน่ง; คอลัมน์ `fx_rates.rate` เดิมยังเป็น `numeric(18,6)` เพื่อไม่ปัดข้อมูลเดิมจาก migration. ปัดยอดเงินครั้งเดียวเมื่อสร้างรายการ
- Customer Receipt ขอ suggested FX rate จาก API ตามวันที่รับเงิน
- หาก API ไม่มี rate ผู้ใช้กรอก rate เองได้
- หาก API มี rate ผู้ใช้แก้ไขได้ก่อนบันทึก
- ระบบบันทึก rate ที่ใช้จริงและที่มาของ rate ไว้กับรายการ; ห้าม fallback ไปใช้ rate ล่าสุด
- FCD OD เป็นวงเงินระดับบัญชี; ไม่แยกวงเงินต่อสกุลเงิน
- ไม่มี GL posting, rate policy สำหรับ dashboard/month-end หรือสถานะเอกสารใหม่ใน batch รับเงินต่างประเทศนี้

## Current Status

วันที่ 2026-07-30 ได้ apply migration `20260730110000_create_finance_currency_policy.sql` และตั้ง policy row เดียวเป็น `THB` จาก Currency Master ทั้ง dev-target และ SIT แล้ว. Runtime reader จึงอ่าน functional currency จาก configuration ได้โดยไม่ต้อง hardcode. Foreign posting service ยังไม่เปิดจนกว่า schema/ledger/service tasks ที่เกี่ยวข้องจะเสร็จ.

## Related

- [[FCD Foreign Receipt Implementation Task List]]
- [[Receive Payment From The Customer Via Their FCD Account]]
