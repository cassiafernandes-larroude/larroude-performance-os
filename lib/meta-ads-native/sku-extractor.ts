// Cassia 2026-06-14: extrai SKU mãe Larroudé do nome de um criativo/ad.
// Convenção de SKU Larroudé: começa com L seguido de 3-5 dígitos (ex L0042, L1234).
// Alguns ads podem conter o SKU como "L0042", "L0042-CAMEL", "(L0042)", "_L0042_", etc.
//
// Estratégia:
//   1. Regex case-insensitive `\bL\d{3,5}\b` — pega L+3-5 dígitos cercados por word boundaries.
//   2. Retorna em uppercase (L0042).
//   3. Se não acha, retorna null.

const SKU_REGEX = /\bL\d{3,5}\b/i;

/**
 * Extrai o código SKU do nome de um anúncio Meta.
 * Ex: "Adriana L0042 - Coleção Verão" → "L0042"
 *     "L1234_CAMEL_BR" → "L1234"
 *     "Brand campaign" → null
 */
export function extractSkuFromAdName(name: string | null | undefined): string | null {
  if (!name) return null;
  const match = name.match(SKU_REGEX);
  if (!match) return null;
  return match[0].toUpperCase();
}

/**
 * Extrai SKUs únicos de uma lista de nomes de ads.
 */
export function extractUniqueSkus(adNames: (string | null | undefined)[]): string[] {
  const skus = new Set<string>();
  for (const name of adNames) {
    const sku = extractSkuFromAdName(name);
    if (sku) skus.add(sku);
  }
  return Array.from(skus);
}
