# Install Codex Skills

ไฟล์นี้ใช้สำหรับให้เพื่อนติดตั้ง Codex skills ตามเครื่องนี้

## 1. ดึง repo ล่าสุด

```bash
git pull
```

## 2. ดูรายการ skills ที่โปรเจกต์นี้ใช้

เปิดไฟล์:

- `codex/skills/project-skills-index.summary.md`
- `codex/skills/global-skills-index.summary.md`

## 3. สร้าง inventory ของเครื่องตัวเอง

รันจาก root ของ repo:

```bash
npm run skills:index
npm run skills:index:global
```

ผลลัพธ์จะถูกเขียนกลับมาที่โฟลเดอร์ `codex/skills/`

## 4. สิ่งที่ต้องมี

- project-level skills
  - มาพร้อม repo อยู่แล้วใน `.agents/skills/`
  - ไม่ต้องติดตั้งเพิ่ม ถ้า clone/pull repo นี้ครบ
- global skills
  - ต้องมีอยู่ใน `~/.codex/skills/`
  - ให้เทียบกับ `codex/skills/global-skills-index.summary.md`

## 5. วิธีเช็กว่าเครื่องตัวเองขาดอะไร

- เปิด `codex/skills/global-skills-index.summary.md`
- เทียบกับโฟลเดอร์ `~/.codex/skills/` ของตัวเอง
- skill ที่ไม่มีในเครื่อง ให้ติดตั้งเพิ่มตาม source ของ skill นั้น

## 6. หมายเหตุ

- `project-skills-index.*` ใช้สรุป skill เฉพาะ repo นี้
- `global-skills-index.*` ใช้สรุป skill ระดับเครื่องของคนที่ตั้งค่า Codex ไว้
- ถ้าจะให้ตรงกับเครื่องต้นทางที่สุด ให้ mirror global skills ตามรายการในไฟล์ summary
