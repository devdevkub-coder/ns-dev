import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const list = execSync(`grep -rln "from '@/lib/server/xlsx'" src/app/api --include=route.ts`, { encoding: 'utf8' })
  .trim().split('\n')

for (const f of list) {
  const lines = readFileSync(f, 'utf8').split('\n')
  const usages = []
  lines.forEach((l, i) => {
    if ((l.includes('XLSX.') || l.includes('applyWorksheetTableLayout(')) && !l.includes('import')) usages.push(i + 1)
  })
  // find enclosing function for first usage (walk backwards for the nearest function signature)
  let fn = '?'
  if (usages.length > 0) {
    for (let i = usages[0] - 2; i >= 0; i--) {
      const line = lines[i]
      const m = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/) ||
        line.match(/^\s*const\s+(\w+)\s*=\s*(?:async\s*)?\(/)
      if (m) { fn = (m[1] || m[2]) + (line.includes('async') ? ' [async]' : ''); break }
    }
  }
  const short = f.replaceAll('\\', '/').split('/src/app/api/')[1] ?? f
  console.log(`${short} | usages: ${usages.length} | enclosing: ${fn}`)
}
