# Production Delivery And Tool Connection Rules

กฎนี้ใช้กับ Production Git, Vercel, Supabase CLI/MCP, environment และการ promote จาก SIT

## Authority boundary

Production เป็น owner-controlled environment: ในทีมมีผู้ใช้ที่ได้รับอนุญาตให้แตะ Production ได้คนเดียว คือ owner ของ account `nserprich99-creator`

โดย default agent ต้องทำได้เฉพาะ read-only audit, comparison, preflight, เตรียมคำสั่ง และรายงาน blocker เท่านั้น ห้ามทำสิ่งต่อไปนี้เอง:

- `git push production-origin`, force-push, branch/tag/PR mutation หรือเปลี่ยน Production branch
- Vercel Production deploy, alias change, project/env write หรือ redeploy เพื่อแก้ปัญหาเอง
- Supabase Production migration, DDL/DML, data repair, Storage mutation หรือเปลี่ยน project setting
- สลับ credential, account หรือ MCP server ไป Production เพียงเพราะ SIT connector ใช้งานไม่ได้

ข้อยกเว้นต้องเป็นคำสั่งจากผู้ใช้โดยตรงในงานปัจจุบัน และยังต้องผ่าน preflight ในไฟล์นี้ครบถ้วน ห้ามตีความคำว่า `promote`, `release`, `deploy` หรือ `push` แบบกำกวมเป็นสิทธิ์ Production

## Production connection map ปัจจุบัน

ต้องตรวจค่าจริงซ้ำก่อนทุก operation เพราะ account, permission, deployment alias และ session อาจเปลี่ยนได้

| Layer | Source of truth | Production contract |
|---|---|---|
| Git remote | `git remote -v` | `production-origin` -> `https://github.com/nserprich99-creator/ns-erp.git` |
| Git branch | `git branch -vv` | target ต้องระบุชัด เช่น `production-origin/main`; ห้ามใช้ `preview` เป็น Production target โดยอนุมาน |
| GitHub push account | `gh auth status --hostname github.com` | `nserprich99-creator` เท่านั้นสำหรับ Production mutation |
| Commit source | `git show --no-patch --format=fuller <sha>` | ใช้ final SHA เดิมจาก SIT; ห้ามสร้าง Production commit ซ้ำ |
| Supabase runtime | `apps/next/.env.production.local` และ Vercel Production env | project `fhglqymcdmrgbsbadnwr` |
| Supabase MCP | `.mcp.json` | server `supabase` ชี้ Production project `fhglqymcdmrgbsbadnwr`; อ่าน scope และสิทธิ์จริงก่อนใช้ |
| Legacy source MCP | `.mcp.json` | `supabase-prod-source` project `mqsgptraslgpyzbpndlg`, read-only audit/source เท่านั้น; ไม่ใช่ Production target |
| Vercel | Vercel project/team/environment/deployment metadata | ต้องยืนยัน project, team, Production environment, source SHA และ live alias แยกกัน |

ห้ามพิมพ์ค่าลับจาก `.env.production.local`, Vercel env หรือ MCP credential ลง log และห้าม copy Production secret ไป SIT

## Production preflight: read-only first

ก่อนพิจารณา mutation ต้องตรวจและรายงาน:

```bash
git status --short --branch
git remote -v
git branch -vv
git var GIT_AUTHOR_IDENT
git var GIT_COMMITTER_IDENT
gh auth status --hostname github.com
git show --no-patch --format=fuller <sit-approved-sha>
git ls-remote production-origin refs/heads/main
```

ตรวจเพิ่ม:

1. remote, branch และ owner account ตรงกับ Production target
2. commit SHA ที่จะส่งตรงกับ SHA ที่ผ่าน SIT; ห้าม amend/rebase/cherry-pick/merge ใหม่ระหว่างทาง
3. Production env/project ref ถูกต้อง และไม่ใช้ legacy source project
4. Vercel connector/CLI login เป็น account/team ที่ถูกต้อง ไม่ใช่เพียง GitHub account ที่ login สำเร็จ
5. Supabase MCP/CLI ระบุ project ref `fhglqymcdmrgbsbadnwr` ชัดเจน และ operation scope ตรงกับคำสั่งที่ได้รับ
6. worktree และ intended diff ถูกจำแนกแล้ว; ห้าม push งานอื่นที่ค้างอยู่ร่วมกับ release

## Promote exact SHA

หลักการคือสร้าง commit ครั้งเดียวและส่ง object เดิม:

```text
final commit SHA
      -> SIT remote/deployment verification
      -> owner-approved Production push/deployment
```

การใช้ push account ต่างกันไม่ทำให้ SHA เปลี่ยน แต่ `amend`, `rebase`, `cherry-pick`, merge ใหม่ หรือแก้ author/committer จะสร้าง SHA ใหม่ ต้องกลับไปตรวจ SIT ใหม่ก่อนเสมอ

หลัง Production mutation ต้องแยกหลักฐานอย่างน้อย:

- Production remote SHA
- Vercel deployment source SHA และสถานะ `READY`
- live alias/domain ที่ชี้ deployment นั้น
- authenticated route, runtime health และ database connectivity ตาม scope ที่ได้รับอนุมัติ

Git push สำเร็จ, Vercel `READY` หรือ `/api/health` ตอบ `200` อย่างใดอย่างหนึ่ง ไม่ใช่หลักฐานแทนกัน

## MCP และ CLI connection failures

เมื่อ Production connection ใช้งานไม่ได้ ให้หยุดและจำแนกสาเหตุ ห้ามแก้ด้วยการเปลี่ยน target:

| อาการ | ต้องตรวจ | การกระทำที่อนุญาต |
|---|---|---|
| server/tool ไม่พบ | `.mcp.json` และเครื่องมือที่ expose ใน session | รายงานว่าไม่ configured/not loaded; ทำ read-only inventory ต่อได้ ห้ามเดา server อื่น |
| `401`/`403` | owner account, team, token/session และ permission | รายงาน auth blocker; ให้ owner re-authenticate เอง ห้าม copy token หรือสลับ account เงียบ ๆ |
| `404`/repository not found | remote URL, project ref, team และ active account | หยุด mutation แล้วรายงาน target mismatch |
| query ไม่พบข้อมูล | project ref, schema, scope, filter และ read-only boundary | ตรวจซ้ำด้วย target เดิมก่อนสรุปว่าไม่มีข้อมูล |
| Vercel deployment หาไม่เจอ | project/team/environment/source SHA | ตรวจ metadata แบบ read-only; ห้าม deploy ซ้ำเอง |

CLI ใช้แทน MCP ได้เฉพาะ read-only diagnosis หรือเมื่อผู้ใช้สั่ง delivery โดยตรง และต้องยืนยัน account/project ref ซ้ำ ไม่ถือเป็น fallback ไปยัง project อื่น

## Stop conditions และรายงาน

ต้องหยุดก่อน Production mutation เมื่อ:

- ไม่มีคำสั่งจาก owner ในงานปัจจุบัน
- owner/account, remote, branch, project ref หรือ team ไม่ตรงกัน
- SHA ไม่ตรงกับ SIT-approved SHA
- credential หรือ connector หาไม่เจอ/หมดอายุ/สิทธิ์ไม่พอ
- มี dirty worktree หรือ intended diff ยังจำแนกไม่ได้
- มีข้อเสนอให้ใช้ Production/legacy source เป็น fallback ของ SIT

รายงานต้องแยก `authorization`, `target`, `account`, `project ref`, `commit SHA`, `remote SHA`, `deployment SHA`, `live alias` และ `blocker` ออกจากกัน และห้าม claim ว่า Production สำเร็จจากหลักฐานของระบบเดียว
