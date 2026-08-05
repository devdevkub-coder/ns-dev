import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { WeightTicketSaveProgress } from './WeightTicketSaveProgress'

describe('WeightTicketSaveProgress', () => {
  it('shows the stage status without replacing the form surface', () => {
    const html = renderToStaticMarkup(<WeightTicketSaveProgress stage="auto_save" type="WTO" />)

    expect(html).toContain('role="status"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('กำลังบันทึกแบบร่าง...')
  })

  it('uses the stock-specific message for WTO saves', () => {
    const html = renderToStaticMarkup(<WeightTicketSaveProgress stage="stock_check" type="WTO" />)

    expect(html).toContain('กำลังตรวจสอบ stock ทุกรายการ...')
  })

  it('renders nothing when no save is active', () => {
    expect(renderToStaticMarkup(<WeightTicketSaveProgress stage="idle" type="WTI" />)).toBe('')
  })
})
