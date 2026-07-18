# Access Control Design

วันที่: 2026-07-19
ขอบเขต: `/admin/users`, `/admin/roles-permissions` และ authorization ของ action ในระบบ

## เป้าหมาย

ปรับการจัดการผู้ใช้งาน, หน้าที่งาน และสิทธิ์ให้เป็น Access Control Module เดียวกัน โดยแยกข้อมูลบุคคลออกจากนโยบายสิทธิ์อย่างชัดเจน และควบคุม action สำคัญ เช่น เปิดบิล, อนุมัติ และจ่ายเงินจริงทั้งที่ UI และ API

## สิ่งที่ยืนยันแล้ว

| หัวข้อ | ข้อสรุป |
|---|---|
| โครงสร้างหน้า | ใช้ Module เดียวกัน แต่คง URL เดิมและแยกแท็บ/หน้าที่ |
| ผู้ใช้หนึ่งคน | มีได้หลาย Role |
| ขอบเขตสาขา | Role กำหนดค่าเริ่มต้น และผู้ใช้กำหนดสาขาที่เข้าถึงได้ |
| สิทธิ์ขัดกัน | Deny รายบุคคล > Allow รายบุคคล > Allow จาก Role > ไม่อนุญาต |
| ระดับสิทธิ์ | หน้าทั่วไปใช้ `ดู/จัดการ`; เอกสารสำคัญใช้ action แยก |
| วงเงินอนุมัติ | ไม่มีวงเงินอนุมัติ และไม่มี escalation ตามยอดเงิน |
| ผู้สร้างอนุมัติเอง | อนุญาตถ้ามีสิทธิ์อนุมัติ แต่ต้องมี warning และ audit/report |
| ฝ่ายจ่ายเงินจริง | ผู้มีสิทธิ์ `จ่ายเงินจริง` จ่ายได้ทุกวงเงิน |
| ผู้ดูแล | แยก User Administrator ออกจาก Security/Permission Administrator |
| การเปลี่ยนสิทธิ์ | มีผลทันทีและบันทึก audit ก่อน/หลังทุกครั้ง |

## Information Architecture

```text
Access Control
├── ผู้ใช้งาน
│   ├── ข้อมูลบุคคล
│   ├── ฝ่าย
│   ├── สาขาที่เข้าถึง
│   ├── Role ที่ได้รับ
│   ├── สถานะบัญชี
│   └── Invite / Reset Password
│
├── Role และสิทธิ์
│   ├── Role ตามฝ่าย
│   ├── Permission ตามหน้าและ Action
│   ├── ขอบเขตสาขา
│   └── สิทธิ์รายบุคคล
│
└── Audit Log
    ├── การเปลี่ยนผู้ใช้
    ├── การเปลี่ยน Role/Permission
    ├── การเปลี่ยนสาขา
    └── Self-approval event
```

`/admin/users` เป็นหน้าจัดการตัวบุคคล ส่วน `/admin/roles-permissions` เป็นหน้าจัดการนโยบายสิทธิ์ ทั้งสองหน้าต้องใช้ filter, table, modal, wording, responsive behavior และ dark-mode tokens ชุดเดียวกัน แต่ไม่ควรรวม form ทุกอย่างไว้ใน modal เดียว

## User Administration

หน้าผู้ใช้งานรับผิดชอบเฉพาะ:

- เพิ่มและแก้ไขข้อมูลบุคคล
- กำหนดฝ่าย
- กำหนดสาขาที่เข้าถึง
- กำหนด Role ได้หลายรายการ
- เปิด/ปิดบัญชี
- ส่ง Invite และ Reset Password

ไม่ควรแก้ Permission รายบุคคลใน modal ผู้ใช้ เพราะจะทำให้มีจุดแก้ข้อมูลซ้ำกับหน้า Permission Matrix ให้แสดงสรุป Role และ effective permission ได้ แต่ให้การแก้ไขอยู่หน้า `Role และสิทธิ์` จุดเดียว

Activation flow ต้องไม่จบด้วยบัญชี `active` ที่ยังไม่มี credential ผู้ดูแลต้องเลือกส่งลิงก์ตั้งรหัสผ่านหรือสร้าง temporary password ให้เสร็จก่อนจบขั้นตอน

## Role And Permission Administration

Role เป็นชุดสิทธิ์ที่ใช้ซ้ำได้ ผู้ใช้หนึ่งคนสามารถมีหลาย Role และระบบรวมสิทธิ์จากทุก Role ก่อนคำนวณ override รายบุคคล

สิทธิ์แบ่งเป็นสองระดับ:

### หน้าทั่วไป

```text
ดู
จัดการ
```

### เอกสารสำคัญและการเงิน

```text
ดู
สร้าง
แก้ไข
ยกเลิก
เปิดบิล
อนุมัติ
จ่ายเงินจริง
ส่งออก
```

ตัวอย่าง action:

| เอกสาร | Action ที่ควบคุม |
|---|---|
| ใบรับของ/ใบส่งของ | ดู, สร้าง, แก้ไข, เปิดบิล |
| บิลซื้อ/บิลขาย | ดู, สร้าง, แก้ไข, ยกเลิก, อนุมัติ, เปิดจ่าย |
| PMA/PMT | ดู, สร้าง, แก้ไข, อนุมัติ, จ่ายเงินจริง |
| รายงาน | ดู, ส่งออก |

ปุ่มต้องแสดงตาม permission แต่ API ต้องตรวจ permission ซ้ำเสมอ ผู้ใช้ที่ไม่มี `เปิดบิล`, `อนุมัติ` หรือ `จ่ายเงินจริง` ต้องไม่สามารถเรียก endpoint โดยตรงเพื่อทำ action ได้

## Effective Permission

```text
effective permission
= permissions จากทุก Role
+ allow override รายบุคคล
- deny override รายบุคคล
```

ลำดับความสำคัญ:

1. `deny` รายบุคคล
2. `allow` รายบุคคล
3. `allow` จาก Role ใดก็ได้
4. ไม่พบสิทธิ์ = ไม่อนุญาต

UI ต้องแสดงสถานะของแต่ละ permission ให้แยกได้ชัดเจน:

- ตาม Role
- อนุญาตเพิ่ม
- ปิดสิทธิ์

ห้ามใช้ checkbox เดียวที่ทำให้ `ไม่เลือก`, `deny` และ `ไม่ได้รับจาก Role` ดูเหมือนกัน

## Branch Scope

Role กำหนดค่าเริ่มต้นด้านขอบเขตสาขา และ user mapping ระบุสาขาที่ผู้ใช้เข้าถึงได้จริง ระบบต้องใช้ขอบเขตเดียวกันกับทั้ง:

- รายการที่แสดง
- รายละเอียด
- การสร้างรายการ
- การแก้ไข/ยกเลิก
- การอนุมัติ
- การจ่ายเงินจริง
- รายงานและ export

การซ่อนข้อมูลใน UI ไม่เพียงพอ API ต้องตรวจ scope ทุกครั้ง และต้อง fail closed เมื่อไม่พบ mapping ที่อนุญาต

## Approval And Payment

ไม่มี approval amount limit และไม่มีการส่งต่อผู้อนุมัติตามยอดเงิน การอนุมัติควบคุมด้วย:

- ประเภทเอกสาร
- action permission `อนุมัติ`
- ขอบเขตสาขา
- สถานะของเอกสาร

ผู้สร้างสามารถอนุมัติเอกสารของตัวเองได้หากมีสิทธิ์ `อนุมัติ` แต่ระบบต้อง:

- แสดง warning ก่อนยืนยัน
- บันทึก `self_approval` ใน audit log
- ให้รายงานค้นหารายการ self-approval ได้

สิทธิ์ `จ่ายเงินจริง` แยกจาก `อนุมัติ` และผู้มีสิทธิ์จ่ายเงินจริงสามารถจ่ายได้ทุกวงเงิน แต่ยังต้องผ่านสถานะเอกสารและ branch scope ที่ถูกต้อง

## Administrator Separation

### User Administrator

- จัดการข้อมูลผู้ใช้
- กำหนดฝ่ายและสาขา
- กำหนด Role ที่ได้รับ
- เปิด/ปิดบัญชี
- Invite/Reset Password

### Security/Permission Administrator

- สร้าง/แก้ไข Role
- กำหนด Permission
- กำหนด allow/deny override
- เปลี่ยน action permission
- ตรวจสอบ audit และ self-approval report

ไม่ควรให้ User Administrator มอบ permission สำคัญให้ตนเองหรือแก้ policy ของระบบได้โดยอัตโนมัติ

## Audit Contract

การเปลี่ยนผู้ใช้, Role, Permission, branch mapping และการ self-approval ต้องบันทึก:

- actor
- target user/role/document
- event type
- before value
- after value
- reason หากเป็นการเปลี่ยน policy หรือ deny override
- timestamp
- request correlation/idempotency reference ถ้ามี

การเปลี่ยนสิทธิ์มีผลทันทีหลังบันทึกสำเร็จ และ audit ต้องเกิดในขอบเขต transaction เดียวกันเมื่อเป็นไปได้

## Error And Safety Rules

- ผู้ไม่มี permission ต้องได้ `403` ไม่ใช่ fallback ไปใช้สิทธิ์กว้างกว่า
- API ต้องตรวจ authentication, permission, branch scope และสถานะเอกสารตามลำดับ
- ห้ามปล่อยให้บัญชี active ที่ไม่มี credential จาก activation flow
- ห้ามลบ audit log จาก UI ปกติ
- การยกเลิก/ปิดใช้งานผู้ใช้ควรมี confirmation
- รายการการเงินต้องไม่อาศัยการซ่อนปุ่มเป็น security boundary

## Implementation Batches

1. ทำ shared Access Control shell และปรับ wording/layout ของสองหน้า
2. แยก User Administrator กับ Security/Permission Administrator
3. ปรับ Role assignment ให้รองรับหลาย Role ต่อผู้ใช้
4. ทำ permission catalog แบบ `ดู/จัดการ` และ action ละเอียดเฉพาะเอกสารสำคัญ
5. รวมจุดแก้ permission รายบุคคลไว้ที่หน้า Permission Matrix
6. สร้าง effective permission helper กลางและใช้กับ UI/API
7. แยก action permission สำหรับเปิดบิล, อนุมัติ และจ่ายเงินจริง
8. เพิ่ม branch-scope enforcement ให้ครบ list/detail/write/report/export
9. เพิ่ม self-approval warning/report และ audit contract
10. ปรับ activation flow และทดสอบ security regression

## Acceptance Criteria

- `/admin/users` และ `/admin/roles-permissions` ใช้ visual/interaction baseline เดียวกัน
- User Administrator ไม่สามารถแก้ Role policy หรือ permission catalog
- ผู้ใช้มีหลาย Role ได้ และระบบคำนวณ effective permission ถูกต้อง
- Deny รายบุคคลมีผลเหนือ Allow จากทุก Role
- ปุ่มเปิดบิล/อนุมัติ/จ่ายเงินจริงแสดงตาม action permission
- API ปฏิเสธ action ที่ไม่มี permission แม้เรียกตรง
- ขอบเขตสาขาถูกใช้กับ list, detail, write และ report/export
- Self-approval มี warning และ audit/report
- ไม่มีวงเงินหรือ escalation ตามยอดเงินใน approval flow
- Activation ไม่จบด้วยบัญชี active ที่ไม่มี credential
- Dark mode, mobile และ wording ผ่าน design baseline
