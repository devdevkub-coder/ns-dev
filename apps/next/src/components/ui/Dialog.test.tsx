import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DialogHeader } from './Dialog'

describe('Dialog header palette', () => {
  it('keeps the shared table-header palette over legacy sidebar-color classes', () => {
    const html = renderToStaticMarkup(
      <DialogHeader className="border-slate-800 bg-slate-900 text-white">
        <span>รายละเอียดเอกสาร</span>
      </DialogHeader>,
    )

    expect(html).toContain('!border-slate-200')
    expect(html).toContain('!bg-slate-100')
    expect(html).toContain('!text-slate-700')
  })
})
