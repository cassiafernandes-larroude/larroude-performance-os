// Cassia 2026-06-14: Top SKUs por vendas no Shopify + cruzamento com criativos Meta.
// POST { market, since, until, ads: { id, name, account, campaignName?, adsetName?, spend, purchases, thumbnail? }[], limit? }
//
// Response:
//   {
//     top: SkuRow[],            // top N SKUs por unidades vendidas no Shopify (default 30)
//     otherWithAds: SkuRow[],   // SKUs FORA do top N mas que TÊM ads ativos (spend>0)
//   }
//
// Cada SkuRow contém: sku, productName, productImage, unitsSold, shopifyRevenue, currency,
//   hasAds, adsSpend, adsPurchases, roasReal, ads[].
//
// DTC only — usa os mesmos filtros do Main Dashboard.

import { NextRequest, NextResponse } from 'next/server';
import { hasBigQueryCredentials } from '@/lib/bigquery/client';
import { shopifyGraphQL, hasShopifyCredentials } from '@/lib/shopify/admin';
import { extractAdRefFromName } from '@/lib/meta-ads-native/sku-extractor';
import { EXCLUDED_TAGS_REGEX, excludeExchangesSQL } from '@/lib/shared/dtc-filters';

export const dynamic = 'force-dynamic';
export const revalidate = 600;
export const maxDuration = 60;

interface AdInput {
  id: string;
  name: string;
  account: string;
  campaignName?: string;
  adsetName?: string;
  spend: number;
  purchases: number;
  thumbnail?: string;
  status?: string;
  effectiveStatus?: string;
}
interface RequestBody {
  market: 'US' | 'BR';
  since: string;
  until: string;
  ads: AdInput[];
  limit?: number;
}

interface AdDetail {
  id: string;
  name: string;
  account: string;
  campaignName: string | null;
  adsetName: string | null;
  thumbnail: string | null;
  spend: number;
  purchases: number;
  status: string | null;             // raw status from Meta (ACTIVE/PAUSED/etc)
  effectiveStatus: string | null;    // effective status (computed by Meta)
  isActive: boolean;                 // shortcut: effective_status === 'ACTIVE'
}
interface SkuRow {
  sku: string;
  productName: string | null;
  productImage: string | null;
  unitsSold: number;
  shopifyRevenue: number;
  currency: 'USD' | 'BRL';
  hasAds: boolean;          // tem ad ATIVO atualmente?
  hasAdsHistory: boolean;   // teve ad rodando no período (mesmo pausado agora)?
  adsSpend: number;         // total no período (todos os ads, ativos+pausados)
  adsPurchases: number;
  roasReal: number;
  ads: AdDetail[];          // SOMENTE ads ativos no momento (pra listagem)
  totalAdsCount: number;    // quantos ads rodaram no período (referência)
  activeAdsCount: number;
  campaigns: string[];      // nomes únicos das campanhas onde tem ad desse SKU
}

const MAX_ORDER_VALUE = { US: 30000, BR: 25000 } as const;
const TZ = { US: 'America/New_York', BR: 'America/Sao_Paulo' } as const;
// Cassia 2026-06-21: regex DTC canonica (inclui `influencer`) para convergir com Main/Overview/Shopify.
const EXCLUDED_TAGS = EXCLUDED_TAGS_REGEX;

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();
    const { market, since, until, ads = [], limit = 30 } = body;

    if (!market || !since || !until) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    if (!hasBigQueryCredentials()) {
      return NextResponse.json({ error: 'BigQuery not configured' }, { status: 503 });
    }

    const currency: 'USD' | 'BRL' = market === 'US' ? 'USD' : 'BRL';
    const { runQuery } = await import('@/lib/bigquery/client');
    const dataset = market === 'US' ? 'stg_shopify' : 'stg_shopify_br';

    // 1) Agrega ads por SKU mãe (regex L\d{3,5})
    const adsBySku: Record<string, AdDetail[]> = {};
    for (const ad of ads) {
      const ref = extractAdRefFromName(ad.name);
      if (!ref || ref.type !== 'sku') continue; // só processa SKUs (collections ficam de fora aqui)
      const sku = ref.value;
      if (!adsBySku[sku]) adsBySku[sku] = [];
      // Cassia 2026-06-14: status "ativo" só quando Meta retorna effective_status === ACTIVE.
      // Ads que gastaram no período mas foram pausados depois NÃO são "ativos" agora.
      // Se metadata não veio (limite de paginação, etc) → trata como OFF (não inflar tag).
      const knownStatus = (ad.effectiveStatus ?? ad.status ?? '').toUpperCase();
      const isActive = knownStatus === 'ACTIVE';
      adsBySku[sku].push({
        id: ad.id,
        name: ad.name,
        account: ad.account,
        campaignName: ad.campaignName ?? null,
        adsetName: ad.adsetName ?? null,
        thumbnail: ad.thumbnail ?? null,
        spend: Number(ad.spend) || 0,
        purchases: Number(ad.purchases) || 0,
        status: ad.status ?? null,
        effectiveStatus: ad.effectiveStatus ?? null,
        isActive,
      });
    }
    const skusFromAds = Object.keys(adsBySku);

    // 2) Top N SKUs por unidades vendidas no Shopify (DTC)
    const pixFilter = market === 'BR'
      ? `AND o.financial_status NOT IN ('voided','refunded','pending','expired','authorized')`
      : `AND o.financial_status NOT IN ('voided','refunded')`;

    // Cassia 2026-06-14: Mother SKU = estilo + cor (sem tamanho).
    // Replicando a lógica do UE motherSkuOf:
    //   L0042         → L0042
    //   L0042-CAMEL   → L0042-CAMEL
    //   L0042-CAMEL-7.0       → L0042-CAMEL (parts[2] é tamanho)
    //   L0042-CAMEL-7.0-PRETO → L0042-CAMEL-PRETO (parts[2] tamanho, parts[3] adicional)
    //   L0042-CAMEL-PRETO     → L0042-CAMEL-PRETO (parts[2] não é número)
    const topSql = `
      WITH line_items_unnested AS (
        SELECT
          UPPER(JSON_VALUE(li, '$.sku')) AS sku_raw,
          JSON_VALUE(li, '$.title') AS title,
          CAST(JSON_VALUE(li, '$.quantity') AS FLOAT64) AS qty,
          CAST(JSON_VALUE(li, '$.price') AS FLOAT64) AS unit_price
        FROM \`larroude-data-prod.${dataset}.orders\` o,
          UNNEST(JSON_QUERY_ARRAY(o.line_items)) AS li
        WHERE DATE(o.created_at, '${TZ[market]}') BETWEEN @since AND @until
          AND o.cancelled_at IS NULL
          AND o.test = FALSE
          ${pixFilter}
          AND NOT REGEXP_CONTAINS(LOWER(IFNULL(o.tags, '')), r'${EXCLUDED_TAGS}')
          AND (JSON_VALUE(o.customer, '$.tags') IS NULL OR NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(o.customer, '$.tags')), r'${EXCLUDED_TAGS}'))
          AND CAST(o.total_price AS NUMERIC) < ${MAX_ORDER_VALUE[market]}
          ${excludeExchangesSQL('o')}
      ),
      parsed AS (
        SELECT
          sku_raw,
          SPLIT(sku_raw, '-') AS parts,
          title, qty, unit_price
        FROM line_items_unnested
        WHERE sku_raw IS NOT NULL AND REGEXP_CONTAINS(sku_raw, r'^L\\d{3,5}')
      ),
      with_mother AS (
        SELECT
          CASE
            WHEN ARRAY_LENGTH(parts) < 3 THEN sku_raw
            -- parts[OFFSET(2)] é tamanho (número)?
            WHEN REGEXP_CONTAINS(parts[OFFSET(2)], r'^\\d+(\\.\\d+)?$')
              THEN
                CASE
                  WHEN ARRAY_LENGTH(parts) >= 5 AND parts[OFFSET(4)] != ''
                    THEN CONCAT(parts[OFFSET(0)], '-', parts[OFFSET(1)], '-', parts[OFFSET(3)], '-', parts[OFFSET(4)])
                  WHEN ARRAY_LENGTH(parts) >= 4
                    THEN CONCAT(parts[OFFSET(0)], '-', parts[OFFSET(1)], '-', parts[OFFSET(3)])
                  ELSE CONCAT(parts[OFFSET(0)], '-', parts[OFFSET(1)])
                END
            ELSE
              CASE
                WHEN ARRAY_LENGTH(parts) >= 4
                  THEN CONCAT(parts[OFFSET(0)], '-', parts[OFFSET(1)], '-', parts[OFFSET(2)], '-', parts[OFFSET(3)])
                ELSE CONCAT(parts[OFFSET(0)], '-', parts[OFFSET(1)], '-', parts[OFFSET(2)])
              END
          END AS mother_sku,
          title, qty, unit_price
        FROM parsed
      )
      SELECT
        mother_sku AS sku,
        ANY_VALUE(title) AS product_name,
        SUM(qty) AS units,
        SUM(qty * unit_price) AS revenue
      FROM with_mother
      WHERE mother_sku IS NOT NULL
      GROUP BY mother_sku
      ORDER BY units DESC
      LIMIT ${Math.max(1, Math.min(100, limit + 200))}
    `;

    const topRows = await runQuery<{
      sku: string;
      product_name: string | null;
      units: number | string;
      revenue: number | string;
    }>(topSql, { since, until });

    // 3) Decidir: top N + outros que têm ads
    const topSkus = topRows.slice(0, limit).map(r => r.sku);
    const topSkuSet = new Set(topSkus);
    const otherActiveSkus = skusFromAds.filter(s => {
      if (topSkuSet.has(s)) return false;
      // SKUs fora do top 30 que têm pelo menos UM ad ATIVO atualmente
      const hasActive = adsBySku[s].some(a => a.isActive);
      return hasActive;
    });

    // 4) Pra cada SKU (top + others), busca image+productName via Shopify GraphQL
    const allSkus = [...topSkus, ...otherActiveSkus];
    const imageCache: Record<string, { name: string | null; image: string | null }> = {};
    if (hasShopifyCredentials(market)) {
      await Promise.all(allSkus.map(async sku => {
        try {
          const query = `query($sku: String!) { productVariants(first: 1, query: $sku) { edges { node { product { title featuredImage { url } } } } } }`;
          const data = await shopifyGraphQL<{ productVariants: { edges: { node: { product: { title: string; featuredImage?: { url: string } | null } } }[] } }>(market, query, { sku: `sku:${sku}*` });
          const edge = data?.productVariants?.edges?.[0];
          if (edge) {
            imageCache[sku] = { name: edge.node.product.title, image: edge.node.product.featuredImage?.url ?? null };
          } else {
            imageCache[sku] = { name: null, image: null };
          }
        } catch { imageCache[sku] = { name: null, image: null }; }
      }));
    }

    // 5) Build top rows
    const topMap = new Map<string, { product_name: string | null; units: number; revenue: number }>();
    for (const r of topRows) {
      topMap.set(r.sku, { product_name: r.product_name, units: Number(r.units) || 0, revenue: Number(r.revenue) || 0 });
    }

    // Cassia 2026-06-14: matching SKU ad ↔ mother SKU shopify (prefix match em ambos os lados).
    //   Ad "L0042"           → matches mother "L0042-CAMEL", "L0042-PRETO", etc.
    //   Ad "L0042-CAMEL"     → matches mother "L0042-CAMEL", "L0042-CAMEL-PRETO"
    //   Ad "L0042-CAMEL-XYZ" → matches mother "L0042-CAMEL-XYZ" se exato
    const adSkusList = Object.keys(adsBySku);
    const findAdsForMother = (motherSku: string): AdDetail[] => {
      const matched: AdDetail[] = [];
      for (const adSku of adSkusList) {
        if (adSku === motherSku) {
          matched.push(...adsBySku[adSku]);
        } else if (motherSku.startsWith(adSku + '-')) {
          // ad sku é prefixo do mother → genérico cobre essa variante
          matched.push(...adsBySku[adSku]);
        } else if (adSku.startsWith(motherSku + '-')) {
          // ad sku é mais específico que o mother (raro mas possível)
          matched.push(...adsBySku[adSku]);
        }
      }
      return matched;
    };

    const buildRow = (sku: string): SkuRow => {
      const sales = topMap.get(sku);
      const adsForSku = findAdsForMother(sku);
      // Dedup por id pra evitar dupla contagem
      const dedupedAds = Array.from(new Map(adsForSku.map(a => [a.id, a])).values());
      // Cassia 2026-06-14 (rev): MOSTRAR TODOS os ads vinculados (ativos + pausados).
      // O badge "Ativo/Off" individual no card de cada criativo mostra o status.
      const activeAds = dedupedAds.filter(a => a.isActive);
      const adsSpend = dedupedAds.reduce((a, b) => a + b.spend, 0);
      const adsPurchases = dedupedAds.reduce((a, b) => a + b.purchases, 0);
      const shopifyRevenue = sales?.revenue ?? 0;
      const unitsSold = sales?.units ?? 0;
      const campaigns = Array.from(new Set(dedupedAds.map(a => a.campaignName).filter((n): n is string => !!n)));
      return {
        sku,
        productName: imageCache[sku]?.name ?? sales?.product_name ?? null,
        productImage: imageCache[sku]?.image ?? null,
        unitsSold,
        shopifyRevenue,
        currency,
        // hasAds = QUALQUER ad vinculado (ativo OU pausado)
        hasAds: dedupedAds.length > 0,
        hasAdsHistory: dedupedAds.length > 0 && adsSpend > 0,
        adsSpend,
        adsPurchases,
        roasReal: adsSpend > 0 ? shopifyRevenue / adsSpend : 0,
        ads: dedupedAds.sort((a, b) => b.spend - a.spend),  // TODOS, ordenados por spend
        totalAdsCount: dedupedAds.length,
        activeAdsCount: activeAds.length,
        campaigns,
      };
    };

    const top = topSkus.map(buildRow);
    const otherWithAds = otherActiveSkus.map(buildRow).sort((a, b) => b.adsSpend - a.adsSpend);

    return NextResponse.json({ top, otherWithAds }, {
      headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=3600, public' },
    });
  } catch (e: any) {
    console.error('[skus-performance] error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
