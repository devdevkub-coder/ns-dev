import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ResizableTableHead } from './ResizableTableHead'

describe('ResizableTableHead alignment', () => {
  it('aligns the header label and sort control with the column data', () => {
    const html = renderToStaticMarkup(
      <table>
        <thead>
          <tr>
            <ResizableTableHead
              activeSortKey="amount"
              align="right"
              direction="asc"
              label="ยอดรวม"
              sortKey="amount"
              onSort={() => undefined}
            />
          </tr>
        </thead>
      </table>,
    )

    expect(html).toContain('data-column-align="right"')
    expect(html).toContain('justify-end')
    expect(html).toContain('text-right')
    expect(html).toContain('p-2 pr-3')
  })
})
