# 03 Target Architecture

## Architecture Direction

แนวทางเป้าหมายคือ `refactor system` ไม่ใช่ full rewrite:
- preserve business flow เดิม
- improve maintainability
- improve data model correctness
- reduce hidden coupling

## Application Stack

- Vue 3
- Vite
- TypeScript
- Vue Router
- Pinia
- TanStack Query
- Tailwind CSS
- Zod
- VueUse
- Supabase Auth / Postgres / Storage

## Application Layers

```text
src/
  router/
  views/
  components/
  stores/
  composables/
  services/
  queries/
  schemas/
  lib/
```

## Layer Responsibilities

### Views

- page layout
- page composition
- route-level interaction

### Components

- reusable UI units
- forms
- tables
- dialogs

### Stores

- client state only
- auth context
- branch context
- UI state

### Queries / Services

- read and write data access
- Supabase queries
- mutation orchestration
- cache invalidation

### Schemas

- Zod validation
- form schemas
- import payload schemas

### Business Logic

- ไม่ปะปนอยู่ใน template
- แยกเป็น service/composable layer
- ต้อง test ได้

## Data Architecture Direction

- auth source of truth = `auth.users`
- app identity = `app_users`
- role model = normalized
- transaction model = header + lines
- inventory = event/transaction based
- reports = derived layer

## API Direction

ระยะต้น:
- frontend คุย Supabase ได้
- แต่ต้องมี service/query abstraction

ระยะถัดไป:
- ใช้ Edge Functions หรือ API layer สำหรับ flow ที่ sensitive หรือซับซ้อน

## Key Design Rules

- ไม่เก็บ password ไว้ใน application table
- ไม่เก็บ line items หลักใน jsonb ถ้าต้อง query/reconcile
- ทุก transaction สำคัญต้อง trace ย้อนกลับได้
- config สำคัญต้องอยู่ใน DB และมี owner ชัด
