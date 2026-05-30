# Codex Skills Inventory

โฟลเดอร์นี้แยกไว้สำหรับไฟล์สรุปและ manifest ของ Codex skills โดยเฉพาะ เพื่อไม่ให้ปนกับไฟล์ระบบ ERP หลัก

## Files

- `project-skills-index.json`
- `project-skills-index.summary.md`
- `global-skills-index.json`
- `global-skills-index.summary.md`

## Generate

```bash
npm run skills:index
npm run skills:index:global
```

## Scope

- project-level skills จริงอยู่ที่ `.agents/skills/`
- global skills จริงอยู่ที่ `~/.codex/skills/`
- โฟลเดอร์นี้เก็บเฉพาะ inventory ที่ใช้ตรวจสอบและแชร์ให้คนอื่นติดตั้งตาม
