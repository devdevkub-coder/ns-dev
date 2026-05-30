#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const categoryKeywords = {
  'web-engineering': ['react', 'vue', 'angular', 'svelte', 'nextjs', 'next.js', 'tailwind', 'frontend', 'html', 'css', 'browser', 'web', 'vite'],
  backend: ['backend', 'api', 'server', 'route handler', 'fastapi', 'django', 'express', 'node', 'graphql', 'rest'],
  database: ['database', 'sql', 'postgres', 'postgresql', 'mysql', 'mongodb', 'redis', 'orm', 'schema', 'query', 'prisma', 'supabase'],
  'ai-ml': ['llm', 'gpt', 'openai', 'ai', 'machine learning', 'embedding', 'rag', 'model'],
  'cloud-devops': ['docker', 'kubernetes', 'ci/cd', 'github actions', 'terraform', 'aws', 'azure', 'gcp', 'deployment', 'devops', 'serverless'],
  security: ['security', 'audit', 'vulnerability', 'authentication', 'authorization', 'jwt', 'oauth', 'rls', 'permission'],
  'testing-qa': ['test', 'testing', 'vitest', 'jest', 'cypress', 'playwright', 'quality', 'regression', 'coverage', 'e2e'],
  documentation: ['obsidian', 'markdown', 'adr', 'documentation', 'docs', 'notes', 'content'],
  migration: ['migration', 'modernize', 'legacy', 'refactor', 'schema mapping', 'cutover'],
  architecture: ['architecture', 'architect', 'adr', 'c4', 'domain-driven', 'ddd', 'decision record'],
  design: ['design', 'ui', 'ux', 'accessibility', 'a11y', 'visual', 'component'],
  'git-ci': ['git', 'github', 'gitlab', 'pull request', 'pr', 'ci', 'workflow', 'actions'],
  'project-workflow': ['planning', 'verification', 'handoff', 'project', 'context', 'estimate'],
}

const categoryOverrides = new Map(
  Object.entries({
    'architecture-decision-records': 'architecture',
    'architecture-patterns': 'architecture',
    architecture: 'architecture',
    'ask-questions-if-underspecified': 'project-workflow',
    'codebase-migrate': 'migration',
    'environment-setup-guide': 'project-workflow',
    'ns-scrap-erp-migration': 'migration',
    'ns-scrap-erp-quality-audit': 'testing-qa',
    pinia: 'web-engineering',
    'playwright-skill': 'testing-qa',
    'playwright-skill-antigravity': 'testing-qa',
    'privacy-by-design': 'security',
    'react-state-management': 'web-engineering',
    'site-architecture': 'architecture',
    'software-architecture': 'architecture',
    'typescript-advanced-types': 'web-engineering',
    'verification-before-completion': 'project-workflow',
  }),
)

const categoryOrder = [
  'web-engineering',
  'database',
  'security',
  'testing-qa',
  'backend',
  'architecture',
  'migration',
  'documentation',
  'git-ci',
  'cloud-devops',
  'design',
  'project-workflow',
  'ai-ml',
]

const stopwords = new Set([
  'skill',
  'skills',
  'tool',
  'tools',
  'builder',
  'expert',
  'guide',
  'workflow',
  'workflows',
  'system',
  'systems',
  'patterns',
  'setup',
  'using',
  'with',
  'for',
  'and',
  'the',
  'official',
])

function normalizeCategory(value) {
  if (value === null || value === undefined) return null
  const text = String(value)
    .trim()
    .toLowerCase()
    .replaceAll('_', '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return text || null
}

function parseScalar(value) {
  const text = value.trim()
  if (!text || text === 'null') return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1)
  }
  return text
}

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match) return {}

  const metadata = {}
  for (const line of match[1].split('\n')) {
    const item = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!item) continue
    metadata[item[1]] = parseScalar(item[2])
  }

  return metadata
}

function bodyWithoutFrontmatter(content) {
  return content.replace(/^---\s*\n[\s\S]*?\n---/, '').trim()
}

function inferDynamicCategory(id) {
  const tokens = id
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !stopwords.has(token))

  if (!tokens.length) return ['general', 0.2, 'fallback:general']

  return [normalizeCategory(tokens.at(-1)) ?? 'general', 0.34, `derived-from-id-token:${tokens.at(-1)}`]
}

function inferCategory(skillInfo, metadata, bodyText) {
  const overrideCategory = categoryOverrides.get(skillInfo.id)
  if (overrideCategory) {
    return [overrideCategory, 1, 'override:id']
  }

  const explicitCategory = normalizeCategory(metadata.category)
  if (explicitCategory && explicitCategory !== 'uncategorized') {
    return [explicitCategory, 1, 'frontmatter:category']
  }

  const primaryText = [skillInfo.id, skillInfo.name, skillInfo.description].join(' ').toLowerCase()
  const secondaryText = bodyText.toLowerCase()
  let bestCategory = null
  let bestScore = 0
  let bestHits = []

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    let score = 0
    const hits = []

    for (const keyword of keywords) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const exactPattern = new RegExp(`\\b${escaped}\\b`)
      if (exactPattern.test(primaryText)) {
        score += 6
        hits.push(keyword)
      } else if (keyword.length >= 5 && primaryText.includes(keyword)) {
        score += 3
        hits.push(keyword)
      } else if (exactPattern.test(secondaryText)) {
        score += 1
        hits.push(keyword)
      }
    }

    if (score > bestScore) {
      bestCategory = category
      bestScore = score
      bestHits = hits
    }
  }

  if (bestCategory) {
    return [bestCategory, Math.min(0.92, 0.4 + 0.04 * bestScore), `keyword-match:${bestHits.slice(0, 3).join(',')}`]
  }

  return inferDynamicCategory(skillInfo.id)
}

async function findSkillFile(skillDir) {
  for (const candidate of ['SKILL.md', 'SKILL.MD']) {
    const fullPath = path.join(skillDir, candidate)
    try {
      await readFile(fullPath, 'utf8')
      return fullPath
    } catch {
      // Try the next casing.
    }
  }

  return null
}

function validateIndexItem(item) {
  const required = ['id', 'path', 'category', 'name', 'description', 'risk', 'source', 'date_added']
  for (const key of required) {
    if (!(key in item)) throw new Error(`Missing required key "${key}" in ${item.id ?? 'unknown skill'}`)
  }

  if (!item.path.startsWith('skills/')) {
    throw new Error(`Invalid skill path "${item.path}" for ${item.id}`)
  }
}

async function generateIndex({ outputFile, skillsDir, sourceLabel }) {
  const entries = await readdir(skillsDir, { withFileTypes: true })
  const skills = []

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue

    const skillDir = path.join(skillsDir, entry.name)
    const skillFile = await findSkillFile(skillDir)
    if (!skillFile) continue

    const content = await readFile(skillFile, 'utf8')
    const metadata = parseFrontmatter(content)
    const bodyText = bodyWithoutFrontmatter(content)
    const id = entry.name
    const description = String(metadata.description ?? '').trim()
    const skillInfo = {
      id,
      path: `skills/${id}`,
      name: String(metadata.name ?? id).trim() || id,
      description,
    }
    const [category, categoryConfidence, categoryReason] = inferCategory(skillInfo, metadata, bodyText)
    const item = {
      id,
      path: skillInfo.path,
      category,
      name: skillInfo.name,
      description,
      risk: String(metadata.risk ?? 'unknown'),
      source: String(metadata.source ?? sourceLabel),
      date_added: metadata.date_added ?? null,
      category_confidence: Number(categoryConfidence.toFixed(2)),
      category_reason: categoryReason,
    }

    validateIndexItem(item)
    skills.push(item)
  }

  skills.sort((left, right) => {
    const leftIndex = categoryOrder.indexOf(left.category)
    const rightIndex = categoryOrder.indexOf(right.category)
    const leftRank = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex
    const rightRank = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex

    return leftRank - rightRank || left.category.localeCompare(right.category) || left.id.localeCompare(right.id)
  })
  await mkdir(path.dirname(outputFile), { recursive: true })
  await writeFile(outputFile, `${JSON.stringify(skills, null, 2)}\n`)

  return skills
}

async function writeSummary(outputFile, skills) {
  const counts = new Map()
  for (const skill of skills) {
    counts.set(skill.category, (counts.get(skill.category) ?? 0) + 1)
  }

  const lines = [
    '# Skills Index Summary',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Total skills: ${skills.length}`,
    '',
    '## Categories',
    '',
    '| Category | Count |',
    '| --- | ---: |',
    ...[...counts.entries()].map(([category, count]) => `| ${category} | ${count} |`),
    '',
    '## Skills',
    '',
    '| Category | Skill | Risk | Source | Reason |',
    '| --- | --- | --- | --- | --- |',
    ...skills.map((skill) => `| ${skill.category} | ${skill.id} | ${skill.risk} | ${String(skill.source).replaceAll('|', '\\|')} | ${skill.category_reason} |`),
    '',
  ]

  await writeFile(outputFile.replace(/\.json$/, '.summary.md'), `${lines.join('\n')}\n`)
}

function parseArgs() {
  const args = new Set(process.argv.slice(2))
  const repoRoot = process.cwd()
  const outputDir = path.join(repoRoot, 'codex/skills')

  if (args.has('--global')) {
    const home = process.env.HOME
    if (!home) throw new Error('HOME is required to index global skills.')
    return {
      outputFile: path.join(outputDir, 'global-skills-index.json'),
      skillsDir: path.join(home, '.codex/skills'),
      sourceLabel: 'global-codex',
    }
  }

  return {
    outputFile: path.join(outputDir, 'project-skills-index.json'),
    skillsDir: path.join(repoRoot, '.agents/skills'),
    sourceLabel: 'project',
  }
}

const options = parseArgs()
const skills = await generateIndex(options)
await writeSummary(options.outputFile, skills)
console.log(`Generated ${skills.length} skills -> ${path.relative(process.cwd(), options.outputFile)}`)
