// Cassia 2026-06-14: extrai identificador (SKU mãe OU Collection ID) do nome de um criativo Meta.
//
// Padrões:
//   1. SKU mãe Larroudé: "L" + 3-5 dígitos (ex: L0042, L1234)
//   2. Collection ID Shopify: 12+ dígitos consecutivos (ex: 285632184302)
//
// Se acha SKU → retorna {type:'sku', value:'L0042'}
// Se acha Collection ID (e não acha SKU) → retorna {type:'collection', value:'285632184302'}
// Se não acha nenhum → retorna null

// Cassia 2026-06-14 (rev2): conforme planilha de nomenclatura compartilhada:
//   Padrão de ad name: Type_Advantage_Strategy_Category_Audience_SKU/ID_Format_Destination_Copy-Level_Creative-Angle_Variation
//   Ex.: "Sale_Advantage_Maximize-Value-Of-Conversions_Mules-Pre-Order_Advantage_L420-LOUL-BEIG-2695_Video_ProductPage_..."
//   Ex.: "L420-LOUL-BEIG-2695_Gif_ProductPage_Most-Aware_Product-focused_V02"  (formato antigo curto)
//
// SKU format: L<3-5 digits>-<MODELO>-<COR>-<NUMERO> (ex: L277-FIOR-IVOR-2723, L420-LOUL-BEIG-2695)
// Collection ID format: 12+ dígitos puros (ex: 686997569702)
//
// Regex precisa NÃO exigir \b antes do L (porque _ não é word boundary em JS).
// Usa lookbehind negativo: SKU deve estar precedido por algo que NÃO seja letra/dígito
// (ou estar no início da string).
const SKU_REGEX = /(?<![A-Z0-9])L\d{3,5}(?:-[A-Z0-9.]+)*/i;
// Cassia 2026-06-21: usa lookaround de dígito (não \b) porque o ID vem seguido de "_"
// no nome do ad (ex.: "683029528742_Static_Collection..."), e "_" não é word boundary.
const COLLECTION_ID_REGEX = /(?<!\d)\d{12,15}(?!\d)/;

export type AdRef =
  | { type: 'sku'; value: string }
  | { type: 'collection'; value: string }
  | null;

/**
 * Extrai identificador (SKU OR collection) do nome de um ad Meta.
 * SKU tem precedência sobre collection ID.
 */
export function extractAdRefFromName(name: string | null | undefined): AdRef {
  if (!name) return null;
  // 1. Tenta SKU primeiro
  const skuMatch = name.match(SKU_REGEX);
  if (skuMatch) return { type: 'sku', value: skuMatch[0].toUpperCase() };
  // 2. Senão tenta Collection ID (12+ dígitos)
  const colMatch = name.match(COLLECTION_ID_REGEX);
  if (colMatch) return { type: 'collection', value: colMatch[0] };
  return null;
}

/** @deprecated use extractAdRefFromName */
export function extractSkuFromAdName(name: string | null | undefined): string | null {
  const ref = extractAdRefFromName(name);
  return ref?.type === 'sku' ? ref.value : null;
}

/**
 * Agrupa refs únicos por tipo a partir de uma lista de ad names.
 */
export function extractUniqueRefs(adNames: (string | null | undefined)[]): {
  skus: string[];
  collections: string[];
} {
  const skus = new Set<string>();
  const collections = new Set<string>();
  for (const name of adNames) {
    const ref = extractAdRefFromName(name);
    if (!ref) continue;
    if (ref.type === 'sku') skus.add(ref.value);
    else collections.add(ref.value);
  }
  return {
    skus: Array.from(skus),
    collections: Array.from(collections),
  };
}

/** @deprecated use extractUniqueRefs */
export function extractUniqueSkus(adNames: (string | null | undefined)[]): string[] {
  return extractUniqueRefs(adNames).skus;
}
