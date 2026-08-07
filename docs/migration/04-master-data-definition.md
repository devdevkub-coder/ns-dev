# 04 Master Data Definition

## Objective

กำหนด master data และ key basic data ที่ต้องนิ่งก่อนเริ่ม transaction refactor

## Master Data Groups

### Organization

- company
- branches
- warehouses

### Commercial Parties

- customers
- suppliers
- salespersons

### Product Domain

- products
- impurities / สิ่งเจือปน
- product grade
- item status
- unit of measure

### Finance Domain

- accounts
- account subtypes / ประเภทบัญชีธนาคาร
- currencies
- payment methods
- expense categories
- remittance purposes

Finance-domain notes:
- `payment methods` ต้องเก็บ business classification กลางว่าเป็น `cash` หรือ `bank`
- `/master-data/accounts` ต้องอิง classification นี้เพื่อกำหนดว่า field `ประเภทบัญชี`, `ธนาคาร`, `เลขที่บัญชี` ต้องแสดงหรือซ่อน
- `/master-data/suppliers` และ transaction forms ที่มี `วิธีจ่าย/รับเงิน` ต้องดึงตัวเลือกจาก `public.payment_methods.name` โดยตรง และใช้ `payment_methods.type` แค่เพื่อตัดสินว่า field รายละเอียดบัญชีธนาคารต้องแสดงหรือบังคับหรือไม่
- `/purchase/payments`, `/sales/receipts`, และ `/daily/payment-approval` ต้องใช้ master เดียวกันนี้ด้วย ห้ามคง list วิธีจ่ายหรือ fallback เช่น `เงินโอน` ไว้ใน component/route เอง
- ห้าม infer cash/bank จากข้อความ display เช่น `เงินสด`, `Cash`, `Bank Transfer`

### Channel and Classification

- purchase channels
- sales channels
- transaction modes
- VAT / WHT flags and tax-rate config

Tax-rate config notes:
- `vat_settings` และ `wht_settings` เป็น DB-backed master/config ไม่ใช่ frontend hardcode
- `/admin/system-settings` เป็นหน้า user-facing สำหรับ `VAT / WHT`
- VAT แสดงเป็น primary active/default rate editor
- WHT ต้องแสดงทุก row ที่มีใน `wht_settings` เป็นตาราง และให้แก้ `rate_percent` ได้รายแถว
- WHT master มาตรฐานต้องมี 1% (ขนส่ง/รับเหมา), 2% (โฆษณา), 3% (บริการ), 5% (ค่าเช่า), 10% (ต่างชาติ), และ 15% (ดอกเบี้ย/เงินปันผล)
- Runtime calculation ต้องเลือก WHT จาก active default row ก่อน ไม่เลือกจาก row ที่ updated ล่าสุดเพียงอย่างเดียว

### Thai Address Reference

- provinces: `thai_provinces`
- districts / amphoes: `thai_districts`
- subdistricts / tambons: `thai_subdistricts`
- postal codes come from the selected subdistrict and should be auto-filled in forms

### Security

- app users
- roles
- permissions
- user branch access

## Key Basic Data to Define

- primary key strategy
- document number strategy
- branch scope rules
- warehouse scope rules
- product status model
- grade model
- account mapping rules
- tax behavior flags
- opening balance structure
- active/inactive semantics

## Source of Truth Rules

- master data ต้องมี source of truth เดียว
- ห้ามซ้ำระหว่าง frontend hardcode กับ DB
- identity และ security data ต้องไม่มีหลาย source โดยไม่จำเป็น

## Completion Checklist

- branch list approved
- warehouse list approved
- customer/supplier keys approved
- Thai address reference imported into production and wired to customer form
- product structure approved
- account structure approved
- channel definitions approved
- role matrix approved
- company setup approved
- opening balance approach approved
