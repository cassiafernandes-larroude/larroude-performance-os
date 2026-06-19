// Orquestra todas as queries do BigQuery e monta o DashboardPayload final
// — KPIs, gráficos diários, funil, canais, campanhas e alertas.
//
// Lógica de Net Sales / AOV alinhada ao PDF de referência:
//   Net Sales    = Gross Sales − Discounts − Returns
//   Order Revenue = Gross Sales − Discounts
//   AOV          = Order Revenue / Orders        (NÃO Net/Orders)
//
// Granularidade dinâmica (1 barra por bucket):
//   7d / 14d / 28d  → 'day'
//   3M              → 'week'
//   6M / 12M        → 'month'

import {
  queryAggregatedKpis,
  queryDailySales,
  queryDailyReturns,
  queryDailyAds,
  queryDailyCac,
  queryDailySessions,
  queryCampaigns,
  queryChannelMix,
  queryChannelMixDaily,
  queryShopifyFunnel,
} from './queries';
import { queryShopifySessions, queryShopifySessionsTotal } from './shopify-admin';
import { queryMetaAdsTotal, queryMetaAdsDaily, queryMetaCampaigns } from './meta-ads';
import {
  queryGoogleAdsTotalViaSupermetrics,
  queryGoogleAdsViaSupermetrics,
  queryGoogleCampaignsViaSupermetrics,
  queryMetaCampaignsViaSupermetrics,
  queryMetaAdsTotalViaSupermetrics,
  queryMetaAdsViaSupermetrics,
  queryGA4TotalViaSupermetrics,
  queryGA4ViaSupermetrics,
  queryGA4SessionsByChannel,
} from './supermetrics';
import { calcPeriod, fmtCurrency, fmtMultiple, fmtNumber, fmtPercent, granularityFor, pctChange, safeDiv } from './utils';
import { getMetaSpendAdjustment, getMetaSpendAdjustmentByDay } from '@/lib/shared/meta-adjustments';
import { getFixedToolsCostInRange, getAgentShopCost, getPercentRevenueCosts, CHANNEL_COSTS } from '@/lib/channel-costs';
import { type FulfillmentCategory, isPreorderCampaign } from '@/lib/shared/fulfillment-category';
import type {
  CampaignRow,
  ChannelRevenue,
  DailyPoint,
  DashboardAlert,
  DashboardPayload,
  FunnelSteps,
  KpiValue,
  Market,
  PeriodKey,
  TopCampaignRoas,
} from './types';

// Cores por canal (alinhadas ao PDF de referência)
const CHANNEL_COLORS: Record<string, string> = {
  'Sem UTM / Direto':      '#475569',
  'Meta Ads':              '#3b82f6',
  'Google Ads':            '#10b981',
  'Klaviyo Email':         '#8b5cf6',
  'SMS Attentive':         '#a855f7',
  'Awin Affiliate':        '#f59e0b',
  'ShopMy':                '#ec4899',
  'Criteo':                '#f97316',
  'Agent.shop':            '#06b6d4',
  'Orgânico Search':       '#22c55e',
  'Orgânico Social':       '#94a3b8',
  'Outros':                '#64748b',
};

function classifyCampaign(name: string, roas: number | null, spend: number): CampaignRow['status'] {
  const lc = (name || '').toLowerCase();
  if (lc.includes('awareness')) return 'AWARENESS';
  if (lc.includes('traffic')) return 'TRÁFEGO';
  if (lc.includes('leads')) return 'LEADS';
  if (lc.includes('engagement')) return 'ENGAJAMENTO';
  // Sem ROAS e sem spend significativo → revisar
  if (roas == null || spend < 50) return 'REVISAR';
  if (roas >= 3.0) return 'ESCALAR';
  if (roas >= 2.0) return 'ATIVO';
  if (roas >= 1.0) return 'REVISAR';
  return 'PAUSAR';
}

function alignByDate(rows: any[], dateKey: string): Map<string, any> {
  const m = new Map<string, any>();
  for (const r of rows) m.set(String(r[dateKey]), r);
  return m;
}

function num(v: any): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export async function getDashboardPayload(
  market: Market,
  periodKey: PeriodKey,
  endDate?: string,
  customStart?: string,
  fulCats?: FulfillmentCategory[] | null,
): Promise<DashboardPayload> {
  // Build period (com possivel override de start customizado)
  const basePeriod = calcPeriod(periodKey, endDate, market);
  // Aceita start == end (single day) — usa <= em vez de <
  const hasCustom = !!customStart && customStart <= basePeriod.end;
  const startMs = hasCustom ? Date.parse(customStart + 'T00:00:00Z') : 0;
  const endMs = hasCustom ? Date.parse(basePeriod.end + 'T00:00:00Z') : 0;
  const customDays = hasCustom ? Math.round((endMs - startMs) / 86400000) + 1 : 0;
  const customPrevEndMs = hasCustom ? startMs - 86400000 : 0;
  const customPrevStartMs = hasCustom ? customPrevEndMs - (customDays - 1) * 86400000 : 0;
  const period = hasCustom
    ? {
        start: customStart as string,
        end: basePeriod.end,
        days: customDays,
        prevStart: new Date(customPrevStartMs).toISOString().slice(0, 10),
        prevEnd: new Date(customPrevEndMs).toISOString().slice(0, 10),
      }
    : basePeriod;
  const currency = market === 'US' ? 'USD' : 'BRL';
  // Granularidade — regras finais do user:
  //   7d, 14d, 28d → diária (1 barra por dia)
  //   3M → semanal (1 barra por semana)
  //   6M, 12M → mensal (1 barra por mês)
  // Custom range:
  //   ≤ 40 dias → diária
  //   41-90 dias (até ~3 meses) → semanal
  //   > 90 dias → mensal
  let granularity: 'day' | 'week' | 'month';
  if (hasCustom) {
    if (period.days <= 40) granularity = 'day';
    else if (period.days <= 90) granularity = 'week';
    else granularity = 'month';
  } else {
    if (periodKey === '3M') granularity = 'week';
    else if (periodKey === '6M' || periodKey === '12M') granularity = 'month';
    else granularity = 'day';
  }

  // ----- Range estendido para CHARTS quando período <7 dias -----
  // Charts mantêm sempre 7 barras: estende backward até totalizar 7 dias.
  // Barras fora do período selecionado ficam com opacidade reduzida (contexto).
  const chartStart = period.days < 7
    ? new Date(Date.parse(period.end + 'T00:00:00Z') - 6 * 86400000).toISOString().slice(0, 10)
    : period.start;

  // Roda em paralelo (charts usam chartStart, KPIs e agregações usam period.start)
  const [
    aggCurr, aggPrev, salesDaily, returnsDaily, adsDaily, cacDaily,
    sessionsDaily, sessionsPrev, campaigns, channelMix,
    shopifySessions, shopifySessionsPrev,
    googleAdsCurr, googleAdsPrev,
    metaAdsCurr, metaAdsPrev,
    ga4Curr, ga4Prev, ga4Daily,
  ] = await Promise.all([
    queryAggregatedKpis(market, period.start, period.end, fulCats),
    queryAggregatedKpis(market, period.prevStart, period.prevEnd, fulCats),
    queryDailySales(market, chartStart, period.end, granularity),
    queryDailyReturns(market, chartStart, period.end, granularity),
    queryDailyAds(market, chartStart, period.end, granularity),
    queryDailyCac(market, chartStart, period.end, granularity),
    queryDailySessions(market, chartStart, period.end, granularity),
    queryDailySessions(market, period.prevStart, period.prevEnd, granularity),
    queryCampaigns(market, period.start, period.end),
    queryChannelMix(market, period.start, period.end),
    queryShopifySessionsTotal(market, period.start, period.end),
    queryShopifySessionsTotal(market, period.prevStart, period.prevEnd),
    queryGoogleAdsTotalViaSupermetrics(market, period.start, period.end),
    queryGoogleAdsTotalViaSupermetrics(market, period.prevStart, period.prevEnd),
    queryMetaAdsTotal(market, period.start, period.end),       // ← Meta Graph API direto
    queryMetaAdsTotal(market, period.prevStart, period.prevEnd),
    queryGA4TotalViaSupermetrics(market, period.start, period.end),
    queryGA4TotalViaSupermetrics(market, period.prevStart, period.prevEnd),
    queryGA4ViaSupermetrics(market, period.start, period.end),
  ]);
  // Daily — Meta DIRETO via Graph API (todas as contas), Google via Supermetrics
  // Canal diário usa chartStart para 7 barras mínimas (igual aos demais gráficos).
  const [googleAdsDaily, metaApiDaily, ga4ByChannelDaily, channelMixDaily, googleCampaigns, metaApiCampaigns, shopifySessionsDaily, shopifyFunnel] = await Promise.all([
    queryGoogleAdsViaSupermetrics(market, chartStart, period.end),
    queryMetaAdsDaily(market, chartStart, period.end),
    queryGA4SessionsByChannel(market, chartStart, period.end),
    queryChannelMixDaily(market, chartStart, period.end, granularity),
    queryGoogleCampaignsViaSupermetrics(market, period.start, period.end),
    queryMetaCampaigns(market, period.start, period.end),
    queryShopifySessions(market, chartStart, period.end),
    queryShopifyFunnel(market, period.start, period.end),
  ]);
  // Compatibilidade: metaAdsDaily era um nome usado em vários lugares, renomeio.
  const metaAdsDaily = metaApiDaily;

  // ----- KPIs -----
  // SPEND = Meta Ads (DIRETO via Meta Graph API) + Google Ads (Supermetrics)
  //   US: Meta Larroude US + Meta PRE-ORDER US + Google Ads US (todos USD)
  //   BR: Meta Larroude BR + Meta Pre-Order BR + Meta Brand BR (USD→BRL) + Google Ads BR (BRL)
  // Meta API direto = fonte de verdade (todas as contas, sem intermediário)
  const metaApiSpend = num(metaAdsCurr.spend);
  const metaApiSpendPrev = num(metaAdsPrev.spend);
  const supermetricsGoogleSpend = num(googleAdsCurr.spend);
  const supermetricsGoogleSpendPrev = num(googleAdsPrev.spend);
  // Aliases para preservar nomes usados abaixo
  const supermetricsMetaSpend = metaApiSpend;
  const supermetricsMetaSpendPrev = metaApiSpendPrev;
  const bqMetaSpend = num(aggCurr.spend) - num(aggCurr.google_spend);
  const bqGoogleSpend = num(aggCurr.google_spend);
  const bqGoogleSpendPrev = num(aggPrev.google_spend);
  const bqMetaSpendPrev = num(aggPrev.spend) - bqGoogleSpendPrev;
  // Estratégia: Supermetrics-FIRST. Se Supermetrics retornar dados (>0), confiar.
  // Se Supermetrics ausente/falhar, usar BQ (bqMetaSpend = total - google_spend).
  let finalMetaSpend = supermetricsMetaSpend > 0 ? supermetricsMetaSpend : bqMetaSpend;
  let finalGoogleSpend = supermetricsGoogleSpend > 0 ? supermetricsGoogleSpend : bqGoogleSpend;
  let finalMetaSpendPrev = supermetricsMetaSpendPrev > 0 ? supermetricsMetaSpendPrev : bqMetaSpendPrev;
  let finalGoogleSpendPrev = supermetricsGoogleSpendPrev > 0 ? supermetricsGoogleSpendPrev : bqGoogleSpendPrev;

  // AJUSTE MANUAL: Meta US +$400k Setembro/2025 (regra Cassia, REGRAS-LARROUDE-OS.md secao 3.3)
  // Pro-rata pelos dias do periodo que overlap com Set/2025.
  const metaAdjCurr = getMetaSpendAdjustment(market, period.start, period.end);
  const metaAdjPrev = getMetaSpendAdjustment(market, period.prevStart, period.prevEnd);
  finalMetaSpend += metaAdjCurr;
  finalMetaSpendPrev += metaAdjPrev;
  if (metaAdjCurr > 0 || metaAdjPrev > 0) {
    console.log(`[meta-adj ${market}]`, `curr=$${metaAdjCurr.toFixed(0)}`, `prev=$${metaAdjPrev.toFixed(0)}`);
  }

  // Cassia 2026-06-13: incluir tools cost (Klaviyo, Attentive, Criteo, Agent.shop)
  // no AMOUNT SPENT do Main Dashboard pra ROAS/CAC/CPO refletirem custo total.
  // Mesma regra do Overview (lib/data/metrics.ts).
  const fixedToolsCost = getFixedToolsCostInRange(market, period.start, period.end);
  const fixedToolsCostPrev = getFixedToolsCostInRange(market, period.prevStart, period.prevEnd);
  // Cassia 2026-06-14: TODOS canais % da receita (Agent.shop BR, Awin US+BR, ShopMy US)
  // calculados via helper genérico — substitui getAgentShopCost
  const percentRevCosts = getPercentRevenueCosts(market, channelMix as any[]);
  const agentShopCost = Object.values(percentRevCosts).reduce((s, v) => s + v, 0);
  // Prev: aproxima usando mesma soma (não temos channelMix do período anterior)
  const agentShopCostPrev = agentShopCost;

  // Cassia 2026-06-17: filtro de origem -> escala o spend pelo split pre-order das campanhas
  // (Meta API + Google Supermetrics, ao vivo). produzido = sob demanda + from-batch.
  let _fulFactor = 1;
  if (fulCats && fulCats.length) {
    try {
      let metaCs: any[] = Array.isArray(metaApiCampaigns) ? (metaApiCampaigns as any[]) : [];
      if (!metaCs.length) metaCs = await queryMetaCampaignsViaSupermetrics(market, period.start, period.end).catch(() => []);
      const googCs: any[] = Array.isArray(googleCampaigns) ? (googleCampaigns as any[]) : [];
      const sumIf = (arr: any[], f: (x: any) => boolean) => arr.filter(f).reduce((s, x) => s + (Number(x.spend) || 0), 0);
      const metaTot = sumIf(metaCs, () => true), metaPre = sumIf(metaCs, (x) => isPreorderCampaign(x.campaign_name));
      const googTot = sumIf(googCs, () => true), googPre = sumIf(googCs, (x) => isPreorderCampaign(x.campaign));
      const chanTot = metaTot + googTot;
      const shareProduced = chanTot > 0 ? (metaPre + googPre) / chanTot : 0;
      const producedSel = fulCats.includes('on-demand') || fulCats.includes('from-batch');
      const inStockSel = fulCats.includes('in-stock');
      _fulFactor = (producedSel ? shareProduced : 0) + (inStockSel ? 1 - shareProduced : 0);
      console.log(`[main ful ${market}]`, `shareProduced=${shareProduced.toFixed(3)} factor=${_fulFactor.toFixed(3)}`);
    } catch (e) { console.warn('[main ful spend]', e); }
  }
  let spend = finalMetaSpend + finalGoogleSpend + fixedToolsCost + agentShopCost;
  spend *= _fulFactor;
  finalMetaSpend *= _fulFactor; finalGoogleSpend *= _fulFactor;
  // Debug log (visível em vercel logs)
  console.log(`[spend ${market} ${period.start}..${period.end}]`,
    `meta_supermetrics=${supermetricsMetaSpend.toFixed(2)}`,
    `google_supermetrics=${supermetricsGoogleSpend.toFixed(2)}`,
    `meta_bq=${bqMetaSpend.toFixed(2)}`,
    `google_bq=${bqGoogleSpend.toFixed(2)}`,
    `final_meta=${finalMetaSpend.toFixed(2)}`,
    `final_google=${finalGoogleSpend.toFixed(2)}`,
    `tools_cost=${fixedToolsCost.toFixed(2)}`,
    `TOTAL=${spend.toFixed(2)}`,
  );
  const gross = num(aggCurr.gross_sales);
  const discounts = num(aggCurr.discounts);
  // Order Revenue = total_price (gross + shipping + tax − discounts), antes de refunds
  const orderRevenue = num(aggCurr.order_revenue);
  const refundValue = num(aggCurr.refund_value);
  // Total Sales = Order Revenue − Refunds (alinhado ao Shopify oficial "Total Sales")
  const totalSales = orderRevenue - refundValue;
  const orders = num(aggCurr.orders);
  const units = num(aggCurr.units);
  const aov = safeDiv(orderRevenue, orders); // AOV = Order Revenue / Orders
  const returnRate = num(aggCurr.return_rate);
  // Pixel Purchases & Revenue - SEMPRE usar Meta Graph API direta (META_ACCESS_TOKEN do .env).
  // BQ gold.all_channels_daily as vezes para de receber Meta (ex: parou em 20/05/2026),
  // entao a API e a fonte de verdade. Cai pra BQ apenas se a API retornar 0.
  const metaApiPurchases = num(metaAdsCurr.purchases);
  const metaApiPurchaseValue = num(metaAdsCurr.purchase_value);
  const pixelPurch = metaApiPurchases > 0 ? metaApiPurchases : num(aggCurr.pixel_purchases);
  const pixelRevenue = metaApiPurchaseValue > 0 ? metaApiPurchaseValue : num(aggCurr.pixel_revenue);
  const newCust = num(aggCurr.new_customers);
  const cac = safeDiv(spend, newCust);
  const cpo = safeDiv(spend, orders);
  const cpa = safeDiv(spend, pixelPurch);
  const ctr = num(aggCurr.ctr);
  const cpc = num(aggCurr.cpc);
  const cpm = num(aggCurr.cpm);
  const reach = num(aggCurr.reach);
  const frequency = num(aggCurr.frequency);
  const roasGross = safeDiv(gross, spend);
  const roasOrder = safeDiv(orderRevenue, spend);
  const roasTotal = safeDiv(totalSales, spend);

  // Previous period — usa mesma lógica (Meta + Google Supermetrics)
  let pSpend = finalMetaSpendPrev + finalGoogleSpendPrev + fixedToolsCostPrev + agentShopCostPrev;
  pSpend *= _fulFactor;
  finalMetaSpendPrev *= _fulFactor; finalGoogleSpendPrev *= _fulFactor;
  const pGross = num(aggPrev.gross_sales);
  const pDiscounts = num(aggPrev.discounts);
  const pRefund = num(aggPrev.refund_value);
  const pOrderRev = num(aggPrev.order_revenue);
  const pTotal = pOrderRev - pRefund;
  const pOrders = num(aggPrev.orders);
  const pUnits = num(aggPrev.units);
  const pAov = safeDiv(pOrderRev, pOrders);
  // Previous period - mesma logica: Meta API direto > BQ
  const pMetaApiPurchases = num(metaAdsPrev.purchases);
  const pPixelPurch = pMetaApiPurchases > 0 ? pMetaApiPurchases : num(aggPrev.pixel_purchases);
  const pCtr = num(aggPrev.ctr);
  const pCpc = num(aggPrev.cpc);
  const pCpm = num(aggPrev.cpm);
  const pReach = num(aggPrev.reach);
  const pFreq = num(aggPrev.frequency);
  const pReturn = num(aggPrev.return_rate);
  const pRoasGross = safeDiv(pGross, pSpend);

  // Taxa de Conversão — várias fontes em ordem:
  //   0. ENV var SHOPIFY_SESSIONS_RATIO_* (calibração manual baseada em dados Shopify)
  //   1. Shopify Admin GraphQL (conversion_rate nativo)
  //   2. GA4 sessionConversionRate (Supermetrics)
  //   3. orders / GA4 sessions
  //   4. orders / Shopify Admin sessions
  // ENV: SHOPIFY_SESSIONS_RATIO_BR=59 (sessions per order, from Shopify Reports)
  //      SHOPIFY_SESSIONS_RATIO_US=72
  // CVR = 1 / ratio. Ex: ratio=59 → CVR ≈ 1.69% (ou usar SHOPIFY_CVR_TARGET_* direto)
  const ga4Sessions = num(ga4Curr.sessions);
  const ga4SessionsPrev = num(ga4Prev.sessions);
  const ga4CvrNative = num(ga4Curr.conversion_rate);
  const ga4CvrNativePrev = num(ga4Prev.conversion_rate);
  const shopifyAdminSessions = num(shopifySessions?.sessions ?? shopifySessions);
  const shopifyAdminSessionsPrev = num(shopifySessionsPrev?.sessions ?? shopifySessionsPrev);
  const shopifyAdminCvr = num((shopifySessions as any)?.conversion_rate);
  const shopifyAdminCvrPrev = num((shopifySessionsPrev as any)?.conversion_rate);
  const proxyTotalSessions = (sessionsDaily as any[]).reduce((s, r) => s + num(r.sessions), 0);
  const proxyTotalSessionsPrev = (sessionsPrev as any[]).reduce((s, r) => s + num(r.sessions), 0);

  // ENV-based calibração (mais alta prioridade — sempre bate com Shopify se setado)
  // Fallback hardcoded com valores documentados em lgeral/.env.local.example
  // (US 1.10%, BR 1.31% - alinhado com Shopify Admin "Taxa de conversao").
  // Pode ser sobreescrito setando SHOPIFY_CVR_TARGET_{US|BR} no Vercel.
  const CVR_TARGET_FALLBACK: Record<Market, number> = { US: 0.011, BR: 0.0131 };
  const envCvrTarget = num(process.env[`SHOPIFY_CVR_TARGET_${market}`])
                     || CVR_TARGET_FALLBACK[market];
  const envSessionsRatio = num(process.env[`SHOPIFY_SESSIONS_RATIO_${market}`]);
  const calibratedCvr = envCvrTarget > 0 ? envCvrTarget
                      : envSessionsRatio > 0 ? 1 / envSessionsRatio
                      : 0;

  // calibrationFactor = ratio entre CVR target Shopify e CVR proxy agregada.
  // Permite que o CVR diário VARIE pelos dados reais (orders/proxy_sessions)
  // mas o AGREGADO bata com o target Shopify (SHOPIFY_CVR_TARGET_*).
  // Ex: target=1.31%, proxy_avg=65% → factor=0.02 → multiplica proxy_daily por 0.02
  const proxyAggCvr = safeDiv(orders, proxyTotalSessions);
  const calibrationFactor = calibratedCvr > 0 && proxyAggCvr > 0
    ? calibratedCvr / proxyAggCvr
    : 0;

  // CVR final: prioridade ENV calibrada > Shopify Admin > GA4 > derivado
  let cvr = 0;
  let pCvr = 0;
  let cvrSource = 'none';
  if (calibratedCvr > 0 && calibratedCvr < 0.5) {
    cvr = calibratedCvr;
    pCvr = calibratedCvr; // mesma ratio para período anterior
    cvrSource = envCvrTarget > 0 ? `ENV target ${market}` : `ENV ratio ${market} (1/${envSessionsRatio})`;
  } else if (shopifyAdminCvr > 0 && shopifyAdminCvr < 0.5) {
    cvr = shopifyAdminCvr;
    pCvr = shopifyAdminCvrPrev > 0 && shopifyAdminCvrPrev < 0.5 ? shopifyAdminCvrPrev : 0;
    cvrSource = 'ShopifyAdmin (nativo)';
  } else if (ga4CvrNative > 0 && ga4CvrNative < 0.5) {
    cvr = ga4CvrNative;
    pCvr = ga4CvrNativePrev > 0 && ga4CvrNativePrev < 0.5 ? ga4CvrNativePrev : 0;
    cvrSource = 'GA4 sessionConversionRate';
  } else if (ga4Sessions > 0) {
    cvr = orders / ga4Sessions;
    pCvr = ga4SessionsPrev > 0 ? pOrders / ga4SessionsPrev : 0;
    cvrSource = 'orders/sessões GA4';
  } else if (shopifyAdminSessions > 0) {
    cvr = orders / shopifyAdminSessions;
    pCvr = shopifyAdminSessionsPrev > 0 ? pOrders / shopifyAdminSessionsPrev : 0;
    cvrSource = 'orders/sessões Shopify Admin';
  }

  const realSessions = ga4Sessions > 0 ? ga4Sessions
                     : shopifyAdminSessions > 0 ? shopifyAdminSessions
                     : 0;
  const realSessionsPrev = ga4SessionsPrev > 0 ? ga4SessionsPrev
                         : shopifyAdminSessionsPrev > 0 ? shopifyAdminSessionsPrev
                         : 0;
  const totalSessions = realSessions > 0 ? realSessions : proxyTotalSessions;
  const totalSessionsPrev = realSessionsPrev > 0 ? realSessionsPrev : proxyTotalSessionsPrev;
  console.log(`[cvr ${market} ${period.start}..${period.end}]`,
    `shopify_admin_cvr=${shopifyAdminCvr}`,
    `ga4_cvr_native=${ga4CvrNative}`,
    `ga4_sessions=${ga4Sessions}`,
    `shopify_admin_sessions=${shopifyAdminSessions}`,
    `source=${cvrSource}`,
    `orders=${orders}`,
    `cvr=${(cvr * 100).toFixed(4)}%`,
  );

  const kpis: KpiValue[] = [
    { label: 'AMOUNT SPENT', value: fmtCurrency(spend, market, { compact: true }), raw: spend, delta: pctChange(spend, pSpend), hint: market === 'US' ? 'Meta + Google + Klaviyo + Attentive + Criteo' : 'Meta + Google + Klaviyo + Criteo + Agent.shop (10% rev)', tone: 'default' },
    { label: 'META SPEND', value: fmtCurrency(finalMetaSpend, market, { compact: true }), raw: finalMetaSpend, delta: pctChange(finalMetaSpend, finalMetaSpendPrev), hint: market === 'US' ? 'Larroude US + Pre-Order US' : 'Larroude BR + Pre-Order BR + Brand BR (USD→BRL)', tone: 'default' },
    { label: 'GOOGLE SPEND', value: fmtCurrency(finalGoogleSpend, market, { compact: true }), raw: finalGoogleSpend, delta: pctChange(finalGoogleSpend, finalGoogleSpendPrev), hint: market === 'US' ? 'Google Ads US' : 'Google Ads BR (native BRL)', tone: 'default' },
    { label: 'ROAS GROSS SALES', value: fmtMultiple(roasGross), raw: roasGross, delta: pctChange(roasGross, pRoasGross), tone: 'default' },
    { label: 'ROAS ORDER REVENUE', value: fmtMultiple(roasOrder), raw: roasOrder, hint: 'Order Revenue / Spend', tone: 'accent' },
    { label: 'ROAS TOTAL SALES', value: fmtMultiple(roasTotal), raw: roasTotal, hint: 'Total Sales / Spend', tone: 'warn' },
    { label: 'GROSS SALES', value: fmtCurrency(gross, market, { compact: true }), raw: gross, delta: pctChange(gross, pGross), tone: 'default' },
    { label: 'TOTAL SALES', value: fmtCurrency(totalSales, market, { compact: true }), raw: totalSales, delta: pctChange(totalSales, pTotal), tone: 'default' },
    { label: 'ORDERS', value: fmtNumber(orders), raw: orders, delta: pctChange(orders, pOrders), tone: 'default' },
    { label: 'AOV', value: fmtCurrency(aov, market), raw: aov, delta: pctChange(aov, pAov), tone: 'good' },
    { label: 'CAC (SPEND/NEW CUST.)', value: fmtCurrency(cac, market), raw: cac, hint: 'Spend / Shopify New Customers', tone: 'default', invertDelta: true },
    { label: 'CONVERSION RATE', value: cvr > 0 ? fmtPercent(cvr, 2) : '—', raw: cvr, delta: cvr > 0 && pCvr > 0 ? pctChange(cvr, pCvr) : null, hint: `Source: ${cvrSource}`, tone: 'good' },
    { label: 'CTR', value: fmtPercent(ctr, 2), raw: ctr, delta: pctChange(ctr, pCtr), tone: 'accent' },
    { label: 'UNITS SOLD', value: fmtNumber(units), raw: units, delta: pctChange(units, pUnits), tone: 'good' },
    // Cassia 2026-06-11: NEW CUSTOMER ORDERS removed from Main Dashboard.
    { label: 'NEW CUSTOMER REVENUE', value: fmtCurrency(num(aggCurr.new_customer_revenue), market, { compact: true }), raw: num(aggCurr.new_customer_revenue), delta: pctChange(num(aggCurr.new_customer_revenue), num(aggPrev.new_customer_revenue)), tone: 'good' },
    { label: 'RETURNING CUSTOMER REVENUE', value: fmtCurrency(num(aggCurr.returning_customer_revenue), market, { compact: true }), raw: num(aggCurr.returning_customer_revenue), delta: pctChange(num(aggCurr.returning_customer_revenue), num(aggPrev.returning_customer_revenue)), tone: 'accent' },
  ];

  // ----- Séries por bucket (day/week/month) -----
  const salesMap = alignByDate(salesDaily, 'date');
  const returnsMap = alignByDate(returnsDaily, 'date');
  const adsMap = alignByDate(adsDaily, 'date');
  const cacMap = alignByDate(cacDaily, 'date');

  // AJUSTE MANUAL Meta US +$400k Setembro/2025 — chart e KPI agregado
  // Distribui pro-rata dia-a-dia e re-agrupa no bucket atual (day/week/month)
  // para que o gráfico "Amount Spent (Ad Cost)" mostre Set/25 com ajuste somado.
  // Cobre toda janela visível do chart (chartStart pode ser anterior a period.start).
  const adjustmentRangeStart = chartStart < period.start ? chartStart : period.start;
  const metaAdjByDay = getMetaSpendAdjustmentByDay(market, adjustmentRangeStart, period.end);
  const metaAdjByBucket = new Map<string, number>();
  metaAdjByDay.forEach((amount, isoDate) => {
    const bucket = bucketDate(isoDate);
    metaAdjByBucket.set(bucket, (metaAdjByBucket.get(bucket) ?? 0) + amount);
  });

  // Helper: alinha datas diárias do Supermetrics/MetaAPI ao bucket do BQ (week/month).
  // BQ DATE_TRUNC(d, WEEK(MONDAY)) retorna a SEGUNDA-FEIRA da semana ISO.
  // BQ DATE_TRUNC(d, MONTH) retorna o PRIMEIRO DIA do mês.
  function bucketDate(iso: string): string {
    if (!iso) return iso;
    if (granularity === 'day') return iso;
    if (granularity === 'month') return iso.slice(0, 7) + '-01';
    // week: segunda-feira ISO
    const d = new Date(iso + 'T00:00:00Z');
    const dow = d.getUTCDay(); // 0=domingo, 1=segunda, ..., 6=sábado
    const offset = dow === 0 ? -6 : 1 - dow;
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }

  // Normaliza qualquer formato de data pra ISO YYYY-MM-DD (Supermetrics as vezes
  // retorna M/D/YYYY, ISO, ou outros formatos dependendo da config da conta).
  function normalizeISODate(raw: any): string | null {
    if (!raw) return null;
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return null;
  }

  // Spend Supermetrics (Meta + Google) — agregado por bucket (igual ao BQ)
  const supermetricsSpendDaily = new Map<string, number>();
  // Meta Pixel purchases via Meta Graph API direto (fonte de verdade, sempre atualizada)
  // BQ gold.all_channels_daily as vezes para de receber Meta (ex: parou em 20/05/2026),
  // por isso preferimos a API direta como fonte primaria para o daily.
  const metaApiPurchasesDaily = new Map<string, number>();
  let metaSpendDailySum = 0;
  let googleSpendDailySum = 0;
  for (const r of metaAdsDaily) {
    const iso = normalizeISODate(r.date);
    if (!iso) { console.warn(`[spend-daily ${market}] invalid Meta date:`, r.date); continue; }
    const b = bucketDate(iso);
    supermetricsSpendDaily.set(b, (supermetricsSpendDaily.get(b) ?? 0) + r.spend);
    metaApiPurchasesDaily.set(b, (metaApiPurchasesDaily.get(b) ?? 0) + (r.purchases ?? 0));
    metaSpendDailySum += r.spend;
  }
  for (const r of googleAdsDaily) {
    const iso = normalizeISODate((r as any).date);
    if (!iso) { console.warn(`[spend-daily ${market}] invalid Google date:`, (r as any).date); continue; }
    const b = bucketDate(iso);
    supermetricsSpendDaily.set(b, (supermetricsSpendDaily.get(b) ?? 0) + r.spend);
    googleSpendDailySum += r.spend;
  }
  console.log(`[spend-daily ${market}] meta_daily_sum=$${metaSpendDailySum.toFixed(0)} google_daily_sum=$${googleSpendDailySum.toFixed(0)} google_rows=${googleAdsDaily.length}`);

  // dateList = SOMENTE buckets do BQ (que já estão agregados corretamente por week/month).
  // NÃO incluir keys diárias de Supermetrics — gerava barras vazias entre buckets.
  const allDates = new Set<string>();
  for (const r of salesDaily) allDates.add(String(r.date));
  for (const r of adsDaily) allDates.add(String(r.date));
  for (const r of returnsDaily) allDates.add(String(r.date));
  // Adiciona supermetrics SE bucket ainda não existe (extensão para datas com spend mas sem vendas)
  for (const d of supermetricsSpendDaily.keys()) allDates.add(d);
  const dateList = Array.from(allDates).sort();

  const daily: Record<string, DailyPoint[]> = {
    gross_sales: [], total_sales: [], order_revenue: [],
    margin_total_sales: [], margin_order_revenue: [], // Total/Order Revenue − Spend (lucro pós-mídia)
    returns: [], discounts: [], spend: [],
    roas_gross: [], roas_order: [], roas_total: [],
    aov: [], cpo: [], cpa: [], cac: [], cvr: [],
    orders: [], pixel_purchases: [],
    units: [], // Cassia 2026-06-13: gráfico de unidades vendidas
    sessions: [], sessions_prev: [], direct_sessions: [], organic_sessions: [], referral_sessions: [],
  };

  // ----- Sessions: GA4 agregado por bucket (week/month) -----
  // Agregar ga4ByChannelDaily (que vem diário do GA4) no mesmo bucket do BQ
  const sessionsByBucket = new Map<string, { total: number; direct: number; organic: number; referral: number }>();
  if (ga4ByChannelDaily && ga4ByChannelDaily.length > 0) {
    for (const r of ga4ByChannelDaily) {
      const b = bucketDate(r.date);
      const cur = sessionsByBucket.get(b) ?? { total: 0, direct: 0, organic: 0, referral: 0 };
      cur.total += r.total;
      cur.direct += r.direct;
      cur.organic += r.organic;
      cur.referral += r.referral;
      sessionsByBucket.set(b, cur);
    }
    for (const d of dateList) {
      const s = sessionsByBucket.get(d) ?? { total: 0, direct: 0, organic: 0, referral: 0 };
      daily.sessions.push({ date: d, value: s.total });
      daily.direct_sessions.push({ date: d, value: s.direct });
      daily.organic_sessions.push({ date: d, value: s.organic });
      daily.referral_sessions.push({ date: d, value: s.referral });
    }
  } else {
    // Fallback proxy Shopify (sessionsDaily já agregado pelo BQ)
    const proxyMap = alignByDate(sessionsDaily as any[], 'date');
    for (const d of dateList) {
      const r = proxyMap.get(d) ?? {};
      daily.sessions.push({ date: d, value: num(r.sessions) });
      daily.direct_sessions.push({ date: d, value: num(r.direct_sessions) });
      daily.organic_sessions.push({ date: d, value: num(r.organic_sessions) });
      daily.referral_sessions.push({ date: d, value: num(r.referral_sessions) });
    }
  }
  for (const r of sessionsPrev as any[]) {
    daily.sessions_prev.push({ date: String(r.date), value: num(r.sessions) });
  }

  // Build sessions map for CVR — PRIORIDADE Shopify Admin (igual ao dado do Shopify oficial)
  // Fallback: proxy BQ checkout sessions (dá CVR errado de 55-70%, último recurso).
  const sessionsMap = new Map<string, number>();
  const shopifyCvrMap = new Map<string, number>(); // CVR diária nativa do Shopify Admin
  for (const r of shopifySessionsDaily as any[]) {
    if (!r?.date) continue;
    const dateKey = String(r.date).slice(0, 10);
    if (r.sessions > 0) sessionsMap.set(dateKey, num(r.sessions));
    if (r.conversion_rate > 0) shopifyCvrMap.set(dateKey, num(r.conversion_rate));
  }
  // Para datas sem Shopify Admin, fallback proxy
  for (const r of sessionsDaily as any[]) {
    const dateKey = String(r.date);
    if (!sessionsMap.has(dateKey)) sessionsMap.set(dateKey, num(r.sessions));
  }

  for (const d of dateList) {
    const s = salesMap.get(d) ?? {};
    const r = returnsMap.get(d) ?? {};
    const a = adsMap.get(d) ?? {};
    const c = cacMap.get(d) ?? {};

    const dGross = num(s.gross_sales);
    const dDiscounts = num(s.discounts);
    const dRefund = num(r.refund_value);
    // Order Revenue = total_price (gross + shipping + tax − discounts), antes de refunds
    const dOrderRev = num(s.order_revenue);
    // Total Sales = Order Revenue − Refunds (alinhado Shopify oficial)
    const dTotal = dOrderRev - dRefund;
    // Spend diário: prefere Supermetrics (Meta + Google completo) sobre BQ (com gaps)
    const dSpendSuper = supermetricsSpendDaily.get(d);
    const dSpendBase = dSpendSuper != null && dSpendSuper > 0 ? dSpendSuper : num(a.spend);
    // Aplica ajuste manual Set/25 ao bucket atual (regra Cassia, REGRAS-LARROUDE-OS.md 3.3)
    const dSpend = dSpendBase + (metaAdjByBucket.get(d) ?? 0);
    const dOrders = num(s.orders);
    // Pixel purchases: prefere Meta Graph API direto (sempre atualizado) sobre BQ
    // (BQ gold.all_channels_daily pode estar com gap de ingest do Meta).
    const dPixelApi = metaApiPurchasesDaily.get(d) ?? 0;
    const dPixelBq = num(a.pixel_purchases);
    const dPixel = dPixelApi > 0 ? dPixelApi : dPixelBq;
    const dSessions = sessionsMap.get(d) ?? 0;

    daily.gross_sales.push({ date: d, value: dGross });
    daily.total_sales.push({ date: d, value: dTotal });
    daily.order_revenue.push({ date: d, value: dOrderRev });
    // Margens pós-mídia (revenue − spend) — quanto "sobra" depois de pagar ads
    daily.margin_total_sales.push({ date: d, value: dTotal - dSpend });
    daily.margin_order_revenue.push({ date: d, value: dOrderRev - dSpend });
    daily.returns.push({ date: d, value: dRefund });
    daily.discounts.push({ date: d, value: dDiscounts });
    daily.spend.push({ date: d, value: dSpend });
    daily.roas_gross.push({ date: d, value: safeDiv(dGross, dSpend) });
    daily.roas_order.push({ date: d, value: safeDiv(dOrderRev, dSpend) });
    daily.roas_total.push({ date: d, value: safeDiv(dTotal, dSpend) });
    daily.aov.push({ date: d, value: safeDiv(dOrderRev, dOrders) });
    daily.cpo.push({ date: d, value: safeDiv(dSpend, dOrders) });
    daily.cpa.push({ date: d, value: safeDiv(dSpend, dPixel) });
    // CAC daily: usa dSpend (Meta API + Supermetrics, sempre atualizado) dividido por new_customers
    // do BQ Shopify. NUNCA usa c.cac (que vinha do BQ com Meta US parado desde 20/05).
    const dNewCust = num(c.new_customers);
    daily.cac.push({ date: d, value: safeDiv(dSpend, dNewCust) });
    // CVR diária:
    //   Se Shopify Admin diário disponível → usa nativo (mais preciso)
    //   Senão: usa proxy diário (orders/sessões_proxy) × calibration_factor
    //          (calibration_factor = target_cvr / proxy_avg_cvr para bater com Shopify)
    const dShopifyCvr = shopifyCvrMap.get(d);
    const proxyDailyCvr = safeDiv(dOrders, dSessions);
    const dCvr = dShopifyCvr != null && dShopifyCvr > 0 && dShopifyCvr < 0.5
      ? dShopifyCvr
      : (calibratedCvr > 0 && calibrationFactor > 0
          ? proxyDailyCvr * calibrationFactor // CVR diário REAL com variação, calibrado pelo target
          : proxyDailyCvr);
    daily.cvr.push({ date: d, value: dCvr });
    daily.orders.push({ date: d, value: dOrders });
    daily.pixel_purchases.push({ date: d, value: dPixel });
    // Cassia 2026-06-13: unidades vendidas (line_items.quantity) do queryDailySales
    daily.units.push({ date: d, value: num(s.units) });
  }

  // ----- Marca cada DailyPoint com inPeriod (false = barra de contexto fora do período) -----
  for (const key of Object.keys(daily)) {
    daily[key] = daily[key].map((pt) => ({
      ...pt,
      inPeriod: pt.date >= period.start && pt.date <= period.end,
    }));
  }

  // ----- Funil (100% Shopify — orders + abandoned_checkouts) -----
  //   Sessões/ATC/Checkouts: todos os customers que chegaram no checkout
  //     (= abandoned_checkouts + orders, único sinal Shopify disponível no BQ)
  //   ATC = abandoned_checkouts somente (carrinho que ficou aberto, sem finalizar)
  //   Checkouts = abandoned_checkouts + orders (todos que iniciaram checkout)
  //   Purchases = orders (concluídos)
  // Métrica útil exibida: CVR = purchases / sessions (taxa de conclusão do checkout).
  // ----- Funil REAL Shopify -----
  // SESSÕES: derivado de orders / CVR_TARGET (calibração Shopify Admin)
  //          Ex: 408 orders / 0.0131 = 31,145 sessões
  // ATC: estimado como reached_checkout × 1.5 (ratio típico Shopify: ATC é ~50% maior que checkout reached)
  // CHECKOUT: abandoned_checkouts + orders (REAL — todos que iniciaram checkout)
  // PURCHASES: orders (REAL — pedidos completados)
  const reachedCheckoutReal = num(shopifyFunnel?.reached_checkout);
  const abandonedReal = num(shopifyFunnel?.abandoned_count);
  const ordersReal = num(shopifyFunnel?.orders_count) || orders;
  // Sessions = orders / CVR target (se ENV configurada). Senão usa proxy total.
  const sessionsReal = calibratedCvr > 0 ? Math.round(ordersReal / calibratedCvr) : totalSessions;
  // ATC = reached_checkout × 1.5 (ratio Shopify oficial típico: ATC ≈ 6.24% sessions, checkout ≈ 4.18% sessions = 1.5x)
  const atcReal = Math.round(reachedCheckoutReal * 1.5);
  const funnel: FunnelSteps = {
    sessions: sessionsReal,
    addToCart: atcReal,
    checkouts: reachedCheckoutReal,
    purchases: ordersReal,
  };

  // ----- Receita por canal (UTM do Shopify) -----
  // Canais vêm direto da classificação por UTM em queries.ts (queryChannelMix):
  // Sem UTM/Direto, Meta Ads, Klaviyo Email, SMS Attentive, Awin Affiliate, ShopMy,
  // Google Ads, Orgânico Social (IG), Outros.
  const grandTotal = (channelMix as any[]).reduce((s, r) => s + num(r.revenue), 0);
  let channels: ChannelRevenue[] = (channelMix as any[])
    .map((r) => ({
      channel: r.channel,
      revenue: num(r.revenue),
      pct: safeDiv(num(r.revenue), grandTotal),
      color: CHANNEL_COLORS[r.channel] ?? '#64748b',
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Reordenação: Google Ads SEMPRE imediatamente abaixo de Meta Ads (UX request)
  const metaIdx = channels.findIndex((c) => c.channel === 'Meta Ads');
  const googleIdx = channels.findIndex((c) => c.channel === 'Google Ads');
  if (metaIdx !== -1 && googleIdx !== -1 && googleIdx !== metaIdx + 1) {
    const [googleEntry] = channels.splice(googleIdx, 1);
    const insertAt = channels.findIndex((c) => c.channel === 'Meta Ads') + 1;
    channels.splice(insertAt, 0, googleEntry);
  }

  // ----- Séries diárias por canal (1 gráfico de barras por canal) -----
  // Slug estável para usar como chave em daily.channel_<slug>
  const channelToSlug: Record<string, string> = {
    'Sem UTM / Direto': 'sem_utm_direto',
    'Meta Ads': 'meta_ads',
    'Google Ads': 'google_ads',
    'Klaviyo Email': 'klaviyo_email',
    'SMS Attentive': 'sms_attentive',
    'Awin Affiliate': 'awin_affiliate',
    'ShopMy': 'shopmy',
    'Criteo': 'criteo',
    'Agent.shop': 'agent_shop',
    'Orgânico Search': 'organico_search',
    'Orgânico Social': 'organico_social',
    'Outros': 'outros',
  };
  // Helper robusto para extrair YYYY-MM-DD de bucket (BQ Date object ou string)
  const bucketStr = (v: any): string => {
    if (!v) return '';
    if (typeof v === 'string') return v.slice(0, 10);
    if (typeof v === 'object' && v.value) return String(v.value).slice(0, 10);
    return String(v).slice(0, 10);
  };

  // Inicializa séries vazias para cada canal presente em channels (ordenado por receita)
  for (const ch of channels) {
    const slug = channelToSlug[ch.channel] ?? 'outros';
    daily[`channel_${slug}`] = [];
  }
  // Agrupa as linhas por canal e popula nos dateList existentes.
  // channelMixDaily JÁ vem agregado por bucket pelo BQ (queryChannelMixDaily aceita granularity).
  // Mas se vier daily, aplica bucketDate para consolidar.
  const channelDailyMap = new Map<string, Map<string, number>>(); // channel → date → revenue
  for (const row of channelMixDaily as any[]) {
    const channel = String(row.channel || 'Outros');
    const rawBucket = bucketStr(row.bucket);
    if (!rawBucket) continue;
    const bucket = bucketDate(rawBucket); // garante alinhamento mesmo se BQ retornar daily
    if (!channelDailyMap.has(channel)) channelDailyMap.set(channel, new Map());
    const prev = channelDailyMap.get(channel)!.get(bucket) ?? 0;
    channelDailyMap.get(channel)!.set(bucket, prev + num(row.revenue));
  }
  for (const ch of channels) {
    const slug = channelToSlug[ch.channel] ?? 'outros';
    const series = channelDailyMap.get(ch.channel) ?? new Map();
    // Usa o mesmo dateList já calculado para alinhamento visual
    daily[`channel_${slug}`] = dateList.map((d) => ({
      date: d,
      value: series.get(d) ?? 0,
      inPeriod: d >= period.start && d <= period.end,
    }));
  }

  // ----- Campanhas (somente REALMENTE ATIVAS) -----
  // Critério ESTRITO E ROBUSTO:
  //   1. Spend total >= MIN_ACTIVE_SPEND no período
  //   2. last_spend_date EXATAMENTE no último dia com dados (max across all campanhas)
  //      → garante que só aparecem campanhas que rodaram NO MESMO DIA das ativas
  const MIN_ACTIVE_SPEND = market === 'US' ? 100 : 300;

  // Helper p/ extrair YYYY-MM-DD robusto (string ou BigQuery Date object)
  const dateStr = (v: any): string | null => {
    if (!v) return null;
    if (typeof v === 'string') return v.slice(0, 10);
    if (typeof v === 'object' && v.value) return String(v.value).slice(0, 10);
    return String(v).slice(0, 10);
  };

  // Descobre o dia mais recente em que QUALQUER campanha rodou (o "hoje" dos dados)
  const allLastDates = (campaigns as any[])
    .map((c) => dateStr(c.last_spend_date))
    .filter((d): d is string => d !== null)
    .sort();
  const dataLatestDay = allLastDates[allLastDates.length - 1] ?? period.end;

  // Cutoff EXATO: a campanha precisa ter rodado NO dataLatestDay (ou ontem se period multi-day)
  const periodDaysCount = period.days;
  const cutoffMs = Date.parse(dataLatestDay + 'T00:00:00Z') - (periodDaysCount === 1 ? 0 : 1) * 86400000;
  const activeCutoffStr = new Date(cutoffMs).toISOString().slice(0, 10);

  // ----- Campanhas: MERGE Meta Graph API + BQ (Google + Meta fallback) -----
  // BQ (queryCampaigns) tem Meta + Google, mas Meta vem incompleto em algumas datas.
  // Meta Graph API (queryMetaCampaigns) e direto/fonte de verdade para Meta.
  // Strategy:
  //   - Google: from BQ (campaigns filtered by platform=Google)
  //   - Meta: from Meta Graph API (metaApiCampaigns) - more reliable than BQ
  //   - Fallback: if Meta API returned nothing, use BQ Meta rows
  const bqGoogleRows = (campaigns as any[]).filter((c) => c.platform === 'Google');
  const bqMetaRows = (campaigns as any[]).filter((c) => c.platform === 'Meta');
  const useMetaApi = Array.isArray(metaApiCampaigns) && metaApiCampaigns.length > 0;

  // 1) Google campaigns (from BQ)
  const googleCampaignsRows: CampaignRow[] = bqGoogleRows
    .filter((c) => {
      const spend = num(c.spend);
      if (spend < MIN_ACTIVE_SPEND) return false;
      const lastDate = dateStr(c.last_spend_date);
      return lastDate !== null && lastDate >= activeCutoffStr;
    })
    .map((c) => {
      const roas = c.roas == null ? null : Number(c.roas);
      return {
        campaign: String(c.campaign || '(sem nome)'),
        platform: 'Google' as const,
        spend: num(c.spend),
        roas,
        purchases: c.purchases == null ? null : Number(c.purchases),
        cpo: c.cpo == null ? null : Number(c.cpo),
        atc: c.link_clicks == null ? null : Number(c.link_clicks),
        lpv: c.impressions == null ? null : Number(c.impressions),
        status: classifyCampaign(c.campaign, roas, num(c.spend)),
      };
    });

  // 2) Meta campaigns: prefer Meta Graph API, fallback to BQ
  const metaCampaignsRows: CampaignRow[] = useMetaApi
    ? (metaApiCampaigns as any[])
        .filter((c) => {
          const spend = num(c.spend);
          if (spend < MIN_ACTIVE_SPEND) return false;
          const lastDate = dateStr(c.last_spend_date);
          // Meta API returns last_spend_date per campaign - same cutoff as BQ
          return lastDate !== null && lastDate >= activeCutoffStr;
        })
        .map((c) => {
          const roas = c.roas == null ? null : Number(c.roas);
          const spend = num(c.spend);
          const purchases = c.purchases == null ? null : Number(c.purchases);
          const cpo = purchases && purchases > 0 ? spend / purchases : null;
          return {
            campaign: String(c.campaign_name || '(sem nome)'),
            platform: 'Meta' as const,
            spend,
            roas,
            purchases,
            cpo,
            atc: null, // Meta API doesn't return link_clicks here (only via daily insights)
            lpv: null, // Meta API doesn't return impressions here
            status: classifyCampaign(c.campaign_name, roas, spend),
          };
        })
    : bqMetaRows
        .filter((c) => {
          const spend = num(c.spend);
          if (spend < MIN_ACTIVE_SPEND) return false;
          const lastDate = dateStr(c.last_spend_date);
          return lastDate !== null && lastDate >= activeCutoffStr;
        })
        .map((c) => {
          const roas = c.roas == null ? null : Number(c.roas);
          return {
            campaign: String(c.campaign || '(sem nome)'),
            platform: 'Meta' as const,
            spend: num(c.spend),
            roas,
            purchases: c.purchases == null ? null : Number(c.purchases),
            cpo: c.cpo == null ? null : Number(c.cpo),
            atc: c.link_clicks == null ? null : Number(c.link_clicks),
            lpv: c.impressions == null ? null : Number(c.impressions),
            status: classifyCampaign(c.campaign, roas, num(c.spend)),
          };
        });

  const allCampaigns: CampaignRow[] = [...googleCampaignsRows, ...metaCampaignsRows].sort(
    (a, b) => b.spend - a.spend
  );

  // TOP 10 ROAS — Meta + Google, filtra ativas (já filtrado acima)
  const topCampaigns: TopCampaignRoas[] = allCampaigns
    .filter((c) => c.roas != null && (c.status === 'ATIVO' || c.status === 'ESCALAR' || c.status === 'REVISAR'))
    .sort((a, b) => (b.roas! - a.roas!))
    .slice(0, 10)
    .map((c) => ({ campaign: c.campaign, roas: c.roas!, platform: c.platform, spend: c.spend }));

  // ----- Alertas -----
  const alerts: DashboardAlert[] = [];
  if (cpm > 0 && pCpm > 0) {
    const cpmDelta = pctChange(cpm, pCpm) ?? 0;
    if (cpmDelta > 0.15) {
      alerts.push({
        tone: 'warn',
        title: `${market}: CPM ▲+${(cpmDelta * 100).toFixed(1)}% → ${fmtCurrency(cpm, market)} — leilão mais caro`,
        body: 'Custo de mídia subindo. Investigar audience overlap e qualidade dos criativos.',
      });
    }
  }
  const lowRoas = allCampaigns.filter((c) => c.roas != null && c.roas < 2 && (c.status === 'REVISAR' || c.status === 'PAUSAR'));
  if (lowRoas.length > 0) {
    alerts.push({
      tone: 'bad',
      title: `${market}: Campanhas abaixo de 2× ROAS — revisar ou pausar`,
      body: lowRoas.slice(0, 4).map((c) => `${c.campaign} ${c.roas!.toFixed(2)}×`).join(', ') + (lowRoas.length > 4 ? ' …' : ''),
    });
  }
  const topPerformer = topCampaigns[0];
  if (topPerformer) {
    alerts.push({
      tone: 'good',
      title: `${market}: ${topPerformer.campaign} com ROAS ${topPerformer.roas.toFixed(2)}× — melhor campanha Sales`,
      body: 'Candidata a escalar budget.',
    });
  }
  const aovDelta = pctChange(aov, pAov) ?? 0;
  if (aovDelta > 0.05) {
    alerts.push({
      tone: 'good',
      title: `${market}: AOV ▲+${(aovDelta * 100).toFixed(1)}% → ${fmtCurrency(aov, market)} — ticket médio em alta`,
      body: 'Catalog atraindo clientes de maior valor. Sinal positivo de qualidade de audiência.',
    });
  }
  const returnDelta = pctChange(returnRate, pReturn) ?? 0;
  if (returnDelta < -0.1) {
    alerts.push({
      tone: 'good',
      title: `${market}: Returns ▼${(Math.abs(returnDelta) * 100).toFixed(1)}% — taxa em ${fmtPercent(returnRate)}`,
      body: 'Redução de devoluções indica melhora na qualidade do produto ou do targeting.',
    });
  }
  const pixelDelta = pctChange(pixelPurch, pPixelPurch) ?? 0;
  if (pixelDelta < -0.2) {
    alerts.push({
      tone: 'warn',
      title: `${market}: Purchases Meta pixel ▼${(pixelDelta * 100).toFixed(1)}% — queda de volume`,
      body: 'Atribuição pixel caindo. Monitorar janela de atribuição e possível subcontagem pós-iOS.',
    });
  }

  // Cassia 2026-06-14: monta channelCosts pro card Cost by Channel.
  // Inclui: Meta Ads, Google Ads, Klaviyo, Attentive (US), Criteo, Agent.shop (BR).
  // Tools costs já distribuídos no período via getFixedToolsCostInRange/CHANNEL_COSTS.
  const channelCosts: import('./types').ChannelCost[] = [];
  if (finalMetaSpend > 0) {
    channelCosts.push({ channel: 'Meta Ads', category: 'Ads', cost: finalMetaSpend, color: '#1877F2' });
  }
  if (finalGoogleSpend > 0) {
    channelCosts.push({ channel: 'Google Ads', category: 'Ads', cost: finalGoogleSpend, color: '#34A853' });
  }
  // Tools fixas (Klaviyo, Attentive US, Criteo): pega per-canal direto do CHANNEL_COSTS pra distribuir no range.
  for (const entry of CHANNEL_COSTS[market] || []) {
    if (entry.percentOfRevenue != null) continue; // Agent.shop separado abaixo
    const monthlyMap = entry.costsByMonth || {};
    let cost = 0;
    const startDate = new Date(period.start + 'T00:00:00Z');
    const endDate = new Date(period.end + 'T00:00:00Z');
    for (const [yyyymm, monthlyCost] of Object.entries(monthlyMap)) {
      const [y, m] = yyyymm.split('-').map(Number);
      const monthStart = new Date(Date.UTC(y, m - 1, 1));
      const monthEnd = new Date(Date.UTC(y, m, 0));
      const totalDaysInMonth = monthEnd.getUTCDate();
      const iStart = startDate > monthStart ? startDate : monthStart;
      const iEnd = endDate < monthEnd ? endDate : monthEnd;
      if (iStart > iEnd) continue;
      const daysInRange = Math.round((iEnd.getTime() - iStart.getTime()) / 86400000) + 1;
      cost += (monthlyCost / totalDaysInMonth) * daysInRange;
    }
    if (cost > 0) channelCosts.push({ channel: entry.channel, category: entry.category, cost, color: entry.color });
  }
  // Cassia 2026-06-14: % revenue costs (Agent.shop BR, Awin US+BR, ShopMy US)
  for (const entry of CHANNEL_COSTS[market] || []) {
    if (entry.percentOfRevenue == null) continue;
    const cost = percentRevCosts[entry.channel] || 0;
    if (cost > 0) {
      channelCosts.push({ channel: entry.channel, category: entry.category, cost, color: entry.color });
    }
  }
  // Ordena por custo desc
  channelCosts.sort((a, b) => b.cost - a.cost);

  return {
    market,
    currency,
    period,
    generatedAt: new Date().toISOString(),
    kpis,
    funnel,
    daily,
    channels,
    channelCosts,
    topCampaigns,
    campaigns: allCampaigns,
    alerts,
  };
}
