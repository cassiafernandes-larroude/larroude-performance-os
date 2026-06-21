import type { Market } from "@/types/metric";
import { runQuery, hasBigQueryCredentials } from "@/lib/bigquery/client";
import { cached } from "@/lib/cache";
import { fulfillmentCategoryFilterSQL, type FulfillmentCategory } from "@/lib/shared/fulfillment-category";
import { getPreorderMotherSkus } from "@/lib/shared/preorder-skus";

const TZ: Record<Market, string> = { US: "America/New_York", BR: "America/Sao_Paulo" };
const DATASET: Record<Market, string> = { US: "stg_shopify", BR: "stg_shopify_br" };

export type ShopifyBundle = {
  market: Market;
  period: { from: string; to: string };
  source: "BQ" | "Mock";
  // KPIs
  orders: number;
  gross_sales: number;
  net_sales: number;
  aov: number;
  units_sold: number;
  conversion_rate_pct: number;
  return_rate_pct: number;
  discount_pct: number; // discounts / gross
  avg_discount_per_order: number;
  // Funil checkout
  funnel: {
    abandoned_checkouts: number;
    completed_orders: number;
    checkout_cvr_pct: number;
  };
  // Top produtos
  top_products: Array<{
    sku: string;
    name: string;
    units: number;
    revenue: number;
    orders: number;
    avg_price: number;
  }>;
  // Top variantes
  top_variants: Array<{
    title: string;
    units: number;
    revenue: number;
  }>;
  // Coleções (via tags)
  collections: Array<{
    collection: string;
    units: number;
    revenue: number;
    orders: number;
  }>;
  // Devoluções
  returns: {
    total_refund_value: number;
    refund_orders: number;
    return_rate_pct: number;
    top_returned: Array<{ sku: string; refund_value: number; orders: number }>;
  };
  // Performance por dia da semana
  weekday_perf: Array<{ weekday: string; orders: number; revenue: number; aov: number }>;
  // Sugestões de venda
  suggestions: Array<{
    priority: "high" | "medium" | "low";
    type: "low-stock" | "high-cvr" | "high-aov" | "trending" | "discount-heavy" | "underperforming";
    title: string;
    detail: string;
    metric: string;
  }>;
};

const WEEKDAY_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

const MOCK_US: Omit<ShopifyBundle, "market" | "period" | "source"> = {
  orders: 10296, gross_sales: 3520000, net_sales: 2820000, aov: 333, units_sold: 20402,
  conversion_rate_pct: 1.10, return_rate_pct: 19.9, discount_pct: 8.9, avg_discount_per_order: 30,
  funnel: { abandoned_checkouts: 5800, completed_orders: 10296, checkout_cvr_pct: 64.0 },
  top_products: [
    { sku: "L101-Dolly", name: "Dolly Stiletto", units: 1820, revenue: 480000, orders: 1620, avg_price: 263 },
    { sku: "L201-Stella", name: "Stella Sandal", units: 1240, revenue: 340000, orders: 1090, avg_price: 274 },
    { sku: "L301-Verona", name: "Verona Loafer", units: 980, revenue: 295000, orders: 920, avg_price: 301 },
    { sku: "L401-Cyprus", name: "Cyprus Boot", units: 640, revenue: 230000, orders: 580, avg_price: 360 },
    { sku: "L501-Milan", name: "Milan Mule", units: 720, revenue: 198000, orders: 670, avg_price: 275 },
    { sku: "L601-Biarritz", name: "Biarritz Sandal", units: 540, revenue: 162000, orders: 510, avg_price: 300 },
  ],
  top_variants: [
    { title: "Dolly Stiletto - Black 37", units: 280, revenue: 73640 },
    { title: "Stella Sandal - Nude 36", units: 220, revenue: 60280 },
    { title: "Verona Loafer - Brown 38", units: 180, revenue: 54180 },
    { title: "Cyprus Boot - Black 37", units: 140, revenue: 50400 },
  ],
  collections: [
    { collection: "Sandalia", units: 6800, revenue: 1180000, orders: 5200 },
    { collection: "Mule", units: 3400, revenue: 720000, orders: 2900 },
    { collection: "Bota", units: 2200, revenue: 620000, orders: 1900 },
    { collection: "Sapatilha", units: 4100, revenue: 480000, orders: 3500 },
    { collection: "Scarpin", units: 2300, revenue: 380000, orders: 2100 },
    { collection: "Tenis", units: 1600, revenue: 140000, orders: 1500 },
  ],
  returns: {
    total_refund_value: 561000, refund_orders: 2050, return_rate_pct: 19.9,
    top_returned: [
      { sku: "Dolly Stiletto", refund_value: 98000, orders: 420 },
      { sku: "Stella Sandal", refund_value: 76000, orders: 320 },
      { sku: "Verona Loafer", refund_value: 62000, orders: 250 },
    ],
  },
  weekday_perf: WEEKDAY_PT.map((d, i) => ({
    weekday: d,
    orders: [1100, 1180, 1450, 1620, 1680, 1750, 1516][i],
    revenue: [365000, 392940, 482850, 539460, 559440, 582750, 504828][i],
    aov: [332, 333, 333, 333, 333, 333, 333][i],
  })),
  suggestions: [
    { priority: "high", type: "high-cvr", title: "Dolly Stiletto - top CVR + estoque saudavel", detail: "Maior conversao + melhor margem. Considerar push em Meta Ads e e-mail.", metric: "1.820 unidades / 14% CVR" },
    { priority: "high", type: "trending", title: "Stella Sandal subindo +28% MoM", detail: "Pico de procura organica. Aumentar estoque + criativo dedicado.", metric: "1.240 unidades / +28% MoM" },
    { priority: "medium", type: "discount-heavy", title: "Verona Loafer - alto desconto", detail: "30% dos pedidos com cupom. Avaliar reducao de desconto.", metric: "30% pedidos descontados" },
    { priority: "medium", type: "high-aov", title: "Cyprus Boot - maior AOV", detail: "Ticket medio $360 - 8% acima da media. Bundle com socks/care?", metric: "$360 AOV" },
    { priority: "low", type: "low-stock", title: "Milan Mule - estoque baixo", detail: "Apenas 18 unidades em algumas variantes. Reabastecer.", metric: "18u em 4 SKUs" },
    { priority: "low", type: "underperforming", title: "Tenis - sub-performando", detail: "Apenas 1.6k unidades vs 6.8k de Sandalia. Reduzir media spend ou descontinuar?", metric: "1.600 unidades" },
  ],
};

const MOCK_BR: Omit<ShopifyBundle, "market" | "period" | "source"> = {
  orders: 12500, gross_sales: 9250000, net_sales: 7700000, aov: 760, units_sold: 18600,
  conversion_rate_pct: 0.95, return_rate_pct: 11.5, discount_pct: 16.8, avg_discount_per_order: 128,
  funnel: { abandoned_checkouts: 11200, completed_orders: 12500, checkout_cvr_pct: 52.7 },
  top_products: [
    { sku: "L101-Dolly", name: "Dolly Stiletto", units: 2100, revenue: 1580000, orders: 1900, avg_price: 750 },
    { sku: "L201-Stella", name: "Stella Sandal", units: 1820, revenue: 1320000, orders: 1640, avg_price: 725 },
    { sku: "L301-Verona", name: "Verona Loafer", units: 1240, revenue: 970000, orders: 1100, avg_price: 780 },
    { sku: "L401-Cyprus", name: "Cyprus Boot", units: 880, revenue: 850000, orders: 800, avg_price: 965 },
    { sku: "L501-Milan", name: "Milan Mule", units: 1320, revenue: 1050000, orders: 1180, avg_price: 795 },
  ],
  top_variants: [
    { title: "Dolly Stiletto - Preto 37", units: 380, revenue: 285000 },
    { title: "Stella Sandal - Nude 36", units: 320, revenue: 232000 },
    { title: "Verona Loafer - Marrom 38", units: 240, revenue: 187000 },
  ],
  collections: [
    { collection: "Sandalia", units: 6200, revenue: 3500000, orders: 5400 },
    { collection: "Mule", units: 3800, revenue: 2300000, orders: 3200 },
    { collection: "Bota", units: 1900, revenue: 1600000, orders: 1700 },
    { collection: "Sapatilha", units: 3400, revenue: 1100000, orders: 2800 },
    { collection: "Scarpin", units: 1800, revenue: 580000, orders: 1500 },
  ],
  returns: {
    total_refund_value: 885500, refund_orders: 1440, return_rate_pct: 11.5,
    top_returned: [
      { sku: "Dolly Stiletto", refund_value: 168000, orders: 295 },
      { sku: "Verona Loafer", refund_value: 102000, orders: 195 },
    ],
  },
  weekday_perf: WEEKDAY_PT.map((d, i) => ({
    weekday: d,
    orders: [1400, 1500, 1820, 2000, 2100, 1880, 1800][i],
    revenue: [1064000, 1140000, 1383200, 1520000, 1596000, 1428800, 1368000][i],
    aov: 760,
  })),
  suggestions: [
    { priority: "high", type: "trending", title: "BR ROAS 13× - momento de escalar", detail: "Maior eficiencia que US. Aumentar budget em campanhas top.", metric: "ROAS 13.29x" },
    { priority: "high", type: "discount-heavy", title: "16.8% de desconto medio - alto", detail: "Quase 2x o US (8.9%). Avaliar reducao para proteger margem.", metric: "R$ 128 desconto medio" },
    { priority: "medium", type: "high-aov", title: "Cyprus Boot - alto AOV", detail: "Ticket R$ 965, 27% acima da media BR.", metric: "R$ 965 AOV" },
    { priority: "medium", type: "high-cvr", title: "Site Performance BR critico - LCP 23s", detail: "Mesmo com ROAS alto, CVR 0.95% vs 1.10% US. Otimizar site eleva CVR.", metric: "CVR 0.95% (BR) vs 1.10% (US)" },
  ],
};

// Filtros: exclui canceladas/test/B2B/wholesale/marketplace/redo; orders > cap; BR exclui PIX nao pago
// alias = prefixo da tabela (ex: "" ou "o.") - usado quando filtros aparecem dentro de JOIN/UNNEST
function commonFiltersShopify(market: Market, alias: string = ""): string {
  const a = alias; // "" ou "o."
  const cap = market === "US" ? 30000 : 25000;
  const pix = market === "BR" ? `
    AND LOWER(IFNULL(${a}financial_status, '')) NOT IN ('pending', 'expired', 'authorized')
  ` : "";
  return `
    ${a}cancelled_at IS NULL AND ${a}test = FALSE
    AND ${a}financial_status NOT IN ('voided','refunded')
    AND JSON_VALUE(${a}customer, '$.id') != '5025734230182'
    AND (
      JSON_VALUE(${a}customer, '$.tags') IS NULL
      OR NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(${a}customer, '$.tags')), r'b2b|wholesale|marketplace|redo')
    )
    AND NOT REGEXP_CONTAINS(LOWER(IFNULL(${a}tags, '')), r'b2b|wholesale|marketplace|redo')
    AND CAST(${a}total_price AS NUMERIC) < ${cap}
    ${pix}
  `;
}

export async function getShopifyBundle(
  market: Market,
  period: { from: string; to: string },
  fulCats?: FulfillmentCategory[] | null,
): Promise<ShopifyBundle> {
  await getPreorderMotherSkus(market); // warm cache p/ exclusão pre-order
  const fulKey = fulCats && fulCats.length ? fulCats.slice().sort().join('+') : 'all';
  return cached(`shopify-v2:${market}:${period.from}:${period.to}:ful=${fulKey}`, 1800, async () => {
    const range = period;

    if (!hasBigQueryCredentials()) {
      return { market, period: range, source: "Mock", ...(market === "US" ? MOCK_US : MOCK_BR) };
    }

    const dataset = DATASET[market];
    const tz = TZ[market];
    // Cassia 2026-06-17: filtro de origem de fulfillment (estoque/sob demanda/from-batch/pendente).
    // Injetado em todas as CTEs baseadas em orders. fulCats vazio/null = sem filtro (tudo).
    const fulBare = fulfillmentCategoryFilterSQL(fulCats, '', dataset);
    const fulO = fulfillmentCategoryFilterSQL(fulCats, 'o', dataset);

    try {
      // KPIs principais
      const kpiSql = `
        WITH
        sales AS (
          SELECT
            COUNT(*) AS orders,
            SUM(CAST(total_line_items_price AS NUMERIC)) AS gross,
            SUM(CAST(total_price AS NUMERIC)) AS revenue,
            SUM(CAST(total_discounts AS NUMERIC)) AS discounts
          FROM \`larroude-data-prod.${dataset}.orders\`
          WHERE DATE(created_at, '${tz}') BETWEEN @from AND @to
            AND ${commonFiltersShopify(market)}
            ${fulBare}
        ),
        units AS (
          SELECT SUM(CAST(JSON_VALUE(li,'$.quantity') AS INT64)) AS units
          FROM \`larroude-data-prod.${dataset}.orders\` o,
            UNNEST(JSON_QUERY_ARRAY(line_items)) li
          WHERE DATE(o.created_at, '${tz}') BETWEEN @from AND @to
            AND ${commonFiltersShopify(market, "o.")}
            ${fulO}
        ),
        refunds AS (
          SELECT IFNULL(SUM((SELECT SUM(CAST(JSON_VALUE(t,'$.amount') AS NUMERIC))
            FROM UNNEST(JSON_QUERY_ARRAY(rf.transactions)) t WHERE JSON_VALUE(t,'$.kind') = 'refund')), 0) AS refund_value,
            COUNT(*) AS refund_orders
          FROM \`larroude-data-prod.${dataset}.order_refunds\` rf
          LEFT JOIN \`larroude-data-prod.${dataset}.orders\` o ON o.id = rf.order_id
          WHERE DATE(rf.created_at, '${tz}') BETWEEN @from AND @to
            ${fulO}
        )
        SELECT s.*, u.units, r.refund_value, r.refund_orders
        FROM sales s, units u, refunds r
      `;
      const kpiRows = await runQuery<Record<string, number | string>>(kpiSql, { from: range.from, to: range.to });
      const k = kpiRows[0] ?? {};
      const orders = Number(k.orders) || 0;
      const gross = Number(k.gross) || 0;
      const revenue = Number(k.revenue) || 0;
      const discounts = Number(k.discounts) || 0;
      const units = Number(k.units) || 0;
      const refundVal = Number(k.refund_value) || 0;
      const refundOrders = Number(k.refund_orders) || 0;
      const netSales = revenue - refundVal;

      // Funil checkout (abandoned + orders)
      let abandoned = 0;
      try {
        const aRows = await runQuery<{ n: number }>(
          `SELECT COUNT(*) AS n FROM \`larroude-data-prod.${dataset}.abandoned_checkouts\`
           WHERE DATE(created_at, '${tz}') BETWEEN @from AND @to AND completed_at IS NULL`,
          { from: range.from, to: range.to }
        );
        abandoned = Number(aRows[0]?.n) || 0;
      } catch {}
      const totalCheckouts = abandoned + orders;
      const checkoutCvr = totalCheckouts > 0 ? (orders / totalCheckouts) * 100 : 0;

      // Top produtos (via mother SKU heuristic — primeiro segmento do SKU)
      const productSql = `
        WITH lis AS (
          SELECT
            REGEXP_EXTRACT(JSON_VALUE(li, '$.sku'), r'^[A-Z]?\\d+') AS sku_root,
            JSON_VALUE(li, '$.title') AS title,
            CAST(JSON_VALUE(li, '$.quantity') AS INT64) AS qty,
            CAST(JSON_VALUE(li, '$.price') AS NUMERIC) AS price,
            o.id AS order_id
          FROM \`larroude-data-prod.${dataset}.orders\` o,
            UNNEST(JSON_QUERY_ARRAY(line_items)) li
          WHERE DATE(o.created_at, '${tz}') BETWEEN @from AND @to
            AND o.cancelled_at IS NULL AND o.test = FALSE
            AND o.financial_status NOT IN ('voided','refunded')
            AND (
              JSON_VALUE(o.customer, '$.tags') IS NULL
              OR NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(o.customer, '$.tags')), r'b2b|wholesale|marketplace|redo')
            )
            AND NOT REGEXP_CONTAINS(LOWER(IFNULL(o.tags, '')), r'b2b|wholesale|marketplace|redo')
            AND CAST(o.total_price AS NUMERIC) < ${market === "US" ? 30000 : 25000}
            ${market === "BR" ? `
            AND LOWER(IFNULL(o.financial_status, '')) NOT IN ('pending', 'expired', 'authorized')` : ""}
            ${fulO}
        )
        SELECT
          COALESCE(sku_root, 'sem-sku') AS sku,
          ANY_VALUE(title) AS name,
          SUM(qty) AS units,
          SUM(qty * price) AS revenue,
          COUNT(DISTINCT order_id) AS orders,
          SAFE_DIVIDE(SUM(qty * price), NULLIF(SUM(qty), 0)) AS avg_price
        FROM lis
        WHERE sku_root IS NOT NULL
        GROUP BY sku_root
        ORDER BY revenue DESC
        LIMIT 10
      `;
      const topProductsRows = await runQuery<Record<string, number | string>>(productSql, { from: range.from, to: range.to });
      const topProducts = topProductsRows.map((r) => ({
        sku: String(r.sku),
        name: String(r.name ?? r.sku),
        units: Number(r.units),
        revenue: Number(r.revenue),
        orders: Number(r.orders),
        avg_price: Number(r.avg_price),
      }));

      // Top variantes (mesma query mas por title completo)
      const variantSql = `
        SELECT
          JSON_VALUE(li, '$.title') AS title,
          SUM(CAST(JSON_VALUE(li, '$.quantity') AS INT64)) AS units,
          SUM(CAST(JSON_VALUE(li, '$.quantity') AS INT64) * CAST(JSON_VALUE(li, '$.price') AS NUMERIC)) AS revenue
        FROM \`larroude-data-prod.${dataset}.orders\` o,
          UNNEST(JSON_QUERY_ARRAY(line_items)) li
        WHERE DATE(o.created_at, '${tz}') BETWEEN @from AND @to
          AND o.cancelled_at IS NULL AND o.test = FALSE
          AND o.financial_status NOT IN ('voided','refunded')
          AND (
            JSON_VALUE(o.customer, '$.tags') IS NULL
            OR NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(o.customer, '$.tags')), r'b2b|wholesale|marketplace|redo')
          )
          AND NOT REGEXP_CONTAINS(LOWER(IFNULL(o.tags, '')), r'b2b|wholesale|marketplace|redo')
          AND CAST(o.total_price AS NUMERIC) < ${market === "US" ? 30000 : 25000}
          ${market === "BR" ? `
          AND LOWER(IFNULL(o.financial_status, '')) NOT IN ('pending', 'expired', 'authorized')` : ""}
          ${fulO}
        GROUP BY title
        ORDER BY units DESC
        LIMIT 8
      `;
      const variantRows = await runQuery<Record<string, number | string>>(variantSql, { from: range.from, to: range.to });
      const topVariants = variantRows.map((r) => ({ title: String(r.title), units: Number(r.units), revenue: Number(r.revenue) }));

      // Coleções via product_type (campo nativo Shopify)
      const collectionSql = `
        SELECT
          IFNULL(JSON_VALUE(li, '$.product_type'), 'Outros') AS collection,
          SUM(CAST(JSON_VALUE(li, '$.quantity') AS INT64)) AS units,
          SUM(CAST(JSON_VALUE(li, '$.quantity') AS INT64) * CAST(JSON_VALUE(li, '$.price') AS NUMERIC)) AS revenue,
          COUNT(DISTINCT o.id) AS orders
        FROM \`larroude-data-prod.${dataset}.orders\` o,
          UNNEST(JSON_QUERY_ARRAY(line_items)) li
        WHERE DATE(o.created_at, '${tz}') BETWEEN @from AND @to
          AND o.cancelled_at IS NULL AND o.test = FALSE
          AND o.financial_status NOT IN ('voided','refunded')
          AND (
            JSON_VALUE(o.customer, '$.tags') IS NULL
            OR NOT REGEXP_CONTAINS(LOWER(JSON_VALUE(o.customer, '$.tags')), r'b2b|wholesale|marketplace|redo')
          )
          AND NOT REGEXP_CONTAINS(LOWER(IFNULL(o.tags, '')), r'b2b|wholesale|marketplace|redo')
          AND CAST(o.total_price AS NUMERIC) < ${market === "US" ? 30000 : 25000}
          ${market === "BR" ? `
          AND LOWER(IFNULL(o.financial_status, '')) NOT IN ('pending', 'expired', 'authorized')` : ""}
          ${fulO}
        GROUP BY collection
        ORDER BY revenue DESC
        LIMIT 8
      `;
      const collRows = await runQuery<Record<string, number | string>>(collectionSql, { from: range.from, to: range.to });
      const collections = collRows.map((r) => ({
        collection: String(r.collection),
        units: Number(r.units),
        revenue: Number(r.revenue),
        orders: Number(r.orders),
      }));

      // Performance por dia da semana
      const weekdaySql = `
        SELECT
          EXTRACT(DAYOFWEEK FROM DATE(created_at, '${tz}')) AS dow,
          COUNT(*) AS orders,
          SUM(CAST(total_price AS NUMERIC)) AS revenue,
          SAFE_DIVIDE(SUM(CAST(total_price AS NUMERIC)), COUNT(*)) AS aov
        FROM \`larroude-data-prod.${dataset}.orders\`
        WHERE DATE(created_at, '${tz}') BETWEEN @from AND @to
          AND ${commonFiltersShopify(market)}
          ${fulBare}
        GROUP BY dow
        ORDER BY dow
      `;
      const wdRows = await runQuery<{ dow: number; orders: number; revenue: number | string; aov: number | string }>(weekdaySql, { from: range.from, to: range.to });
      const weekdayMap = new Map(wdRows.map((r) => [Number(r.dow), r]));
      const weekday_perf = WEEKDAY_PT.map((d, i) => {
        const r = weekdayMap.get(i + 1);
        return {
          weekday: d,
          orders: Number(r?.orders) || 0,
          revenue: Number(r?.revenue) || 0,
          aov: Number(r?.aov) || 0,
        };
      });

      // Top devolvidos (via order_refunds + JOIN orders)
      let topReturned: Array<{ sku: string; refund_value: number; orders: number }> = [];
      try {
        const retSql = `
          WITH refund_orders AS (
            SELECT
              order_id,
              SUM(CAST(JSON_VALUE(t,'$.amount') AS NUMERIC)) AS refund_amt
            FROM \`larroude-data-prod.${dataset}.order_refunds\` r,
              UNNEST(JSON_QUERY_ARRAY(transactions)) t
            WHERE DATE(r.created_at, '${tz}') BETWEEN @from AND @to
              AND JSON_VALUE(t,'$.kind') = 'refund'
            GROUP BY order_id
          )
          SELECT
            REGEXP_EXTRACT(JSON_VALUE(li, '$.sku'), r'^[A-Z]?\\d+') AS sku,
            ANY_VALUE(JSON_VALUE(li, '$.title')) AS name,
            COUNT(DISTINCT o.id) AS orders,
            SUM(ro.refund_amt) AS refund_value
          FROM \`larroude-data-prod.${dataset}.orders\` o
          JOIN refund_orders ro ON o.id = ro.order_id,
            UNNEST(JSON_QUERY_ARRAY(o.line_items)) li
          WHERE REGEXP_EXTRACT(JSON_VALUE(li, '$.sku'), r'^[A-Z]?\\d+') IS NOT NULL
            ${fulO}
          GROUP BY sku
          ORDER BY refund_value DESC
          LIMIT 5
        `;
        const rows = await runQuery<{ sku: string; name: string; orders: number; refund_value: number | string }>(retSql, { from: range.from, to: range.to });
        topReturned = rows.map((r) => ({ sku: r.name || r.sku, refund_value: Number(r.refund_value), orders: Number(r.orders) }));
      } catch {}

      // Sugestoes automaticas (cross-referenciando os dados)
      const suggestions: ShopifyBundle["suggestions"] = [];

      // Top produto com revenue alto
      if (topProducts[0]) {
        suggestions.push({
          priority: "high",
          type: "high-cvr",
          title: `${topProducts[0].name} - lider em receita`,
          detail: `Maior gerador de receita do periodo. Considerar push em ads + email + landing page dedicada.`,
          metric: `${topProducts[0].units} unidades / ${(topProducts[0].revenue / 1000).toFixed(0)}K em receita`,
        });
      }
      // Desconto alto
      const discountPct = gross > 0 ? (discounts / gross) * 100 : 0;
      if (discountPct > 15) {
        suggestions.push({
          priority: "medium",
          type: "discount-heavy",
          title: "Desconto medio alto",
          detail: `${discountPct.toFixed(1)}% da receita gross em descontos. Avaliar reducao para proteger margem.`,
          metric: `${discountPct.toFixed(1)}% gross discounted`,
        });
      }
      // Return rate alto
      const returnRate = orders > 0 ? (refundOrders / orders) * 100 : 0;
      if (returnRate > 15) {
        suggestions.push({
               priority: "high",
          type: "underperforming",
          title: `Return rate alto: ${returnRate.toFixed(1)}%`,
          detail: "Acima do benchmark da industria (10-12%). Revisar qualidade ou fit dos produtos top devolvidos.",
          metric: `${returnRate.toFixed(1)}% return rate`,
        });
      }

      return {
        market, period: range, source: "BQ" as const,
        orders, gross_sales: gross, net_sales: netSales, aov: orders > 0 ? revenue / orders : 0,
        units_sold: units,
        conversion_rate_pct: 0, // sem session data ainda
        return_rate_pct: orders > 0 ? (refundOrders / orders) * 100 : 0,
        discount_pct: gross > 0 ? (discounts / gross) * 100 : 0,
        avg_discount_per_order: orders > 0 ? discounts / orders : 0,
        funnel: {
          abandoned_checkouts: abandoned,
          completed_orders: orders,
          checkout_cvr_pct: checkoutCvr,
        },
        top_products: topProducts,
        top_variants: topVariants,
        collections,
        returns: {
          total_refund_value: refundVal,
          refund_orders: refundOrders,
          return_rate_pct: orders > 0 ? (refundOrders / orders) * 100 : 0,
          top_returned: topReturned,
        },
        weekday_perf,
        suggestions,
      };
    } catch (err) {
      console.error("shopify dashboard failed:", err);
      return { market, period: range, source: "Mock", ...(market === "US" ? MOCK_US : MOCK_BR) };
    }
  });
}
