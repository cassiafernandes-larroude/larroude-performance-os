// Cassia 2026-06-14: extrai dimensões da planilha de nomenclatura Meta US.
// Padrão de ad name: Type_Advantage_Strategy_Category_Audience_SKU/ID_Format_Destination_Copy-Level_Creative-Angle_Variation
//
// Exemplos:
//   "Sale_Advantage_Maximize-Value-Of-Conversions_Mules-Pre-Order_Advantage_L420-LOUL-BEIG-2695_Video_ProductPage_No-Copy_Product-focused_V01"
//   "L420-LOUL-BEIG-2695_Gif_ProductPage_Most-Aware_Product-focused_V02"  (formato antigo)
//
// Os valores conhecidos vêm da planilha "Copy of Parameterization and - Larroudé".

const FORMATS = ['Video', 'Static', 'Gif', 'Carousel', 'Image', 'Slideshow', 'Reel', 'Story'];
const DESTINATIONS = ['ProductPage', 'Collection', 'HomePage', 'Cart', 'Checkout', 'LandingPage', 'Catalog'];
const COPY_LEVELS = ['No-Copy', 'Product-Aware', 'Solution-Aware', 'Most-Aware', 'Brand-Aware', 'Problem-Aware'];
const CREATIVE_ANGLES = ['Product-Mix', 'Product-focused', 'Editorial', 'Partnership', 'On-foot', 'Unboxing', 'UGC', 'Product-details'];

export interface AdDimensions {
  format: string | null;            // 'Video' | 'Static' | 'Gif' | ...
  formatGroup: string | null;        // 'VIDEO' | 'GIF/CAROUSEL' | 'STATIC' | 'OTHER'
  destination: string | null;
  copyLevel: string | null;
  creativeAngle: string | null;
  refType: 'sku' | 'collection' | null; // se tem SKU ou Collection ID
}

function findToken(name: string, candidates: string[]): string | null {
  // Procura cada candidato exatamente, cercado por underscore/início/fim/espaço.
  // Case-insensitive.
  for (const cand of candidates) {
    const escaped = cand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[_\\s])${escaped}(?:[_\\s]|$)`, 'i');
    if (re.test(name)) return cand;
  }
  return null;
}

// Agrupa formats em buckets pra o gráfico (segue padrão Meta dashboards):
//  VIDEO         → Video, Reel, Story
//  GIF/CAROUSEL  → Gif, Carousel, Slideshow
//  STATIC        → Static, Image
//  OTHER         → não detectado
function bucketFormat(format: string | null): string | null {
  if (!format) return 'OTHER';
  const f = format.toLowerCase();
  if (['video', 'reel', 'story'].includes(f)) return 'VIDEO';
  if (['gif', 'carousel', 'slideshow'].includes(f)) return 'GIF/CAROUSEL';
  if (['static', 'image'].includes(f)) return 'STATIC';
  return 'OTHER';
}

const SKU_REGEX = /(?<![A-Z0-9])L\d{3,5}/i;
const COLLECTION_ID_REGEX = /(?<![A-Z0-9])\d{12,15}(?![A-Z0-9])/;

function detectRefType(name: string): 'sku' | 'collection' | null {
  if (SKU_REGEX.test(name)) return 'sku';
  if (COLLECTION_ID_REGEX.test(name)) return 'collection';
  return null;
}

export function extractAdDimensions(name: string | null | undefined): AdDimensions {
  if (!name) {
    return { format: null, formatGroup: null, destination: null, copyLevel: null, creativeAngle: null, refType: null };
  }
  const format = findToken(name, FORMATS);
  return {
    format,
    formatGroup: bucketFormat(format),
    destination: findToken(name, DESTINATIONS),
    copyLevel: findToken(name, COPY_LEVELS),
    creativeAngle: findToken(name, CREATIVE_ANGLES),
    refType: detectRefType(name),
  };
}

export interface DimensionRow {
  label: string;
  ads: number;
  spend: number;
  revenue: number;
  roas: number;
}

/**
 * Agrega ROAS por uma dimensão extraída do ad name.
 * Filtro: só inclui categoria que somou spend > minSpend.
 */
export function aggregateRoasByDimension(
  ads: Array<{ name: string; spend: number; revenue?: number }>,
  pick: (d: AdDimensions) => string | null,
  minSpend = 1000,
): DimensionRow[] {
  const map = new Map<string, { ads: number; spend: number; revenue: number }>();
  for (const ad of ads) {
    const dim = pick(extractAdDimensions(ad.name));
    if (!dim) continue;
    const ex = map.get(dim) ?? { ads: 0, spend: 0, revenue: 0 };
    ex.ads += 1;
    ex.spend += ad.spend || 0;
    ex.revenue += ad.revenue || 0;
    map.set(dim, ex);
  }
  return Array.from(map.entries())
    .filter(([, v]) => v.spend >= minSpend)
    .map(([label, v]) => ({
      label,
      ads: v.ads,
      spend: v.spend,
      revenue: v.revenue,
      roas: v.spend > 0 ? v.revenue / v.spend : 0,
    }))
    .sort((a, b) => b.roas - a.roas);
}
