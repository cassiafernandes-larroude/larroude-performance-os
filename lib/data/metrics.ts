import type { Market, Period, MetricBundle, Metric, MetricSource } from "@/types/metric";
import { previousRangeOf } from "@/lib/utils/periods";
import { calcPeriod } from "@/lib/main-dashboard/utils";
import type { PeriodKey } from "@/lib/main-dashboard/types";
import { formatCurrency, formatMultiplier, formatNumber, formatPercent } from "@/lib/utils/format";
import { hasBigQueryCredentials, runQuery } from "@/lib/bigquery/client";
import { aggregatedKpisSQL } from "@/lib/bigquery/queries/metrics";
import { type FulfillmentCategory } from "@/lib/shared/fulfillment-category";
import { getPreorderMotherSkus } from "@/lib/shared/preorder-skus";
import { getMetaSpendApi, hasMetaCredentials } from "@/lib/meta-api";
import { getMetaSpendAdjustment } from "@/lib/shared/meta-adjustments";
import { cached } from "@/lib/cache";
import { getFixedToolsCostInRange, getAgentShopCost, CHANNEL_COSTS } from "@/lib/channel-costs";
import { todayInMarket } from "@/lib/utils/market-tz";
import { getTodaySales, getTodayRefunds } from "@/lib/unit-economics/shopify-today";

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

// Cassia 2026-06-21: CONVERGENCIA com o Dashboard Principal. Antes estas funcoes usavam janela
// rolling de N dias com "ontem" em UTC; o Main usa calcPeriod (meses-calendario p/ 3M/6M/12M e
// D-1 no fuso do mercado). Para a MESMA selecao de periodo bater entre Overview e Main, delegamos
// 100% ao calcPeriod do Main (mesma SQL de janela, mesmo TZ).
function toPeriodKey(period: Period): PeriodKey {
  return (period === "today" ? "1d" : period) as PeriodKey;
}
function dateRangeCompleted(period: Period, market: Market = "US"): { from: string; to: string } {
  const cp = calcPeriod(toPeriodKey(period), undefined, market);
  return { from: cp.start, to: cp.end };
}

function previousDateRangeCompleted(period: Period, market: Market = "US"): { from: string; to: string } {
  const cp = calcPeriod(toPeriodKey(period), undefined, market);
  return { from: cp.prevStart, to: cp.prevEnd };
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

// Cassia 2026-06-21: SEM dados-mock. Quando o BigQuery nao responde, devolvemos uma linha
// ZERADA e marcamos source="Unavailable" — a UI mostra "dados indisponiveis", NUNCA numeros
// plausiveis inventados (requisito: nenhum dado inventado). Antes havia MOCK_US/MOCK_BR aqui.
const ZERO_ROW: AggRow = {
  gross_sales: 0, discounts: 0, order_revenue: 0, total_sales: 0,
  orders: 0, aov: 0, spend: 0, meta_spend: 0, google_spend: 0,
  roas_gross: 0, roas_order: 0, roas_total: 0, new_customers: 0, cac: 0,
};

export async function getMetricBundle(
  market: Market,
  period: Period,
  customRange?: { from: string; to: string },
  fulCats?: FulfillmentCategory[] | null
): Promise<MetricBundle> {
  await getPreorderMotherSkus(market); // warm cache p/ exclusão pre-order
  const fulKey = fulCats && fulCats.length ? fulCats.slice().sort().join('+') : 'all';
  // Cassia 2026-07-02: v16 — payload agora inclui preorder_spend/preorder_roas.
  const cacheKey = customRange
    ? `metrics-v16-preorder:${market}:custom:${customRange.from}:${customRange.to}:ful=${fulKey}`
    : `metrics-v16-preorder:${market}:${period}:ful=${fulKey}`;
  return cached(cacheKey, 1800, async () => {
    const range = customRange ?? dateRangeCompleted(period, market);
    const prevRange = customRange
      ? previousRangeOf(customRange.from, customRange.to)
      : previousDateRangeCompleted(period, market);

    const [curr, prev] = await Promise.all([
      fetchKpis(market, range, fulCats),
      fetchKpis(market, prevRange, fulCats),
    ]);

    // Cassia 2026-06-21: dataAvailable = temos dado real (BQ) OU dado live de hoje (Shopify D0).
    // Sem isso, source="Unavailable" e a UI avisa em vez de exibir zeros como se fossem reais.
    let dataAvailable = !!curr;
    const c: AggRow = { ...(curr ?? ZERO_ROW) };
    const p = prev ?? ZERO_ROW;

    // Cassia 2026-06-12: se o range eh "hoje" (D0) no fuso do market, BQ ainda
    // nao tem os dados (pipeline diario). Override sales/orders/aov via Shopify
    // Admin API direto (intra-dia, near real-time) + Google spend via Supermetrics.
    const todayMkt = todayInMarket(market);
    const isToday = range.from === todayMkt && range.to === todayMkt;
    if (isToday) {
      try {
        const t = await getTodaySales(market);
        const todayOrders = t.totalOrders || 0;
        // DTC (mesma regra do resto): GROSS = pré-desconto; TOTAL = receita do pedido (total_price,
        // c/ imposto+frete, líquido de desconto) − refunds DTC criados hoje. Igual ao período do BQ
        // (total_price − refunds), mas filtrado DTC (não a loja inteira do ShopifyQL/TW).
        const todayGross = t.totalGrossRevenue || 0;
        const todayOrderRev = t.totalRevenue || 0;
        let todayRefunds = 0;
        try {
          todayRefunds = await getTodayRefunds(market);
        } catch (e) {
          console.warn(`[overview today] refunds ${market} falhou (total sem subtrair returns de hoje):`, (e as Error)?.message);
        }
        const todayTotal = Math.max(0, todayOrderRev - todayRefunds);
        if (todayOrders > 0 || todayOrderRev > 0 || todayGross > 0) dataAvailable = true; // dado live real de hoje
        c.gross_sales = todayGross;     // GROSS SALES = total_line_items_price (pré-desconto), DTC
        c.order_revenue = todayOrderRev;
        c.total_sales = todayTotal;     // TOTAL SALES = total_price − refunds (DTC), igual ao período
        c.orders = todayOrders;
        c.aov = todayOrders > 0 ? todayTotal / todayOrders : 0;
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

    // Cassia 2026-06-21: source reflete disponibilidade real (apos overrides de hoje). Se a fonte
    // nao respondeu, "Unavailable" — a UI avisa que os valores nao sao reais.
    const source: MetricSource = dataAvailable ? "BQ" : "Unavailable";

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

    // Cassia 2026-06-21: Google vem do BQ gold.all_channels_daily (confiável; Supermetrics está
    // com quota mensal estourada). gold tem ~2 dias de lag, então no Overview (D-1) o dia exato
    // pode vir 0 — nesse caso usa o ÚLTIMO dia disponível como proxy (com hint da data).
    let cGoogleSpend = num(c.google_spend);
    let pGoogleSpend = num(p.google_spend);
    let googleLatestDate: string | null = null;
    try {
      const { getGoogleSpendBQ } = await import("@/lib/google-ads-native/queries");
      const [gCur, gPrev] = await Promise.all([
        getGoogleSpendBQ(market, range.from, range.to),
        getGoogleSpendBQ(market, prevRange.from, prevRange.to),
      ]);
      // Cassia 2026-06-24: HOJE (D0) NUNCA usa o proxy do último dia do gold (= ontem) — o gold tem
      // ~2d de lag e isso fazia o Google de hoje puxar o custo de ontem. No D0 mantém o Supermetrics
      // intradiário (c.google_spend, já setado acima) ou o gold in-range se houver; senão 0.
      if (isToday) {
        if (gCur.inRange > 0) cGoogleSpend = gCur.inRange;
        // D0 intradiário: Google Ads API DIRETA (fonte primária — não depende da quota do Supermetrics
        // nem do lag do gold). Se vier > 0, prevalece sobre Supermetrics/gold.
        try {
          const { getGoogleAdsSpendByDay } = await import("@/lib/cac-dashboard/connectors/google-ads");
          const gApi = await getGoogleAdsSpendByDay(market as "US" | "BR", range.from, range.to);
          const apiToday = gApi.data.get(range.from) ?? 0;
          if (apiToday > 0) cGoogleSpend = apiToday;
        } catch (e) {
          console.warn(`[overview google D0 API ${market}]`, (e as Error)?.message);
        }
        // senão mantém cGoogleSpend = Supermetrics de hoje (ou 0) — nunca o latestSpend (ontem).
      } else {
        cGoogleSpend = gCur.inRange > 0 ? gCur.inRange : gCur.latestSpend;
        if (gCur.inRange === 0 && gCur.latestSpend > 0) googleLatestDate = gCur.latestDate;
      }
      pGoogleSpend = gPrev.inRange > 0 ? gPrev.inRange : gPrev.latestSpend;
      console.log(`[overview google ${market} ${range.from}..${range.to}]`,
        `inRange=$${gCur.inRange.toFixed(0)} latest=$${gCur.latestSpend.toFixed(0)} (${gCur.latestDate})`,
        `FINAL=$${cGoogleSpend.toFixed(0)}`);
    } catch (err) {
      console.warn("[overview] Google BQ fetch failed, using base query value:", err);
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
    // Cassia 2026-06-21: ajuste manual Meta US +$400k Set/2025 (pro-rata), MESMA regra do
    // Main/CAC/LTV/Consolidated. Sem isso o Overview divergia ~$400k em spend/ROAS/CAC nos
    // periodos que cobrem Set/2025. getMetaSpendAdjustment retorna 0 fora de US/Set-2025.
    cMetaSpend += getMetaSpendAdjustment(market, range.from, range.to);
    pMetaSpend += getMetaSpendAdjustment(market, prevRange.from, prevRange.to);
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
        // Meta ad-level: pré-lançamento = campanha pre-order/PreOrder/pré-venda OU SKU do anúncio na coleção.
        const { getMetaPreorderSpend } = await import("@/lib/shared/preorder-spend");
        const { getPreorderMotherSkusCached } = await import("@/lib/shared/preorder-skus");
        const metaAd = await getMetaPreorderSpend(market as any, range.from, range.to, getPreorderMotherSkusCached(market as any)).catch(() => ({ total: 0, preorder: 0 }));
        let metaTot = metaAd.total, metaPre = metaAd.preorder;
        if (metaTot === 0) {
          metaTot = metaC.reduce((s: number, x: any) => s + (Number(x.spend) || 0), 0);
          metaPre = metaC.filter((x: any) => isPreorderCampaign(x.campaign_name)).reduce((s: number, x: any) => s + (Number(x.spend) || 0), 0);
        }
        const googTot = googC.reduce((s: number, x: any) => s + (Number(x.spend) || 0), 0);
        const googPre = googC.filter((x: any) => isPreorderCampaign(x.campaign)).reduce((s: number, x: any) => s + (Number(x.spend) || 0), 0);
        const chanTot = metaTot + googTot;
        // Cassia 2026-06-20: Pre-Order <- campanhas pre-order; In-Stock + On-Demand <- demais,
        // divididas proporcionalmente pela receita de cada origem (queryOriginShare).
        const { queryOriginShare } = await import("@/lib/main-dashboard/queries");
        const osRows: any[] = await queryOriginShare(market as any, range.from, range.to).catch(() => []);
        const osRev = (cat: string) => Number((osRows || []).find((r: any) => r.category === cat)?.revenue) || 0;
        const inRev = osRev("in-stock"), odRev = osRev("on-demand"); const baseRev = inRev + odRev;
        const inShare = baseRev > 0 ? inRev / baseRev : 0.5, odShare = baseRev > 0 ? odRev / baseRev : 0.5;
        const sharePreorder = chanTot > 0 ? (metaPre + googPre) / chanTot : 0;
        const shareNonPre = 1 - sharePreorder;
        const preorderSel = fulCats.includes("pre-order");
        const producedSel = fulCats.includes("on-demand") || fulCats.includes("from-batch");
        const inStockSel = fulCats.includes("in-stock");
        const factor = (preorderSel ? sharePreorder : 0) + shareNonPre * ((inStockSel ? inShare : 0) + (producedSel ? odShare : 0));
        const shareProduced = sharePreorder; // (compat log)
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

    // Cassia 2026-07-02: expõe o split pre-order que a SQL do gold já calcula (regex de campanha
    // pre-order/pre-venda) mas era descartado antes de chegar na resposta. Spend = Meta pre-order
    // + Google pre-order do BQ gold (Meta pode ter ~2d de lag — D0/D-1 pode vir 0). ROAS pre-order
    // = receita de pedidos com origem pre-order (queryOriginShare, assigned location) / spend.
    const cPreorderSpend = num(c.meta_spend_preorder) + num(c.google_spend_preorder);
    const pPreorderSpend = num(p.meta_spend_preorder) + num(p.google_spend_preorder);
    let preorderRoas: number | null = null;
    if (cPreorderSpend > 0) {
      try {
        const { queryOriginShare } = await import("@/lib/main-dashboard/queries");
        const osRows = await queryOriginShare(market as any, range.from, range.to);
        const preorderRevenue = Number((osRows || []).find((r: any) => r.category === "pre-order")?.revenue) || 0;
        preorderRoas = preorderRevenue / cPreorderSpend;
      } catch (err) {
        console.warn("[overview preorder] origin share fetch failed:", err);
      }
    }

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
        hint: googleLatestDate ? `Google Ads ${market} · dado de ${googleLatestDate}` : (market === "US" ? "Google Ads US" : "Google Ads BR"),
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
      // Cassia 2026-07-02: pre-order fora dos 8 cards principais (Overview usa slice(0,8)) —
      // consumido pela linha "Pré-Order" do app/page.tsx.
      baseMetric({
        key: "preorder_spend",
        label: "PRÉ-ORDER SPEND",
        value: cPreorderSpend,
        formatted: formatCurrency(cPreorderSpend, currency),
        delta_pct: pct(cPreorderSpend, pPreorderSpend),
        hint: "Campanhas pre-order (Meta + Google · BQ gold)",
      }),
      baseMetric({
        key: "preorder_roas",
        label: "PRÉ-ORDER ROAS",
        value: preorderRoas ?? 0,
        formatted: preorderRoas != null ? formatMultiplier(preorderRoas) : "—",
        currency: null,
        delta_pct: null,
        hint: "Receita pedidos pré-order / spend pré-order",
      }),
    ];

    return { market, period, date_range: range, metrics, generated_at };
  });
}
