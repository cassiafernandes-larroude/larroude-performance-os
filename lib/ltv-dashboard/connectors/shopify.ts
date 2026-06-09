/**
 * Shopify-related helpers — mother SKU heuristic and shared types.
 *
 * LTV dashboard pulls orders from BigQuery (shopify_<market>.orders via Airbyte)
 * rather than Shopify GraphQL, because aggregating ALL orders per customer is
 * heavier than CAC's per-period window. See lib/queries.ts for the actual data
 * fetching logic.
 */

/**
 * Mother SKU heuristic — groups variants by model + color (ignoring size).
 *
 * Larroude SKU patterns observed:
 *   US: L###-MODEL-SIZE-COLOR-####     e.g. L471-DOLL-7.0-NATU-1234
 *   BR: L###-MODEL-COLOR-####          e.g. L415-STEL-PEAN-1759
 *
 * Rules:
 *   1) Skip non-product SKUs (must start with `L\d+`).
 *      → "x-redo" (Free Returns Coverage), "shipping", etc. are ignored.
 *   2) If the 3rd segment is numeric (with optional decimal), it's a size → drop it.
 *   3) Mother SKU = `<collection>-<model>-<color>`.
 */
export function motherSkuOf(sku: string | null | undefined): string | null {
  if (!sku) return null;
  const parts = sku.split('-');
  if (parts.length < 3) return null;
  if (!/^L\d+/i.test(parts[0])) return null;

  const sizeAtIdx2 = parts[2] && /^\d+(\.\d+)?$/.test(parts[2]);
  if (sizeAtIdx2 && parts.length >= 4) {
    return [parts[0], parts[1], parts[3]].join('-');
  }
  return [parts[0], parts[1], parts[2]].join('-');
}

/**
 * Product type / category — extracted from the line_item title (Shopify product name).
 *
 * Examples (BR):
 *   "Sandália Plataforma Miso Camurça Marrom"  → Sandália
 *   "Sapatilha Verona Camurça Preto"           → Sapatilha
 *   "Bota James Camurça Caramelo"              → Bota
 *   "Mule Loulou Ráfia Bege"                   → Mule
 *   "Mocassim Boat Shoe Cyprus Couro Marrom"   → Mocassim
 *   "Slingback Ines Couro Preto"               → Slingback
 *   "Tênis Stella Camurça Marrom"              → Tênis
 *   "Scarpin Plataforma Blair Camurça Marrom"  → Scarpin
 *
 * Examples (US):
 *   "Dolly Mule In Natural Raffia"             → Mule
 *   "Stella Sneaker In Russet Suede"           → Tênis
 *   "Verona Ballet Flat"                       → Sapatilha
 *   "Milan Flat Sandal In Beige Raffia"        → Sandália
 *   "Cyprus Boat Shoe In Brown Suede"          → Mocassim
 *   "Biarritz Flat Sandal"                     → Sandália
 *
 * Heuristic: ordered list of regex patterns tested against the lowercase title.
 * First match wins. Returns "Outros" if nothing matches.
 */
const PRODUCT_TYPE_PATTERNS: Array<{ name: string; re: RegExp }> = [
  // Specific first (Boat Shoe → Mocassim before plain "shoe")
  { name: 'Mocassim', re: /\b(mocassim|loafer|boat shoe)\b/i },
  { name: 'Slingback', re: /\bslingback\b/i },
  { name: 'Scarpin', re: /\b(scarpin|pump|stiletto|heel)\b/i },
  { name: 'Sapatilha', re: /\b(sapatilha|ballet|ballerina|ballet flat|flat\b(?!.*sandal))/i },
  { name: 'Sandália', re: /\b(sandália|sandalia|sandal|slide)\b/i },
  { name: 'Mule', re: /\b(mule)\b/i },
  { name: 'Tênis', re: /\b(tênis|tenis|sneaker)\b/i },
  { name: 'Bota', re: /\b(bota|boot|bootie|ankle boot)\b/i },
  { name: 'Plataforma', re: /\b(plataforma|platform)\b/i },
];

/**
 * Returns the product type for a Shopify line-item title.
 * Returns "Outros" if no pattern matches.
 */
export function productTypeOf(title: string | null | undefined): string {
  if (!title) return 'Outros';
  for (const { name, re } of PRODUCT_TYPE_PATTERNS) {
    if (re.test(title)) return name;
  }
  return 'Outros';
}

// Kept exported for backward-compat (used to be the SKU-based model code).
// Now returns the product type — the canonical "category" for the dashboard.
export function categoryCodeOf(_sku: string | null | undefined): string | null {
  // legacy — not used anymore. Kept to avoid breaking imports.
  return null;
}
export function categoryNameOf(code: string | null | undefined): string | null {
  return code ?? null;
}
