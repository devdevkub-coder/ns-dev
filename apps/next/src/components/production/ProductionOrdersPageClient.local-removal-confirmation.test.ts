import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(fileURLToPath(new URL('./ProductionOrdersPageClient.tsx', import.meta.url)), 'utf8').replaceAll('\r\n', '\n')

describe('ProductionOrdersPageClient local draft removal safety', () => {
  it('asks before removing staged input, output, and WIP draft rows', () => {
    for (const handler of ['requestRemoveInputDraft', 'requestRemoveOutputDraft', 'requestRemoveOutputWipDraft']) {
      expect(source).toContain(`function ${handler}`)
    }

    expect(source).toContain("title: 'ยืนยันการลบรายการวัตถุดิบ'")
    expect(source).toContain("title: 'ยืนยันการลบรายการผลผลิต'")
    expect(source).toContain("title: 'ยืนยันการลบวัตถุดิบใน WIP'")
  })

  it('only asks before clearing a populated new output or WIP entry', () => {
    expect(source).toContain('function requestClearOutputWipDraft()')
    expect(source).toContain('function requestClearOutputEntry()')
    expect(source).toContain('Boolean(outputForm.sourceKey || outputForm.sourceWipQty)')
    expect(source).toContain('Boolean(outputForm.lotNo || outputForm.lossQty || outputForm.netQty)')
  })

  it('uses the guarded handlers from every visible local delete button', () => {
    expect(source).toContain('onClick={() => requestRemoveInputDraft(index)}')
    expect(source).toContain('onClick={() => requestRemoveOutputWipDraft(draft.id)}')
    expect(source).toContain('onClick={requestClearOutputWipDraft}')
    expect(source).toContain('onRemove={requestRemoveOutputDraft}')
    expect(source).toContain('onClick={requestClearOutputEntry}')
  })
})
