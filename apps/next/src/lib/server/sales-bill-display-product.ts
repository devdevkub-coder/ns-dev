export type SalesBillProductPresentation = {
  sourceProductCode: string
  sourceProductName: string
  salesDisplayProductCode: string | null
  salesDisplayProductName: string | null
}

export function salesBillProductPresentation(
  source: { code: string; name: string },
  selectedDisplayProduct: { code: string; name: string } | null,
): SalesBillProductPresentation {
  if (!selectedDisplayProduct || selectedDisplayProduct.code === source.code) {
    return {
      salesDisplayProductCode: null,
      salesDisplayProductName: null,
      sourceProductCode: source.code,
      sourceProductName: source.name,
    }
  }

  return {
    salesDisplayProductCode: selectedDisplayProduct.code,
    salesDisplayProductName: selectedDisplayProduct.name,
    sourceProductCode: source.code,
    sourceProductName: source.name,
  }
}

export function salesBillDisplayProductName(meta: unknown, sourceProductName: string) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return sourceProductName
  const name = (meta as Record<string, unknown>).salesDisplayProductName
  return typeof name === 'string' && name.trim() ? name.trim() : sourceProductName
}
