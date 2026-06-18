import type { Market, Period, MetricBundle, Metric, MetricSource } from "@/types/metric";
import { dateRangeForPeriod, previousPeriodRange, periodToDays, previousRangeOf } from "@/lib/utils/periods";
import { formatCurrency, formatMultiplier, formatNumber, formatPercent } from "@/lib/utils/format";
import { hasBigQueryCredentials, runQuery } from "@/lib/bigquery/client";
import { aggregatedKpisSQL } from "@/lib/bigquery/queries/metrics";
import { type FulfillmentCategory } from "@/lib/shared/fulfillment-category";
import { getMetaSpendApi, hasMetaCredentials } from "@/lib/meta-api";
import { cached } from "@/lib/cache";
import { getFixedToolsCostInRange, getAgentShopCost, CHANNEL_COSTS } from "@/lib/channel-costs";
import { todayInMarket } from "@/lib/utils/market-tz";
import { getTodaySales } from "@/lib/unit-economics/shopify-today";

type AggRow = {
  gross_sales: number | string;
  discounts: number | string;
  order_revenue: number | string;
  total_sales: number | string;
  orders: number;
  units?: number | string;
  aov: number | string;
  spend: number | string;
  meta_spend: number | string;
  google_spend: number | string;
  meta_spend_preorder?: number | string;
  google_spend_preorder?: number | string;
  roas_gross: number;
  roas_order: number;
  roas_total: number;
  new_customers: number;
  cac: number;
};

// Periodo: ultimos N dias COMPLETOS (sem hoje), igual ao dashboard principal
function dateRangeCompleted(period: Period, today = new Date()): { from: string; to: string } {
  const days = periodToDays(period);
  // "to" = ontem
  const to = new Date(today.getTime() - 24 * 3600 * 1000);
  const from = new Date(to.getTime() - (days - 1) * 24 * 3600 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function previousDateRangeCompleted(period: Period, today = new Date()): { from: string; to: string } {
  const days = periodToDays(period);
  const to = new Date(today.getTime() - (days + 1) * 24 * 3600 * 1000);
  const from = new Date(to.getTime() - (days - 1) * 24 * 3600 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

async function fetchKpis(market: Market, range: { from: string; to: string }, fulCats?: FulfillmentCategory[] | null): Promise<AggRow | null> {
  if (!hasBigQueryCredentials()) return null;
  try {
    const rows = await runQuery<AggRow>(aggregatedKpisSQL(market, fulCats), {
      market_lower: market.toLowerCase(),
      start: range.from,
      end: range.to,
    });
    return rows[0] ?? null;
  } catch (err) {
    console.error(`fetchKpis(${market}) failed:`, err);
    return null;
  }
}

function num(v: unknown): number {
  if (v == null) return 0;
  // BigQuery NUMERIC pode vir como string, number, ou objeto BigQueryNumeric
  // BigQueryNumeric tem .toString() ou .value
  if (typeof v === "object" && v !== null) {
    if ("value" in v) return Number((v as { value: unknown }).value) || 0;
    return Number((v as object).toString()) || 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pct(curr: number, prev: number): number | null {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}

const MOCK_US: AggRow = {
  gross_sales: 3_252_000, discounts: 313_000, order_revenue: 3_135_000, total_sales: 2_820_000,
  orders: 10_296, aov: 333, spend: 1_100_000, meta_spend: 945_000, google_spend: 151_000,
  roas_gross: 3.21, roas_order: 3.13, roas_total: 2.57, new_customers: 4_754, cac: 231,
};

const MOCK_BR: AggRow = {
  gross_sales: 9_250_000, discounts: 800_000, order_revenue: 9_400_000, total_sales: 9_530_000,
  orders: 12_500, aov: 760, spend: 695_000, meta_spend: 442_000, google_spend: 241_000,
  roas_gross: 13.29, roas_order: 13.70, roas_total: 13.70, new_customers: 7_700, cac: 90,
};

export async function getMetricBundle(
  market: Market,
  period: Period,
  customRange?: { from: string; to: string },
  fulCats?: FulfillmentCategory[] | null
): Promise<MetricBundle> {
  const fulKey = fulCats && fulCats.length ? fulCats.slice().sort().join('+') : 'all';
  const cacheKey = customRange
    ? `metrics-v13-meta-sm-fallback:${market}:custom:${customRange.from}:${customRange.to}:ful=${fulKey}`
    : `metrics-v13-meta-sm-fallback:${market}:${period}:ful=${fulKey}`;
  return cached(cacheKey, 1800, async () => {
    const range = customRange ?? dateRangeCompleted(period);
    const prevRange = customRange
      ? previousRangeOf(customRange.from, customRange.to)
      : previousDateRangeCompleted(period);

    const [curr, prev] = await Promise.all([
      fetchKpis(market, range, fulCats),
      fetchKpis(market, prevRange, fulCats),
    ]);

    const source: MetricSource = curr ? "BQ" : "Mock";
    const c: AggRow = { ...(curr ?? (market === "US" ? MOCK_US : MOCK_BR)) };
    const p = prev ?? (market === "US" ? MOCK_US : MOCK_BR);

    // Cassia 2026-06-12: se o range eh "hoje" (D0) no fuso do market, BQ ainda
    // nao tem os dados (pipeline diario). Override sales/orders/aov via Shopify
    // Admin API direto (intra-dia, near real-time) + Google spend via Supermetrics.
    const todayMkt = todayInMarket(market);
    const isToday = range.from === todayMkt && range.to === todayMkt;
    if (isToday) {
      try {
        const t = await getTodaySales(market);
        const todayRev = t.totalRevenue || 0;
        const todayOrders = t.totalOrders || 0;
        // Aproximacao: D0 = sem refunds ainda → total_sales ≈ order_revenue ≈ gross_sales.
        c.gross_sales = todayRev;
        c.order_revenue = todayRev;
        c.total_sales = todayRev;
        c.orders = todayOrders;
        c.aov = todayOrders > 0 ? todayRev / todayOrders : 0;
        // new_customers nao calculado D0 — manter o que BQ deu (provavelmente 0).
      } catch (err) {
        console.warn(`[overview today] Shopify ${market} live fetch failed:`, err);
      }
      // Google spend D0 via Supermetrics (BQ pipeline ainda nao processou hoje).
      try {
        const { queryGoogleAdsTotalViaSupermetrics } = await import("@/lib/main-dashboard/supermetrics");
        const gads = await queryGoogleAdsTotalViaSupermetrics(market, range.from, range.to);
        if (gads.spend > 0) c.google_spend = gads.spend;
      } catch (err) {
        console.warn(`[overview today] Google Supermetrics ${market} failed:`, err);
      }
    }
    const currency = market === "US" ? "USD" : "BRL";

    const fresh_until = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const generated_at = new Date().toISOString();

    const baseMetric = (m: Partial<Metric>): Metric => ({
      key: m.key!,
      label: m.label!,
      value: m.value!,
      formatted: m.formatted!,
      currency: m.currency ?? currency,
      delta_pct: m.delta_pct ?? null,
      delta_label: m.delta_pct != null ? formatPercent(m.delta_pct) : null,
      period: range,
      market,
      source,
      fresh_until,
      hint: m.hint,
    });

    // Cassia 2026-06-14: REGRA — Google sempre vem de Supermetrics (= Main Dashboard, CAC, LTV).
    // BQ all_channels_daily é IGNORADO porque retorna 0 pra D-1 (lag de processamento).
    let cGoogleSpend = 0;
    let pGoogleSpend = 0;
    const bqGoogleCur = num(c.google_spend);
    const bqGooglePrv = num(p.google_spend);
    try {
      const { queryGoogleAdsTotalViaSupermetrics } = await import("@/lib/main-dashboard/supermetrics");
      const [gCur, gPrev] = await Promise.all([
        queryGoogleAdsTotalViaSupermetrics(market, range.from, range.to).catch((e: any) => {
          console.error(`[overview google ${market}] Supermetrics CURR ERROR:`, e?.message || e);
          return { spend: 0 };
        }),
        queryGoogleAdsTotalViaSupermetrics(market, prevRange.from, prevRange.to).catch((e: any) => {
          console.error(`[overview google ${market}] Supermetrics PREV ERROR:`, e?.message || e);
          return { spend: 0 };
        }),
      ]);
      cGoogleSpend = gCur.spend > 0 ? gCur.spend : bqGoogleCur;
      pGoogleSpend = gPrev.spend > 0 ? gPrev.spend : bqGooglePrv;
      console.log(`[overview google ${market} ${range.from}..${range.to}]`,
        `supermetrics_curr=$${gCur.spend.toFixed(0)}`,
        `supermetrics_prev=$${gPrev.spend.toFixed(0)}`,
        `bq_curr=$${bqGoogleCur.toFixed(0)}`,
        `bq_prev=$${bqGooglePrv.toFixed(0)}`,
        `FINAL_CURR=$${cGoogleSpend.toFixed(0)}`,
        `FINAL_PREV=$${pGoogleSpend.toFixed(0)}`,
      );
    } catch (err) {
      console.warn("[overview] Google fetch failed completely, using BQ fallback:", err);
      cGoogleSpend = bqGoogleCur;
      pGoogleSpend = bqGooglePrv;
    }
    let cMetaSpend = Math.max(0, num(c.spend) - cGoogleSpend);
    let pMetaSpend = Math.max(0, num(p.spend) - pGoogleSpend);
    let metaApiOk = false;
    if (hasMetaCredentials()) {
      try {
        const [metaCurr, metaPrev] = await Promise.all([
          getMetaSpendApi(market, range.from, range.to),
          getMetaSpendApi(market, prevRange.from, prevRange.to),
        ]);
        if (metaCurr > 0) {
          cMetaSpend = metaCurr;
          metaApiOk = true;
        }
        if (metaPrev > 0) pMetaSpend = metaPrev;
      } catch (err) {
        console.warn("Meta API fallback to Supermetrics:", err);
      }
    }
    // Cassia 2026-06-12: fallback Supermetrics quando Meta API falha
    // (token expirado etc). Mantem painel funcional sem dependencia de renovacao manual.
    if (!metaApiOk) {
      try {
        const { queryMetaAdsTotalViaSupermetrics } = await import("@/lib/main-dashboard/supermetrics");
        const [smCurr, smPrev] = await Promise.all([
          queryMetaAdsTotalViaSupermetrics(market, range.from, range.to),
          queryMetaAdsTotalViaSupermetrics(market, prevRange.from, prevRange.to),
        ]);
        if (smCurr.spend > 0) cMetaSpend = smCurr.spend;
        if (smPrev.spend > 0) pMetaSpend = smPrev.spend;
      } catch (err) {
        console.warn("Meta Supermetrics fallback failed:", err);
      }
    }
    // Tools cost (Klaviyo, Attentive, Criteo, Agent.shop) â soma no AMOUNT SPENT
    // para que ROAS / CAC / CPO reflitam o custo total (ads + ferramentas).
    // Cassia 2026-06-14: REGRA CANONICA — spend total via computeTotalSpend (mesma formula de
    // Main Dashboard, CAC, LTV, NorthStar). Inclui Meta + Google + Klaviyo + Attentive + Criteo
    // + Agent.shop (BR) + Awin (US+BR) + ShopMy (US). UTMs reais do Shopify.
    let cSpend = cMetaSpend + cGoogleSpend;
    let pSpend = pMetaSpend + pGoogleSpend;
    try {
      const { computeTotalSpend } = await import("@/lib/channel-costs-bq");
      const [curBd, prvBd] = await Promise.all([
        computeTotalSpend(market as any, range.from, range.to, cMetaSpend, cGoogleSpend),
        computeTotalSpend(market as any, prevRange.from, prevRange.to, pMetaSpend, pGoogleSpend),
      ]);
      cSpend = curBd.total;
      pSpend = prvBd.total;
      console.log(`[overview spend ${market} ${range.from}..${range.to}]`,
        `meta=$${cMetaSpend.toFixed(0)} google=$${cGoogleSpend.toFixed(0)}`,
        `tools=$${curBd.fixedTools.toFixed(0)} pctRev=$${curBd.percentRev.toFixed(0)}`,
        `TOTAL=$${curBd.total.toFixed(0)}`);
    } catch (err) {
      console.warn("[overview] computeTotalSpend failed:", err);
    }
    // Cassia 2026-06-17: filtro de origem -> PUXA o spend por campanha e calcula ROAS por origem.
    // Pre-venda/pre-order (produzido = sob demanda + from-batch) = campanhas com pre-order/pre-venda
    // no nome; estoque = demais. Fonte AO VIVO: Meta API (queryMetaCampaigns) + Google Supermetrics
    // (BQ tem Meta ~0 por lag). Escala o spend total/Meta/Google pelo fator da origem selecionada.
    if (fulCats && fulCats.length) {
      try {
        const { queryMetaCampaigns } = await import("@/lib/main-dashboard/meta-ads");
        const { queryGoogleCampaignsViaSupermetrics, queryMetaCampaignsViaSupermetrics } = await import("@/lib/main-dashboard/supermetrics");
        const { isPreorderCampaign } = await import("@/lib/shared/fulfillment-category");
        // Meta: API direta primeiro; se vazia (token fora), fallback Supermetrics (ds_id FA).
        let metaC: any[] = await queryMetaCampaigns(market as any, range.from, range.to).catch(() => []);
        let metaSource = "meta-api";
        if (!metaC.length) {
          metaC = await queryMetaCampaignsViaSupermetrics(market as any, range.from, range.to).catch(() => []);
          metaSource = "supermetrics";
        }
        const googC: any[] = await queryGoogleCampaignsViaSupermetrics(market as any, range.from, range.to).catch(() => []);
        const metaTot = metaC.reduce((s: number, x: any) => s + (Number(x.spend) || 0), 0);
        const metaPre = metaC.filter((x: any) => isPreorderCampaign(x.campaign_name)).reduce((s: number, x: any) => s + (Number(x.spend) || 0), 0);
        const googTot = googC.reduce((s: number, x: any) => s + (Number(x.spend) || 0), 0);
        const googPre = googC.filter((x: any) => isPreorderCampaign(x.campaign)).reduce((s: number, x: any) => s + (Number(x.spend) || 0), 0);
        const chanTot = metaTot + googTot;
        const shareProduced = chanTot > 0 ? (metaPre + googPre) / chanTot : 0;
        const producedSel = fulCats.includes("on-demand") || fulCats.includes("from-batch");
        const inStockSel = fulCats.includes("in-stock");
        const factor = (producedSel ? shareProduced : 0) + (inStockSel ? 1 - shareProduced : 0);
        cSpend *= factor; pSpend *= factor;
        cMetaSpend *= factor; pMetaSpend *= factor;
        cGoogleSpend *= factor; pGoogleSpend *= factor;
        console.log(`[overview ful ${market}]`, `meta=${metaSource} metaPre/${metaTot.toFixed(0)} googPre/${googTot.toFixed(0)}`, `shareProduced=${shareProduced.toFixed(3)} factor=${factor.toFixed(3)}`);
      } catch (err) {
        console.warn("[overview] fulfillment spend split failed:", err);
      }
    }
    const cGross = num(c.gross_sales), pGross = num(p.gross_sales);
    // Recalcular ROAS, CAC com spend Meta API real (substitui valores do BQ que usavam spend incompleto)
    const recalcRoasGross = cSpend > 0 ? cGross / cSpend : 0;
    const recalcRoasOrder = cSpend > 0 ? num(c.order_revenue) / cSpend : 0;
    const recalcCac = c.new_customers > 0 ? cSpend / c.new_customers : 0;
    const recalcRoasGrossPrev = pSpend > 0 ? pGross / pSpend : 0;
    const recalcCacPrev = p.new_customers > 0 ? pSpend / p.new_customers : 0;
    const cOrderRev = num(c.order_revenue), pOrderRev = num(p.order_revenue);
    const cTotal = num(c.total_sales), pTotal = num(p.total_sales);
    const cAov = num(c.aov);
    const cCac = num(c.cac), pCac = num(p.cac);
    // ROAS Total Sales = Total Sales / Spend (Meta API real)
    const recalcRoasTotal = cSpend > 0 ? cTotal / cSpend : 0;
    const recalcRoasTotalPrev = pSpend > 0 ? pTotal / pSpend : 0;

    const metrics: Metric[] = [
      baseMetric({
        key: "amount_spent",
        label: "AMOUNT SPENT",
        value: cSpend,
        formatted: formatCurrency(cSpend, currency),
        delta_pct: pct(cSpend, pSpend),
      }),
      baseMetric({
        key: "meta_spend",
        label: "META SPEND",
        value: cMetaSpend,
        formatted: formatCurrency(cMetaSpend, currency),
        delta_pct: pct(cMetaSpend, pMetaSpend),
      }),
      baseMetric({
        key: "google_spend",
        label: "GOOGLE SPEND",
        value: cGoogleSpend,
        formatted: formatCurrency(cGoogleSpend, currency),
        delta_pct: pct(cGoogleSpend, pGoogleSpend),
        hint: market === "US" ? "Google Ads US" : "Google Ads BR",
      }),
      baseMetric({
        key: "roas_total",
        label: "ROAS TOTAL SALES",
        value: recalcRoasTotal,
        formatted: formatMultiplier(recalcRoasTotal),
        currency: null,
        delta_pct: pct(recalcRoasTotal, recalcRoasTotalPrev),
        hint: "Total Sales / Spend",
      }),
      baseMetric({
        key: "cac",
        label: "CAC",
        value: recalcCac,
        formatted: formatCurrency(recalcCac, currency, false),
        delta_pct: pct(recalcCac, recalcCacPrev),
      }),
      baseMetric({
        key: "gross_sales",
        label: "GROSS SALES",
        value: cGross,
        formatted: formatCurrency(cGross, currency),
        delta_pct: pct(cGross, pGross),
      }),
      baseMetric({
        key: "total_sales",
        label: "TOTAL SALES",
        value: cTotal,
        formatted: formatCurrency(cTotal, currency),
        delta_pct: pct(cTotal, pTotal),
      }),
      baseMetric({
        key: "units",
        label: "UNIDADES VENDIDAS",
        value: num(c.units),
        formatted: formatNumber(num(c.units)),
        currency: null,
        delta_pct: pct(num(c.units), num(p.units)),
      }),
      baseMetric({
        key: "orders",
        label: "ORDERS",
        value: c.orders,
        formatted: formatNumber(c.orders),
        currency: null,
        delta_pct: pct(c.orders, p.orders),
      }),
      baseMetric({
        key: "aov",
        label: "AOV",
        value: cAov,
        formatted: formatCurrency(cAov, currency, false),
        hint: market === "US" ? "Order Rev / Orders" : "Order Rev / Orders",
      }),
      baseMetric({
        key: "new_customers",
        label: "NEW CUSTOMERS",
        value: c.new_customers,
        formatted: formatNumber(c.new_customers),
        currency: null,
        delta_pct: pct(c.new_customers, p.new_customers),
      }),
    ];

    return { market, period, date_range: range, metrics, generated_at };
  });
}
