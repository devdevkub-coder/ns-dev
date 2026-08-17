# SIT Delivery And Tool Connection Rules

กฎนี้ใช้กับงานที่เกี่ยวกับ SIT ทั้งหมด: commit, push, deploy, migration, Supabase CLI, Vercel CLI และ MCP connector
การแก้ไขหรือส่งต่อ Production ไม่อยู่ในขอบเขตของไฟล์นี้ ให้หยุดที่การเตรียมและรายงาน SHA แล้วอ่าน `production-delivery.md`

## เป้าหมาย

- ทำให้ commit ที่ผ่าน SIT พร้อมส่งต่อให้เจ้าของ Production ใช้ commit SHA เดิมได้จริง
- แยกให้ชัดระหว่าง commit identity, GitHub push account, Supabase account/project และ Vercel account/project
- ป้องกันการใช้ connector หรือ env ของ Production กับ SIT เพราะชื่อ server, project หรือ account คล้ายกัน
- เมื่อ connection หาไม่เจอ ให้แยกปัญหาเป็น configuration, session, credential, permission หรือ target mismatch ก่อนสรุปว่า application/DB มีปัญหา

## SIT connection map ปัจจุบัน

ต้องตรวจค่าจริงซ้ำก่อนการ mutate ทุกครั้ง เพราะ account, alias และ session อาจเปลี่ยนได้

| Layer | Source of truth | SIT contract |
|---|---|---|
| Git remote | `git remote -v` | `sit-origin` -> `https://github.com/devdevkub-coder/ns-dev.git` |
| Git branch | `git branch -vv` | local `main` -> `sit-origin/main` |
| GitHub push account | `gh auth status --hostname github.com` | `devdevkub-coder` ต้องเป็น account ที่ active และมีสิทธิ์กับ SIT remote |
| Supabase runtime | `apps/next/.env.local`, `apps/next/.env.sit.local` | project `vbjlkxbytccklhqvxjuu` |
| Supabase MCP ใน project config | `.mcp.json` | server `supabase` ปัจจุบันชี้ Production `fhglqymcdmrgbsbadnwr`; ห้ามตีความว่าเป็น SIT |
| Legacy Supabase MCP | `.mcp.json` | `supabase-prod-source` เป็น read-only legacy source; ห้ามใช้กับ SIT |
| Vercel runtime | Vercel project/environment และ deployment metadata | ต้องตรวจ project, team, environment และ source SHA จาก connection จริงก่อน deploy SIT |

`apps/next/.env.production.local` เป็น Production env ห้ามโหลดหรือใช้เป็นฐานสำหรับ SIT
และ `.env.sit.local` ไม่ควรถูกถือว่า framework โหลดให้อัตโนมัติ ต้องตรวจ command/loader ที่ใช้จริงเสมอ

## Identity contract

### Commit identity

- สร้าง final commit เพียงครั้งเดียวก่อน delivery chain
- `author`/`committer` เป็น metadata ของ commit และไม่ต้องสลับตาม remote ทุกครั้งที่ promote
- ถ้า commit ถูกสร้างด้วย Production release identity เช่น `nserprich99-creator` ให้คง identity นั้นไว้ตลอด chain
- ห้าม `amend`, `rebase`, `cherry-pick` หรือสร้าง commit Production ซ้ำเพียงเพื่อเปลี่ยนชื่อ user เพราะจะทำให้ SHA เปลี่ยน
- ตรวจด้วย `git var GIT_AUTHOR_IDENT` และ `git var GIT_COMMITTER_IDENT`; อย่าใช้ global `git config` เป็นหลักฐานเพียงอย่างเดียว เพราะ local repo config มี precedence

### Push identity

- SIT ใช้ GitHub account ที่มีสิทธิ์กับ `sit-origin` เช่น `devdevkub-coder`
- push account ไม่จำเป็นต้องเหมือน commit author/committer แต่ต้องตรงกับ remote และ target ที่กำลัง mutate
- GitHub account, Supabase account และ Vercel account เป็นคนละ trust boundary ห้ามอนุมานว่าการ login ระบบหนึ่งทำให้อีกระบบ login แล้ว

## SIT preflight ก่อน fetch, commit, push, deploy หรือ migration

ต้องตรวจและรายงานอย่างน้อย:

```bash
git status --short --branch
git remote -v
git branch -vv
git var GIT_AUTHOR_IDENT
git var GIT_COMMITTER_IDENT
gh auth status --hostname github.com
```

จากนั้นจึงตรวจ:

1. `sit-origin` ชี้ไปยัง repository ที่ถูกต้อง และ branch ปลายทางคือ `main`
2. local worktree มีไฟล์ใด modified/untracked และไฟล์ใดเป็นงานของผู้ใช้ งานที่ตั้งใจส่ง หรือ generated artifact
3. `git fetch sit-origin main` แล้วเปรียบเทียบ ancestry/diff ก่อนแก้ไขและก่อน push
4. env ที่ใช้ทดสอบอ่านไปยัง Supabase project `vbjlkxbytccklhqvxjuu` โดยตรวจเฉพาะชื่อ variable, host และ project ref; ห้ามพิมพ์ password, token, service key หรือค่าลับลง log
5. account ที่ active มีสิทธิ์ตรงกับ target; ถ้าเป็น account ผิดให้หยุดและรายงาน ห้ามสลับ credential แบบเงียบ ๆ
6. ถ้าเป็น migration ให้ยืนยัน project ref ของ Supabase CLI/MCP อีกครั้ง และใช้ SIT เท่านั้น

ห้าม push จาก dirty worktree ที่ยังจำแนกไฟล์ไม่ได้ ห้ามซ่อนงานด้วย stash แล้วไม่ตรวจ untracked files และห้ามใช้ `origin` เป็น push target

## MCP และ CLI connection preflight

ก่อนเรียก tool ให้ตรวจตามลำดับนี้:

1. อ่าน `AGENTS.md` และ rule ที่เกี่ยวข้อง
2. อ่าน `.mcp.json` เพื่อดู server name, transport, URL/project ref, read-only boundary และ project scope
3. อ่าน `docs/migration/10-environment-status.md` เพื่อเทียบ project ref/env ที่เป็น source of truth
4. ตรวจ auth/session ของ CLI หรือ connector ที่จะใช้กับ target นั้นโดยตรง
5. ตรวจว่า tool/server นั้นถูก expose ใน session ปัจจุบันจริง ไม่ใช่เพียงมีชื่ออยู่ใน `.mcp.json`
6. ทดสอบด้วย read-only operation ที่ระบุ target ชัดก่อนทำ write

`description` ของ MCP server เป็น routing hint ไม่ใช่หลักฐานว่า login สำเร็จหรือมีสิทธิ์กับ project นั้น
ห้ามค้นหา connection จาก global config แล้วนำมาใช้แทน project config โดยไม่ตรวจ scope เพราะอาจเชื่อมผิด repository, vault, team หรือ database

### เมื่อหา connector หรือข้อมูล connection ไม่เจอ

ให้จัดประเภทก่อนแก้:

| อาการ | ความหมายที่ต้องตรวจ | การดำเนินการ |
|---|---|---|
| ไม่มี server ใน `.mcp.json` | project นี้ยังไม่ได้ route connector นั้น | ใช้ approved CLI ที่ระบุ project ref ชัด หรือรายงานว่าต้องเพิ่ม project config; ห้ามเดา server อื่น |
| มีใน `.mcp.json` แต่ไม่มี tool ใน session | server ยังไม่ถูก load/expose หรือ session stale | reconnect/reload connector แล้วตรวจซ้ำ; ห้ามเปลี่ยนไปใช้ Production server แทน |
| `401`/`403` | session หมดอายุ, account ผิด หรือ permission ไม่พอ | ตรวจ account และ scope ของระบบนั้นโดยตรง; ห้าม copy token ข้าม environment |
| `404`, repository/project not found | URL, project ref, team หรือ account ไม่ตรง | ตรวจ remote/project ref และ login account; ห้ามสร้าง project หรือเปลี่ยน target เพื่อให้คำสั่งผ่าน |
| tool มีอยู่แต่ query ไม่พบข้อมูล | อาจเป็น wrong project, schema, scope หรือ filter | ตรวจ project ref และ read-only identity ก่อนสรุปว่าไม่มีข้อมูล |
| CLI ใช้ project เดิมโดยไม่ถาม | local link/context ค้างจากงานก่อน | ใช้ explicit target/project ref และรายงาน context; ห้าม relink หรือ overwrite context เงียบ ๆ |

การใช้ CLI แทน MCP ทำได้เมื่อ MCP ใช้งานไม่ได้ แต่ถือเป็นการเปลี่ยนช่องทาง ไม่ใช่การเปลี่ยน target: ต้องยืนยัน account, project ref, branch และ read/write scope ซ้ำทุกครั้ง

## SIT delivery sequence

1. ทำงานและตรวจด้วย SIT env/DB เท่านั้น
2. สร้าง final commit ครั้งเดียว พร้อมตรวจ author/committer และ intended diff
3. push commit SHA เดิมไป `sit-origin/main`
4. ตรวจ `git ls-remote sit-origin refs/heads/main` ให้ตรงกับ SHA ที่ตั้งใจส่ง
5. deploy ผ่าน Vercel/CLI/MCP หลังยืนยัน account, project, environment และ source SHA
6. ตรวจ deployment source SHA และ live alias แยกจากผลสำเร็จของ Git push
7. เมื่อ SIT ผ่าน ให้ส่งมอบ commit SHA เดิมให้ผู้มีสิทธิ์ Production; ห้ามทำ Production mutation จากกฎไฟล์นี้

ตัวอย่าง proof ที่ต้องเก็บ:

```bash
git show --no-patch --format=fuller <commit-sha>
git ls-remote sit-origin refs/heads/main
```

Git push สำเร็จไม่ได้แปลว่า Vercel deploy สำเร็จ และ deployment `READY` ไม่ได้แปลว่า authenticated route หรือ database runtime ผ่านแล้ว

## Stop conditions และรูปแบบรายงาน

ให้หยุดก่อน mutate เมื่อเกิดกรณีใดกรณีหนึ่ง:

- remote, branch, account หรือ project ref ไม่ตรงกัน
- commit SHA ที่จะส่งยังไม่ชัด หรือมีการสร้าง commit ซ้ำหลัง SIT validation
- dirty worktree ยังจำแนกไม่ได้
- MCP/CLI เชื่อมผิด project, ไม่มีสิทธิ์ หรือไม่ยืนยันว่าเป็น SIT
- มีการขอใช้ fallback ไปยัง Production/legacy source เพียงเพราะ SIT connector ใช้งานไม่ได้

รายงานให้แยกอย่างน้อย `target`, `remote/project ref`, `auth account`, `commit SHA`, `remote SHA`, `deployment SHA`, `live URL` และ `blocker` ออกจากกัน ห้ามรายงานว่า "เชื่อมต่อได้" จากหลักฐานของระบบหนึ่งแทนอีกระบบหนึ่ง
