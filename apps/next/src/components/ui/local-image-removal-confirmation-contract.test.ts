import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('local image removal confirmation contract', () => {
  it('routes every requested local image deletion through the shared confirmation before its existing state mutation', () => {
    const adminUsers = source('../../app/admin/users-permissions/AdminUsersPageClient.tsx')
    const products = source('../master-data/products/ProductsPageClient.tsx')
    const impurityProducts = source('../master-data/impurity-products/ImpurityProductsPageClient.tsx')
    const advancePayments = source('../purchase-flow/AdvancePaymentsPageClient.tsx')

    expect(adminUsers).toMatch(/function requestRemoveProfileImage\(\) \{[\s\S]*?requestConfirmation\(\{[\s\S]*?onConfirm: removeProfileImage,/)
    expect(adminUsers).toContain('onClick={requestRemoveProfileImage}')

    for (const productForm of [products, impurityProducts]) {
      expect(productForm).toMatch(/function requestRemoveProductImage\(\) \{[\s\S]*?requestConfirmation\(\{[\s\S]*?onConfirm: removeProductImage,/)
      expect(productForm).toContain('onClick={requestRemoveProductImage}')
    }

    expect(advancePayments).toMatch(/const requestRemoveVehiclePhoto = useCallback\(\(fileId: string\) => \{[\s\S]*?requestConfirmation\(\{[\s\S]*?onConfirm: \(\) => removeVehiclePhoto\(fileId\),/)
    expect(advancePayments).toContain('onClick={() => requestRemoveVehiclePhoto(file.id)}')
    expect(advancePayments).not.toContain('onClick={() => removeVehiclePhoto(file.id)}')
  })
})
