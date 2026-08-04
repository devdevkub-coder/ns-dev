/**
 * QA Script: ทดสอบฟอนต์ไทยของ @react-pdf/renderer
 *
 * เป็น GATE สำคัญของ Batch 1 — ต้อง QA ผ่านก่อนเขียน template เต็ม (Batch 2)
 * เพราะ react-pdf มี known issue เรื่องฟอนต์ไทย (โดยเฉพาะ Sara Am ำ)
 *
 * วิธีรัน:
 *   npx tsx scripts/qa-thai-font.tsx
 *
 * ผลลัพธ์:
 *   - ไฟล์ scratch/qa-thai-font.pdf (เปิดด้วยตาเพื่อตรวจ)
 *   - ถ้าผ่าน → ฟอนต์ปลอดภัยพอใช้ใน template จริง
 *   - ถ้าพัง → หยุดและแก้ก่อนไปต่อ
 *
 * ตรวจครบทุกกรณีที่เสี่ยง (อ้างอิง GitHub react-pdf issues):
 *   - Sara Am (ำ) — Issue #3295 (CRITICAL, ต้องมี shim)
 *   - วรรณยุกต์ (่ ้ ๊ ๋) — ตำแหน่งอาจไม่ตรง
 *   - สระซ้อน (เ_ีย, ัว, ือ) — อ่านได้แต่อาจไม่สวย
 *   - คำทั่วไปที่พบในใบชั่งจริง (น้ำหนัก, สิ่งเจือปน, ฯลฯ)
 */

import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from '@react-pdf/renderer'
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeThai } from '../src/lib/server/pdf/thai-text'

const FONT_FAMILY = 'NotoSansThai'

/**
 * Register font สำหรับ QA script ตรง ๆ (ไม่ผ่าน fonts.ts เพราะมี server-only import
 * ที่ throw เมื่อรันผ่าน tsx ตรง ๆ ไม่ใช่ Next runtime)
 */
async function registerFontsForQa() {
  const candidates = [
    join(process.cwd(), 'public/fonts'),
    join(process.cwd(), 'apps/next/public/fonts'),
  ]
  const fontDir = candidates.find((p) => existsSync(join(p, 'NotoSansThai-Regular.ttf')))
  if (!fontDir) {
    throw new Error(`ไม่พบฟอนต์ที่: ${candidates.join(', ')}`)
  }
  const [regular, bold] = await Promise.all([
    readFile(join(fontDir, 'NotoSansThai-Regular.ttf')),
    readFile(join(fontDir, 'NotoSansThai-Bold.ttf')),
  ])
  // react-pdf 4.5.1 ไม่ยอมรับ Buffer ตรง ๆ — ใช้ data URL (base64) แทน
  // (เป็นรูปแบบที่รองรับกันทั่วไปที่สุดและไม่มี path resolution issue)
  const regularDataUrl = `data:font/ttf;charset=utf-8;base64,${regular.toString('base64')}`
  const boldDataUrl = `data:font/ttf;charset=utf-8;base64,${bold.toString('base64')}`
  Font.register({
    family: FONT_FAMILY,
    fonts: [
      { src: regularDataUrl, fontWeight: 400 },
      { src: boldDataUrl, fontWeight: 700 },
    ],
  })
  Font.registerHyphenationCallback((word) => [word])
}

const styles = StyleSheet.create({
  page: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    padding: 32,
    paddingBottom: 48,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 16,
    color: '#14532d',
  },
  subtitle: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 20,
  },
  section: {
    marginBottom: 18,
    padding: 12,
    border: '1pt solid #cbd5e1',
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#475569',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'baseline',
  },
  label: {
    width: 220,
    fontSize: 10,
    color: '#64748b',
  },
  value: {
    flex: 1,
    fontSize: 12,
    color: '#0f172a',
  },
  pass: { color: '#059669', fontWeight: 700 },
  fail: { color: '#dc2626', fontWeight: 700 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 32,
    right: 32,
    fontSize: 9,
    color: '#94a3b8',
    textAlign: 'center',
  },
})

function TestCase({ label, raw, normalized }: { label: string; raw: string; normalized: string }) {
  const wasNormalized = raw !== normalized
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>
        {normalized}
        {wasNormalized ? <Text style={styles.pass}> ✓ shim</Text> : null}
      </Text>
    </View>
  )
}

function ThaiFontQaDocument() {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>QA: ฟอนต์ไทย @react-pdf/renderer</Text>
        <Text style={styles.subtitle}>
          เปิดไฟล์นี้แล้วตรวจสายตาทุกบรรทัด — ถ้าตัวอักษรขาด/ซ้อนทับ/เป็นกล่อง แปลว่าฟอนต์พัง ห้ามเอาไปใช้ใน template จริง
        </Text>

        {/* Section 1: Sara Am (ำ) — CRITICAL, Issue #3295 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Sara Am (ำ) — Issue #3295 [CRITICAL]</Text>
          <TestCase label="น้ำหนัก (raw)" raw="น้ำหนัก" normalized="น้ำหนัก" />
          <TestCase label="น้ำหนัก (shim)" raw="น้ำหนัก" normalized={normalizeThai('น้ำหนัก')} />
          <TestCase label="น้ำหนักรวม (raw)" raw="น้ำหนักรวม" normalized="น้ำหนักรวม" />
          <TestCase label="น้ำหนักรวม (shim)" raw="น้ำหนักรวม" normalized={normalizeThai('น้ำหนักรวม')} />
          <TestCase label="คำนวณ (raw)" raw="คำนวณ" normalized="คำนวณ" />
          <TestCase label="คำนวณ (shim)" raw="คำนวณ" normalized={normalizeThai('คำนวณ')} />
          <TestCase label="ทำการ (shim)" raw="ทำการ" normalized={normalizeThai('ทำการ')} />
          <TestCase label="รวมทั้งหมด (shim)" raw="รวมทั้งหมด" normalized={normalizeThai('รวมทั้งหมด')} />
        </View>

        {/* Section 2: วรรณยุกต์ (tone marks) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. วรรณยุกต์ (ไม้เอก โท ตรี จัตวา)</Text>
          <TestCase label="ไม้เอก (่)" raw="" normalized={'หอน่ะ สวัสดี่'} />
          <TestCase label="ไม้โท (้)" raw="" normalized={'น้ำ ก้น ป้าย'} />
          <TestCase label="ไม้ตรี (๊)" raw="" normalized={'ต๊อน ข๊าย'} />
          <TestCase label="ไม้จัตวา (๋)" raw="" normalized={'ฉันเจ๋ง โชว์'} />
          <TestCase label="ผสม" raw="" normalized={'สวัสดีครับ อร่อยจัง'} />
        </View>

        {/* Section 3: สระซ้อน (consonant + vowel stacking) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. สระซ้อน (เ_ีย, ัว, ือ, เ_ือ)</Text>
          <TestCase label="เีย เียะ" raw="" normalized={'เทียง เลียะ'} />
          <TestCase label="ัว" raw="" normalized={'รักษา ตัว นักเรียน'} />
          <TestCase label="ือ เือ" raw="" normalized={'เมือง เขือ ตื่น'} />
          <TestCase label="สระประสม" raw="" normalized={'ใบชั่งน้ำหนัก ใบรับสินค้า'} />
        </View>

        {/* Section 4: คำที่ใช้จริงในใบชั่ง */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. คำที่ใช้จริงในใบชั่งน้ำหนัก</Text>
          <TestCase label="หัวข้อเอกสาร" raw="" normalized={'ใบชั่งน้ำหนัก / ใบรับสินค้า'} />
          <TestCase label="ผู้ขาย/ผู้ส่งของ" raw="" normalized={'ผู้ขาย/ผู้ส่งของ'} />
          <TestCase label="ทะเบียนรถ" raw="" normalized={'ทะเบียนรถ กข-1234'} />
          <TestCase label="พนักงานชั่ง" raw="" normalized={'พนักงานชั่ง'} />
          <TestCase label="น้ำหนักสุทธิ" raw="" normalized={normalizeThai('น้ำหนักสุทธิ')} />
          <TestCase label="หักภาชนะ" raw="" normalized={'หักภาชนะ'} />
          <TestCase label="หักสิ่งเจือปน" raw="" normalized={'หักสิ่งเจือปน'} />
          <TestCase label="น้ำหนักหลังหักภาชนะ" raw="" normalized={normalizeThai('น้ำหนักหลังหักภาชนะ')} />
          <TestCase label="รวมสินค้า" raw="" normalized={'รวมสินค้า'} />
          <TestCase label="ซื้อเพิ่มจากสิ่งเจือปน" raw="" normalized={'ซื้อเพิ่มจากสิ่งเจือปน'} />
        </View>

        {/* Section 5: ตัวเลข + หน่วย */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. ตัวเลข + หน่วย</Text>
          <TestCase label="น้ำหนัก กก." raw="" normalized={normalizeThai('1,234.50 กก.')} />
          <TestCase label="เปอร์เซ็นต์" raw="" normalized={'12.5%'} />
          <TestCase label="วันที่ไทย" raw="" normalized={'27/06/2569'} />
        </View>

        <Text style={styles.footer}>
          NS Scrap ERP — QA Thai Font v1.0.0 · เปิดด้วย Adobe Reader/Edge แล้วตรวจทุกบรรทัด
        </Text>
      </Page>
    </Document>
  )
}

async function main() {
  console.log('[qa-thai-font] Registering fonts...')
  await registerFontsForQa()

  console.log('[qa-thai-font] Rendering test PDF...')
  const buffer = await renderToBuffer(<ThaiFontQaDocument />)

  const outDir = join(process.cwd(), 'scratch')
  await mkdir(outDir, { recursive: true })
  const outPath = join(outDir, 'qa-thai-font.pdf')
  await writeFile(outPath, buffer)

  console.log(`[qa-thai-font] ✅ PDF saved to: ${outPath}`)
  console.log('[qa-thai-font] 👉 เปิดไฟล์ด้วยตาแล้วตรวจทุกบรรทัด:')
  console.log('    - ถ้าตัวอักษรขาด/ซ้อน/กล่องว่าง = ฟอนต์พัง ต้องแก้ก่อนไปต่อ')
  console.log('    - ถ้าอ่านได้ปกติทุกบรรทัด = ฟอนต์ปลอดภัย ไป Batch 2 ได้')
}

main().catch((err) => {
  console.error('[qa-thai-font] ❌ FAILED:', err)
  process.exit(1)
})
