/**
 * Meta Marketing API client
 * - Auto-discovers Account IDs by name
 * - Pulls Insights with breakdowns
 * - Aggregates the two accounts per region (Main + Pre-Order)
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/insights
 */
import type { DateRange, Region } from './types';

const META_API_VERSION = process.env.META_API_VERSION || 'v20.0';
const BASE = `https://graph.facebook.com/${META_API_VERSION}`;

function token(): string {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error('META_ACCESS_TOKEN missing in .env');
  return t;
}

// ---------- Account discovery ----------

export interface MetaAccount {
  id: string;            // act_xxxxx
  account_id: string;    // xxxxx
  name: string;
  currency?: string;
  business_name?: string;
  timezone_name?: string;
}

/**
 * Identify the 4 accounts (US main, US pre-order, BR main, BR pre-order) by name.
 * The user said:
 *  - Larroude US:  "Larroude US"           + "PRE-ORDER US"
 *  - Larroude BR:  "Larroude BR"           + "Larroude BR Pre-Order"
 */
// Matchers ordered: more specific patterns first to avoid accidental hits.
// The matcher uses includes() against the normalized lowercase name.
//   - main: primary account
//   - preorder: pre-order account
//   - extras: any other accounts that should also be aggregated for the region
const ACCOUNT_NAME_RULES: Record<Region, { main: string[]; preorder: string[]; extras: string[] }> = {
  US: {
    // Real account names: "Larroudé US"
    main: ['larroude us', 'larroudé us'],
    preorder: ['pre-order us', 'preorder us', 'pre order us'],
    // "Larroude New" should also be aggregated into US totals
    extras: ['larroude new', 'larroudé new'],
  },
  BR: {
    // Confirmed by user: BR.main = "Larroudé Brasil" (legacy USD/NY)
    main: ['larroude brasil', 'larroudé brasil'],
    // Real account name: "Larroude BR - Pre-Order" (BRL/Sao Paulo)
    preorder: ['br - pre-order', 'br - preorder', 'br pre-order'],
    extras: [],
  },
};

let _accountsCache: MetaAccount[] | null = null;
let _accountsCacheAt = 0;

export async function listAdAccounts(force = false): Promise<MetaAccount[]> {
  const FIVE_MIN = 5 * 60 * 1000;
  if (!force && _accountsCache && Date.now() - _accountsCacheAt < FIVE_MIN) {
    return _accountsCache;
  }
  const fields = 'id,account_id,name,currency,business_name,timezone_name';
  const url = `${BASE}/me/adaccounts?fields=${fields}&limit=500&access_token=${encodeURIComponent(token())}`;
  const r = await fetch(url, { next: { revalidate: 300 } });
  if (!r.ok) throw new Error(`Meta /me/adaccounts ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const data: MetaAccount[] = j.data || [];
  _accountsCache = data;
  _accountsCacheAt = Date.now();
  return data;
}

export interface RegionAccounts {
  main?: MetaAccount;
  preorder?: MetaAccount;
  /** Additional accounts to aggregate into the same region total. */
  extras: MetaAccount[];
  /** All accounts (main + preorder + extras) for convenience. */
  all: MetaAccount[];
}

export async function resolveAccountsForRegion(region: Region): Promise<RegionAccounts> {
  const all = await listAdAccounts();
  const rules = ACCOUNT_NAME_RULES[region];

  const norm = (s: string) => s.toLowerCase().trim();
  const hasMatch = (name: string, needles: string[]) =>
    needles.some((n) => norm(name).includes(norm(n)));

  /**
   * Find the first account matching the PRIORITY ORDER of the needles list.
   * This iterates needles (not accounts), so the first needle wins even if
   * another account would also match a later needle. Optional `excludeNeedles`
   * lets us avoid catching a more specific bucket (e.g. pre-order matching main).
   */
  const findByPriority = (needles: string[], excludeNeedles: string[] = []) => {
    for (const needle of needles) {
      const found = all.find((a) =>
        norm(a.name).includes(norm(needle)) && !hasMatch(a.name, excludeNeedles)
      );
      if (found) return found;
    }
    return undefined;
  };

  // env override (if user has explicit IDs in .env)
  const envIds = {
    US: { main: process.env.META_ACCOUNT_US_MAIN, preorder: process.env.META_ACCOUNT_US_PREORDER },
    BR: { main: process.env.META_ACCOUNT_BR_MAIN, preorder: process.env.META_ACCOUNT_BR_PREORDER },
  } as const;
  const envMain = envIds[region].main;
  const envPre = envIds[region].preorder;

  const main = envMain
    ? all.find((a) => a.id === envMain || a.account_id === envMain.replace('act_', ''))
    : findByPriority(rules.main, [...rules.preorder, ...rules.extras]);

  const preorder = envPre
    ? all.find((a) => a.id === envPre || a.account_id === envPre.replace('act_', ''))
    : findByPriority(rules.preorder);

  // Resolve extra accounts (any account matching extras needles that isn't main/preorder)
  const usedIds = new Set([main?.id, preorder?.id].filter(Boolean) as string[]);
  const extras: MetaAccount[] = [];
  for (const needle of rules.extras) {
    const found = all.find(
      (a) => norm(a.name).includes(norm(needle)) && !usedIds.has(a.id)
    );
    if (found) {
      extras.push(found);
      usedIds.add(found.id);
    }
  }

  const allList = [main, preorder, ...extras].filter(Boolean) as MetaAccount[];
  return { main, preorder, extras, all: allList };
}

// ---------- Insights ----------

export interface InsightsParams {
  level: 'account' | 'campaign' | 'adset' | 'ad';
  timeRange: DateRange;
  fields: string[];
  breakdowns?: string[];
  timeIncrement?: number | 'monthly';
  actionAttributionWindows?: string[];
  filtering?: { field: string; operator: string; value: unknown }[];
  limit?: number;
  useAsync?: boolean;
}

/** Insights — returns parsed rows for the requested level. */
export async function fetchInsights(adAccountId: string, p: InsightsParams): Promise<any[]> {
  if (!adAccountId) return [];
  const params: Record<string, string> = {
    access_token: token(),
    level: p.level,
    time_range: JSON.stringify({ since: p.timeRange.since, until: p.timeRange.until }),
    fields: p.fields.join(','),
    limit: String(p.limit ?? 500),
  };
  if (p.breakdowns?.length)      params.breakdowns = p.breakdowns.join(',');
  if (p.timeIncrement != null)   params.time_increment = String(p.timeIncrement);
  if (p.actionAttributionWindows?.length)
    params.action_attribution_windows = JSON.stringify(p.actionAttributionWindows);
  if (p.filtering?.length)       params.filtering = JSON.stringify(p.filtering);

  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}/${adAccountId}/insights?${qs}`;

  const r = await fetch(url, { next: { revalidate: 600 } });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Meta insights ${r.status} on ${adAccountId}: ${text.slice(0, 300)}`);
  }
  const j = await r.json();
  return j.data || [];
}

// ---------- Helpers for action arrays ----------

export function findAction(actions: any[] | undefined, type: string): number {
  if (!Array.isArray(actions)) return 0;
  const a = actions.find((x) => x.action_type === type);
  return a ? Number(a.value) : 0;
}

export function findActionValue(values: any[] | undefined, type: string): number {
  if (!Array.isArray(values)) return 0;
  const a = values.find((x) => x.action_type === type);
  return a ? Number(a.value) : 0;
}

// Common Meta action types we care about
export const ACTION_TYPES = {
  landingPageView:       'landing_page_view',
  addToCart:             'offsite_conversion.fb_pixel_add_to_cart',
  checkoutInitiated:     'offsite_conversion.fb_pixel_initiate_checkout',
  purchase:              'offsite_conversion.fb_pixel_purchase',
  outboundClick:         'outbound_click',
  linkClick:             'link_click',
  webPurchase:           'web_in_store_purchase',
} as const;

// ---------- Currency per region ----------
export function currencyForRegion(region: Region): string {
  return region === 'BR' ? 'BRL' : 'USD';
}
