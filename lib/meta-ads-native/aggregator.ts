/**
 * Aggregates Meta Insights across the two accounts per region
 * and shapes the data exactly as the dashboard expects.
 */
import {
  fetchInsights,
  findAction,
  findActionValue,
  resolveAccountsForRegion,
  ACTION_TYPES,
  currencyForRegion,
  fetchAdsMetadata,
  fetchAdsMetadataByIds,
  type MetaAccount,
} from './meta-ads';
import { periodToRange, previousRange, todayISO, bucketKey, granularityForPeriod, shiftISO, diffDays } from './dates';
import type {
  DashboardData, DateRange, Period, Region, TimeSeriesPoint, DualSeriesPoint, CampaignRow, AdRow,
} from './types';

const NUM = (v: unknown) => (v == null ? 0 : Number(v) || 0);

function emptySeries(): TimeSeriesPoint[] { return []; }

function sumActions(rows: any[], type: string): number {
  return rows.reduce((acc, r) => acc + findAction(r.actions, type), 0);
}
function sumActionValues(rows: any[], type: string): number {
  return rows.reduce((acc, r) => acc + findActionValue(r.action_values, type), 0);
}
function sumNumeric(rows: any[], key: string): number {
  return rows.reduce((acc, r) => acc + NUM(r[key]), 0);
}

/** Sums daily series into the given bucket granularity (week/month/day). */
function bucketSum(
  rows: { date: string; value: number }[],
  toKey: (iso: string) => string
): { date: string; value: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = toKey(r.date);
    map.set(k, (map.get(k) || 0) + r.value);
  }
  return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, value]) => ({ date, value }));
}

/** Buckets a series with comparison values (same key for both). */
function bucketWithComparison(
  rows: { date: string; value: number; comparisonValue?: number }[],
  toKey: (iso: string) => string
): { date: string; value: number; comparisonValue?: number }[] {
  const map = new Map<string, { value: number; comparisonValue: number }>();
  for (const r of rows) {
    const k = toKey(r.date);
    const cur = map.get(k) || { value: 0, comparisonValue: 0 };
    cur.value += r.value;
    cur.comparisonValue += r.comparisonValue ?? 0;
    map.set(k, cur);
  }
  return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, value: v.value, comparisonValue: v.comparisonValue }));
}

/** Averages daily series into bucket (for CTR/CPC/frequency-style ratios). */
function bucketAvg(
  rows: { date: string; value: number }[],
  toKey: (iso: string) => string
): { date: string; value: number }[] {
  const map = new Map<string, { sum: number; count: number }>();
  for (const r of rows) {
    const k = toKey(r.date);
    const cur = map.get(k) || { sum: 0, count: 0 };
    cur.sum += r.value;
    cur.count++;
    map.set(k, cur);
  }
  return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, value: v.count ? v.sum / v.count : 0 }));
}

/** Pulls one region's data from both accounts and aggregates. */
export async function buildDashboard(
  region: Region,
  period: Period,
  customRange?: DateRange
): Promise<DashboardData> {
  const resolved = await resolveAccountsForRegion(region);
  // Aggregate ALL resolved accounts for the region (main + preorder + extras like "Larroude New" for US)
  const accounts: MetaAccount[] = resolved.all;

  const range = customRange || periodToRange(period);
  const compare = previousRange(range);
  const gran = granularityForPeriod(period, range);
  const toKey = bucketKey(gran);

  // If user selected a window < 7 days, expand the SERIES range to 7 days back
  // so the bar chart shows 7 bars with the user-selected ones highlighted.
  // KPIs and aggregates keep using the original `range`.
  const selectedDays = diffDays(range.since, range.until);
  const expandForContext = selectedDays < 7 && gran === 'day';
  const seriesRange = expandForContext
    ? { since: shiftISO(range.until, -6), until: range.until }
    : range;
  const inSelection = (date: string) =>
    date >= range.since && date <= range.until;

  // No accounts found — return empty skeleton
  if (accounts.length === 0) {
    return emptyDashboard(region, period, range, compare);
  }

  // --- BIG PARALLEL FETCH — fire ALL Meta API requests at once ---
  const accountFields = [
    'spend', 'impressions', 'reach', 'frequency', 'clicks', 'cpc', 'ctr', 'cpm',
    'actions', 'action_values',
  ];
  const dailyFields = ['spend', 'impressions', 'clicks', 'ctr', 'cpc',
    'reach', 'frequency', 'actions', 'action_values'];
  const campaignFields = ['campaign_id', 'campaign_name', 'spend', 'clicks', 'actions', 'action_values'];
  const adFields = ['ad_id', 'ad_name', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'spend', 'ctr', 'clicks', 'actions', 'action_values'];
  const monthlyRange = { since: periodToRange('12M').since, until: range.until };

  // Helper to flatten array of arrays from each account fetch
  const flatPromise = <T>(p: Promise<T[]>[]) => Promise.all(p).then((arrs) => arrs.flat());
  // Tag rows with their account name (for campaigns/ads tables)
  const tagAccount = (a: MetaAccount) => (rows: any[]) => rows.map((r) => ({ ...r, _account: a.name }));

  const [
    cur,
    prev,
    dailyCur,
    dailyPrev,
    campaignsRaw,
    adsRaw,
    genderRows,
    ageGenderRows,
    ageOnlyRows,
    regionRows,
    objRows,
    monthlyRows,
    adsMetadataRaw, // Cassia 2026-06-14: status + thumbnail por ad
  ] = await Promise.all([
    // 1. Account-level current
    flatPromise(accounts.map((a) =>
      fetchInsights(a.id, { level: 'account', timeRange: range, fields: accountFields }))),
    // 2. Account-level previous (for deltas)
    flatPromise(accounts.map((a) =>
      fetchInsights(a.id, { level: 'account', timeRange: compare, fields: accountFields }))),
    // 3. Daily current
    flatPromise(accounts.map((a) =>
      fetchInsights(a.id, { level: 'account', timeRange: seriesRange, fields: dailyFields, timeIncrement: 1 }))),
    // 4. Daily previous
    flatPromise(accounts.map((a) =>
      fetchInsights(a.id, { level: 'account', timeRange: compare, fields: dailyFields, timeIncrement: 1 }))),
    // 5. Campaigns
    flatPromise(accounts.map((a) =>
      fetchInsights(a.id, { level: 'campaign', timeRange: range, fields: campaignFields, limit: 500 })
        .then(tagAccount(a)))),
    // 6. Ads
    flatPromise(accounts.map((a) =>
      fetchInsights(a.id, { level: 'ad', timeRange: range, fields: adFields, limit: 500 })
        .then(tagAccount(a)))),
    // 7. Gender breakdown
    flatPromise(accounts.map((a) =>
      fetchInsights(a.id, { level: 'account', timeRange: range, fields: ['actions'], breakdowns: ['gender'] }))),
    // 8. Age × gender
    flatPromise(accounts.map((a) =>
      fetchInsights(a.id, { level: 'account', timeRange: range, fields: ['spend'], breakdowns: ['age', 'gender'] }))),
    // 9. Age only
    flatPromise(accounts.map((a) =>
      fetchInsights(a.id, {
        level: 'account', timeRange: range,
        fields: ['spend', 'impressions', 'clicks', 'cpm', 'cpc', 'ctr', 'actions', 'action_values'],
        breakdowns: ['age'],
      }))),
    // 10. Regions
    flatPromise(accounts.map((a) =>
      fetchInsights(a.id, { level: 'account', timeRange: range, fields: ['spend'], breakdowns: ['region'], limit: 500 }))),
    // 11. Campaign objectives
    flatPromise(accounts.map((a) =>
      fetchInsights(a.id, { level: 'campaign', timeRange: range, fields: ['objective', 'spend'], limit: 500 }))),
    // 12. ROAS monthly (12M history)
    flatPromise(accounts.map((a) =>
      fetchInsights(a.id, {
        level: 'account', timeRange: monthlyRange, fields: ['spend', 'action_values'], timeIncrement: 'monthly',
      }))),
    // 13. Placeholder — adsMetadata é buscado APÓS adsRaw chegar (precisa dos ad_ids)
    Promise.resolve([] as any[]),
  ]);

  // Cassia 2026-06-14: busca status REAL TIME pra ads que rodaram no período.
  // Usa /?ids= (no-store) — garante status atual, sem cache stale, sem limite de pagina.
  const adIdsFromInsights = (adsRaw as any[]).map(r => r.ad_id).filter(Boolean);
  const adsMetadataFresh = adIdsFromInsights.length > 0
    ? await fetchAdsMetadataByIds(adIdsFromInsights).catch((e) => { console.warn('[aggregator] metadata fetch failed:', e); return []; })
    : [];

  const adMetaMap = new Map<string, { status: string; effectiveStatus: string; thumbnail: string | null; linkUrl: string | null }>();
  for (const m of adsMetadataFresh) {
    adMetaMap.set(m.id, { status: m.status, effectiveStatus: m.effectiveStatus, thumbnail: m.thumbnail, linkUrl: m.linkUrl });
  }
  console.log(`[aggregator] ${adIdsFromInsights.length} ads in period, ${adsMetadataFresh.length} metadata fetched`);

  const spend = sumNumeric(cur, 'spend');
  const impressions = sumNumeric(cur, 'impressions');
  const clicks = sumNumeric(cur, 'clicks');
  const purchases = sumActions(cur, ACTION_TYPES.purchase);
  const revenue = sumActionValues(cur, ACTION_TYPES.purchase);
  const roas = spend > 0 ? revenue / spend : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const lpv = sumActions(cur, ACTION_TYPES.landingPageView);
  const atc = sumActions(cur, ACTION_TYPES.addToCart);
  const checkout = sumActions(cur, ACTION_TYPES.checkoutInitiated);
  const convRate = clicks > 0 ? (purchases / clicks) * 100 : 0;

  const prevSpend = sumNumeric(prev, 'spend');
  const prevClicks = sumNumeric(prev, 'clicks');
  const prevPurchases = sumActions(prev, ACTION_TYPES.purchase);
  const prevRevenue = sumActionValues(prev, ACTION_TYPES.purchase);
  const prevRoas = prevSpend > 0 ? prevRevenue / prevSpend : 0;
  const prevCpc = prevClicks > 0 ? prevSpend / prevClicks : 0;
  const prevConvRate = prevClicks > 0 ? (prevPurchases / prevClicks) * 100 : 0;

  const pct = (cur: number, prev: number) =>
    !prev ? (cur ? 100 : 0) : ((cur - prev) / prev) * 100;

  // --- 2. Daily series already fetched in parallel above ---

  const groupByDate = (rows: any[], reducer: (r: any) => number) => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const key = r.date_start || r.date;
      map.set(key, (map.get(key) || 0) + reducer(r));
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, value]) => ({ date, value }));
  };

  // Daily series first, then bucket into the chosen granularity
  const spendDaily  = groupByDate(dailyCur, (r) => NUM(r.spend));
  const clicksDaily = groupByDate(dailyCur, (r) => NUM(r.clicks));
  const impDaily    = groupByDate(dailyCur, (r) => NUM(r.impressions));
  const ctrDaily    = groupByDate(dailyCur, (r) => NUM(r.ctr));
  const cpcDaily    = groupByDate(dailyCur, (r) => NUM(r.cpc));
  const reachDaily  = groupByDate(dailyCur, (r) => NUM(r.reach));
  const freqDaily   = groupByDate(dailyCur, (r) => NUM(r.frequency));
  const purchaseValueDaily = groupByDate(dailyCur, (r) => findActionValue(r.action_values, ACTION_TYPES.purchase));

  const prevClicksDaily = groupByDate(dailyPrev, (r) => NUM(r.clicks));
  const prevCtrDaily    = groupByDate(dailyPrev, (r) => NUM(r.ctr));
  const prevCpcDaily    = groupByDate(dailyPrev, (r) => NUM(r.cpc));
  const prevImpDaily    = groupByDate(dailyPrev, (r) => NUM(r.impressions));

  // Bucket into granularity (sum for absolute metrics, avg for ratios)
  // and tag `isHighlighted` for the user-selected window when range was expanded.
  const markHL = <T extends { date: string }>(arr: T[]): (T & { isHighlighted: boolean })[] =>
    arr.map((p) => ({ ...p, isHighlighted: expandForContext ? inSelection(p.date) : true }));

  const spendSeries  = markHL(bucketSum(spendDaily, toKey));
  const clicksSeries = markHL(bucketSum(clicksDaily, toKey));
  const impSeries    = markHL(bucketSum(impDaily, toKey));
  const ctrSeries    = markHL(bucketAvg(ctrDaily, toKey));
  const cpcSeries    = markHL(bucketAvg(cpcDaily, toKey));
  const reachSeries  = markHL(bucketSum(reachDaily, toKey));
  const freqSeries   = markHL(bucketAvg(freqDaily, toKey));
  const purchaseValueSeries = markHL(bucketSum(purchaseValueDaily, toKey));

  const prevClicksSeries = bucketSum(prevClicksDaily, toKey);
  const prevCtrSeries    = bucketAvg(prevCtrDaily, toKey);
  const prevCpcSeries    = bucketAvg(prevCpcDaily, toKey);
  const prevImpSeries    = bucketSum(prevImpDaily, toKey);

  // ROAS series: bucket spend & revenue by granularity first, THEN divide
  const roasBucketMap = new Map<string, { spend: number; rev: number }>();
  for (const r of dailyCur) {
    const k = toKey(r.date_start || r.date);
    const cur = roasBucketMap.get(k) || { spend: 0, rev: 0 };
    cur.spend += NUM(r.spend);
    cur.rev += findActionValue(r.action_values, ACTION_TYPES.purchase);
    roasBucketMap.set(k, cur);
  }
  const roasSeries: TimeSeriesPoint[] = Array.from(roasBucketMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({
      date,
      value: v.spend > 0 ? v.rev / v.spend : 0,
      isHighlighted: expandForContext ? inSelection(date) : true,
    }));

  const zipSeries = (cur: TimeSeriesPoint[], prev: TimeSeriesPoint[]): TimeSeriesPoint[] => {
    const len = Math.max(cur.length, prev.length);
    const out: TimeSeriesPoint[] = [];
    for (let i = 0; i < len; i++) {
      out.push({
        date: cur[i]?.date ?? prev[i]?.date ?? '',
        value: cur[i]?.value ?? 0,
        comparisonValue: prev[i]?.value ?? 0,
      });
    }
    return out;
  };

  // Both already bucketed by toKey, so dates align
  // Both already bucketed by toKey, so dates align
  const spendVsRevenue: DualSeriesPoint[] = spendSeries.map((s) => ({
    date: s.date,
    spend: s.value,
    revenue: purchaseValueSeries.find((p) => p.date === s.date)?.value ?? 0,
    isHighlighted: s.isHighlighted,
  }));

  const reachFrequency = reachSeries.map((s) => ({
    date: s.date,
    reach: s.value,
    frequency: freqSeries.find((f) => f.date === s.date)?.value ?? 0,
    isHighlighted: s.isHighlighted,
  }));

  // --- 3. Campaign-level rows (data already fetched above) ---
  const campaigns: CampaignRow[] = campaignsRaw
    .map((r) => {
      const cSpend = NUM(r.spend);
      const cPur = findAction(r.actions, ACTION_TYPES.purchase);
      const cRev = findActionValue(r.action_values, ACTION_TYPES.purchase);
      return {
        id: r.campaign_id,
        name: r.campaign_name,
        account: r._account,
        spend: cSpend,
        revenue: cRev,
        purchases: cPur,
        roas: cSpend > 0 ? cRev / cSpend : 0,
        costPerPurchase: cPur > 0 ? cSpend / cPur : 0,
      };
    })
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 25);

  // --- 4. Ad-level rows (data already fetched above) ---
  const ads: AdRow[] = adsRaw
    .map((r) => {
      const sSpend = NUM(r.spend);
      const sPur = findAction(r.actions, ACTION_TYPES.purchase);
      const sRev = findActionValue(r.action_values, ACTION_TYPES.purchase);
      const sAtc = findAction(r.actions, ACTION_TYPES.addToCart);
      const meta = adMetaMap.get(r.ad_id);
      return {
        id: r.ad_id,
        name: r.ad_name,
        account: r._account,
        campaignName: r.campaign_name,
        adsetName: r.adset_name,
        spend: sSpend,
        revenue: sRev,
        purchases: sPur,
        addsToCart: sAtc,
        ctr: NUM(r.ctr),
        roas: sSpend > 0 ? sRev / sSpend : 0,
        costPerPurchase: sPur > 0 ? sSpend / sPur : 0,
        // Cassia 2026-06-14: metadata do ad (status + thumbnail real do criativo + URL destino)
        status: meta?.status,
        effectiveStatus: meta?.effectiveStatus,
        thumbnail: meta?.thumbnail || undefined,
        linkUrl: meta?.linkUrl ?? null,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  // --- 5. Gender breakdown (data already fetched above) ---
  const genderMap = new Map<string, number>();
  for (const r of genderRows) {
    const g = r.gender || 'unknown';
    genderMap.set(g, (genderMap.get(g) || 0) + findAction(r.actions, ACTION_TYPES.purchase));
  }
  const purchasesByGender = Array.from(genderMap.entries()).map(([gender, value]) => ({ gender, value }));

  // --- 6. Age × gender breakdown (data already fetched above) ---
  const ageMap = new Map<string, { female: number; male: number }>();
  for (const r of ageGenderRows) {
    const age = r.age || 'unknown';
    const cur = ageMap.get(age) || { female: 0, male: 0 };
    if (r.gender === 'female') cur.female += NUM(r.spend);
    else if (r.gender === 'male') cur.male += NUM(r.spend);
    ageMap.set(age, cur);
  }
  const ageGroupSpend = Array.from(ageMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([age, v]) => ({ age, ...v }));

  // --- 7. Age-only performance table (data already fetched above) ---
  const ageTableMap = new Map<string, any>();
  for (const r of ageOnlyRows) {
    const age = r.age || 'unknown';
    const cur = ageTableMap.get(age) || {
      spend: 0, impressions: 0, clicks: 0, cpm: 0, cpc: 0, ctr: 0,
      websiteConversions: 0, websiteConversionValue: 0, _cpmN: 0, _cpcN: 0, _ctrN: 0,
    };
    cur.spend += NUM(r.spend);
    cur.impressions += NUM(r.impressions);
    cur.clicks += NUM(r.clicks);
    cur.cpm += NUM(r.cpm); cur._cpmN++;
    cur.cpc += NUM(r.cpc); cur._cpcN++;
    cur.ctr += NUM(r.ctr); cur._ctrN++;
    cur.websiteConversions += findAction(r.actions, ACTION_TYPES.purchase);
    cur.websiteConversionValue += findActionValue(r.action_values, ACTION_TYPES.purchase);
    ageTableMap.set(age, cur);
  }
  const agePerformance = Array.from(ageTableMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([age, v]) => ({
      age,
      spend: v.spend,
      impressions: v.impressions,
      clicks: v.clicks,
      cpm: v._cpmN ? v.cpm / v._cpmN : 0,
      cpc: v._cpcN ? v.cpc / v._cpcN : 0,
      ctr: v._ctrN ? v.ctr / v._ctrN : 0,
      websiteConversions: v.websiteConversions,
      websiteConversionValue: v.websiteConversionValue,
    }));

  // --- 8. Regions (data already fetched above) ---
  const regionMap = new Map<string, number>();
  for (const r of regionRows) {
    const name = r.region || 'unknown';
    regionMap.set(name, (regionMap.get(name) || 0) + NUM(r.spend));
  }
  const regionsBySpend = Array.from(regionMap.entries())
    .map(([region, spend]) => ({ region, spend }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 30);

  // --- 9. Campaign objective spend (data already fetched above) ---
  const objMap = new Map<string, number>();
  for (const r of objRows) {
    const o = r.objective || 'UNKNOWN';
    objMap.set(o, (objMap.get(o) || 0) + NUM(r.spend));
  }
  const topCampaignsByObjective = Array.from(objMap.entries())
    .map(([objective, spend]) => ({ objective, spend }))
    .sort((a, b) => b.spend - a.spend);

  // --- 10. Rankings derived from already-fetched campaigns + ads ---
  const topCampaigns7d = campaignsRaw
    .map((r) => ({ name: r.campaign_name as string, spend: NUM(r.spend) }))
    .sort((a, b) => b.spend - a.spend).slice(0, 10);
  const highCpcCampaigns7d = campaignsRaw
    .map((r) => {
      const cpc = NUM(r.clicks) > 0 ? NUM(r.spend) / NUM(r.clicks) : 0;
      return { name: r.campaign_name as string, cpc };
    })
    .filter((x) => x.cpc > 0)
    .sort((a, b) => b.cpc - a.cpc).slice(0, 10);

  const topAds7d = adsRaw
    .map((r) => ({ name: r.ad_name as string, purchases: findAction(r.actions, ACTION_TYPES.purchase) }))
    .filter((x) => x.purchases > 0)
    .sort((a, b) => b.purchases - a.purchases).slice(0, 10);

  // --- 11. ROAS monthly (data already fetched above) ---
  const monthMap = new Map<string, { spend: number; rev: number }>();
  for (const r of monthlyRows) {
    const m = (r.date_start || '').slice(0, 7);
    const cur = monthMap.get(m) || { spend: 0, rev: 0 };
    cur.spend += NUM(r.spend);
    cur.rev += findActionValue(r.action_values, ACTION_TYPES.purchase);
    monthMap.set(m, cur);
  }
  const roasMonthly = Array.from(monthMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, v]) => ({ month, roas: v.spend > 0 ? v.rev / v.spend : 0 }));

  // --- 12. Spend vs ROAS scatter (ad level top 50) ---
  const scatter = ads.slice(0, 50).map((a) => ({ name: a.name, spend: a.spend, roas: a.roas }));

  return {
    region,
    period,
    dateRange: range,
    comparisonRange: compare,
    lastUpdated: new Date().toISOString(),
    kpis: {
      spend:    { label: 'Amount spent',           value: spend,    delta: pct(spend, prevSpend),         format: 'currency' },
      revenue:  { label: 'Purchase conversion value', value: revenue, delta: pct(revenue, prevRevenue),  format: 'currency' },
      roas:     { label: 'ROAS',                    value: roas,     delta: pct(roas, prevRoas),         format: 'decimal' },
      convRate: { label: 'Conversion Rate',         value: convRate, delta: pct(convRate, prevConvRate), format: 'percent' },
      clicks:   { label: 'Clicks (all)',            value: clicks,   delta: pct(clicks, prevClicks),     format: 'number' },
      cpc:      { label: 'CPC (all)',               value: cpc,      delta: pct(cpc, prevCpc),           format: 'decimal' },
    },
    funnel: {
      landingPageViews: lpv,
      addsToCart: atc,
      checkoutsInitiated: checkout,
      purchases: purchases,
    },
    purchasesByGender,
    series: {
      // All temporal series keep `isHighlighted` so charts can dim context bars
      roas: roasSeries,
      spendVsRevenue,
      clicks: clicksSeries,
      ctr: ctrSeries,
      cpc: cpcSeries,
      impressions: impSeries,
      reachFrequency,
      spendByDay: spendSeries,
      roasMonthly,
    },
    scatter,
    topCampaignsByObjective,
    topCampaigns7d,
    highCpcCampaigns7d,
    topAds7d,
    ageGroupSpend,
    agePerformance,
    regionsBySpend,
    campaigns,
    ads,
  };
}

function emptyDashboard(region: Region, period: Period, range: any, compare: any): DashboardData {
  const k = (label: string, format: any) => ({ label, value: 0, delta: 0, format });
  return {
    region, period, dateRange: range, comparisonRange: compare,
    lastUpdated: new Date().toISOString(),
    kpis: {
      spend: k('Amount spent', 'currency'),
      revenue: k('Purchase conversion value', 'currency'),
      roas: k('ROAS', 'decimal'),
      convRate: k('Conversion Rate', 'percent'),
      clicks: k('Clicks (all)', 'number'),
      cpc: k('CPC (all)', 'decimal'),
    },
    funnel: { landingPageViews: 0, addsToCart: 0, checkoutsInitiated: 0, purchases: 0 },
    purchasesByGender: [],
    series: {
      roas: [], spendVsRevenue: [], clicks: [], ctr: [], cpc: [], impressions: [],
      reachFrequency: [], spendByDay: [], roasMonthly: [],
    },
    scatter: [], topCampaignsByObjective: [], topCampaigns7d: [], highCpcCampaigns7d: [],
    topAds7d: [], ageGroupSpend: [], agePerformance: [], regionsBySpend: [],
    campaigns: [], ads: [],
  };
}
