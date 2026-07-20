import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ResizableTableHead } from './ResizableTableHead'

describe('ResizableTableHead alignment', () => {
  it('centers every label while retaining the body alignment metadata', () => {
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
    expect(html).toContain('justify-center')
    expect(html).toContain('text-center')
  })
})
