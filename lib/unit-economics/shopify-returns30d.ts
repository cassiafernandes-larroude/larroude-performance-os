/**
 * Return rate por produto — janela 30 dias.
 *
 * Cassia 2026-06-10: "em return rate voce tem que puxar a taxa de returns
 * dos ultimos 30 dias de cada produto"
 *
 * Conta refunded_qty / total_qty por mother SKU dos últimos 30 dias.
 */

import type { Market } from './queries';

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

function getConfig(market: Market) {
  if (market === 'US') {
    return {
      domain: process.env.SHOPIFY_US_STORE_DOMAIN || 'larroude-com.myshopify.com',
      token: process.env.SHOPIFY_US_ADMIN_API_TOKEN || '',
    };
  }
  return {
    domain: process.env.SHOPIFY_BR_STORE_DOMAIN || 'larroude-brasil.myshopify.com',
    token: process.env.SHOPIFY_BR_ADMIN_API_TOKEN || '',
  };
}

// Query: line items, refunds, paymentGatewayNames (pra pixShare 30d)
const ORDERS30D_QUERY = `
  query Orders30d($cursor: String, $query: String!) {
    orders(first: 250, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
      edges {
        cursor
        node {
          id
          cancelledAt
          test
          displayFinancialStatus
          tags
          paymentGatewayNames
          customer { tags }
          lineItems(first: 50) {
            edges {
              node {
                id
                sku
                quantity
                variant { sku }
              }
            }
          }
          refunds {
            refundLineItems(first: 50) {
              edges {
                node {
                  lineItem { id }
                  quantity
                }
              }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

function motherSkuOf(sku: string | null): string | null {
  if (!sku) return null;
  const parts = sku.split('-');
  if (parts.length < 3) return null;
  if (parts.length >= 4 && /^\d+(\.\d+)?$/.test(parts[2])) {
    if (parts.length >= 5 && parts[4]) {
      return `${parts[0]}-${parts[1]}-${parts[3]}-${parts[4]}`;
    }
    return `${parts[0]}-${parts[1]}-${parts[3]}`;
  }
  if (parts.length >= 4 && parts[3]) {
    return `${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}`;
  }
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
}

const EXCLUDED_TAGS = /b2b|wholesale|marketplace|redo|influencer/i;

export interface ReturnRateBySku {
  motherSku: string;
  variantSku: string;
  totalQty: number;
  refundedQty: number;
  returnRate: number;
}

export async function getReturnRatesLast30d(
  market: Market,
  endDate: string,
  timeoutMs: number = 80_000
): Promise<{
  byMother: Map<string, { totalQty: number; refundedQty: number; returnRate: number }>;
  byVariant: Map<string, { totalQty: number; refundedQty: number; returnRate: number }>;
  /** PIX share por mother SKU dos ultimos 30 dias (BR apenas; US sempre 0) */
  pixByMother: Map<string, { totalQty: number; pixQty: number; pixShare: number }>;
  pixByVariant: Map<string, { totalQty: number; pixQty: number; pixShare: number }>;
  /** PIX share agregado do market */
  pixShareOverall: number;
  pages: number;
  partial: boolean;
}> {
  const { domain, token } = getConfig(market);
  if (!token) throw new Error(`SHOPIFY_${market}_ADMIN_API_TOKEN not set`);
  const t0 = Date.now();

  // 30 dias terminando em endDate
  const end = new Date(endDate + 'T23:59:59Z');
  const start = new Date(end.getTime() - 29 * 86400000);
  start.setUTCHours(0, 0, 0, 0);
  const startISO = start.toISOString().slice(0, 10);

  const queryFilter = `created_at:>=${startISO}T00:00:00Z AND created_at:<=${endDate}T23:59:59Z AND -tag:b2b AND -tag:wholesale AND -tag:marketplace AND -tag:redo AND -tag:influencer`;

  const motherAgg = new Map<string, { totalQty: number; refundedQty: number }>();
  const variantAgg = new Map<string, { totalQty: number; refundedQty: number }>();
  const motherPix = new Map<string, { totalQty: number; pixQty: number }>();
  const variantPix = new Map<string, { totalQty: number; pixQty: number }>();
  let pixUnitsTotal = 0;
  let unitsTotal = 0;

  let cursor: string | null = null;
  let hasNext = true;
  let pages = 0;
  let partial = false;
  const MAX_PAGES = 400;
  const url = `https://${domain}/admin/api/${API_VERSION}/graphql.json`;

  while (hasNext && pages < MAX_PAGES) {
    if (Date.now() - t0 > timeoutMs) {
      partial = true;
      break;
    }
    pages++;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: ORDERS30D_QUERY, variables: { cursor, query: queryFilter } }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Shopify ret30d ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as any;
    if (json.errors?.length) throw new Error(`Shopify ret30d errors: ${JSON.stringify(json.errors).slice(0, 200)}`);
    const orders = json.data?.orders;
    if (!orders) break;

    for (const edge of orders.edges) {
      const o = edge.node;
      if (o.cancelledAt || o.test) continue;
      const fs = (o.displayFinancialStatus || '').toUpperCase();
      if (fs === 'VOIDED' || fs === 'REFUNDED') continue;
      const tagsCombined = (o.tags || []).concat(o.customer?.tags || []).join(' ').toLowerCase();
      if (EXCLUDED_TAGS.test(tagsCombined)) continue;

      // PIX detection (BR): paymentGatewayNames contém "pix"
      const isPix = market === 'BR'
        ? (o.paymentGatewayNames || []).some((p: string) => /pix/i.test(p || ''))
        : false;

      // Mapeia line item id → quantity + sku
      const lineMap = new Map<string, { qty: number; sku: string | null }>();
      for (const li of o.lineItems.edges) {
        lineMap.set(li.node.id, {
          qty: Number(li.node.quantity) || 0,
          sku: li.node.variant?.sku ?? li.node.sku,
        });
      }
      // Refunds: agrega refunded qty por line item id
      const refunds = new Map<string, number>();
      for (const r of o.refunds || []) {
        for (const rli of r.refundLineItems?.edges || []) {
          const lid = rli.node.lineItem?.id;
          if (!lid) continue;
          refunds.set(lid, (refunds.get(lid) || 0) + (rli.node.quantity || 0));
        }
      }

      for (const [lid, info] of lineMap.entries()) {
        if (!info.sku || info.qty <= 0) continue;
        const mSku = motherSkuOf(info.sku);
        if (!mSku) continue;
        if (/^x-/i.test(mSku) || /^[0-9]+$/.test(mSku)) continue;

        const refQty = refunds.get(lid) || 0;
        const mAcc = motherAgg.get(mSku) || { totalQty: 0, refundedQty: 0 };
        mAcc.totalQty += info.qty;
        mAcc.refundedQty += refQty;
        motherAgg.set(mSku, mAcc);

        const vKey = `${mSku}|${info.sku}`;
        const vAcc = variantAgg.get(vKey) || { totalQty: 0, refundedQty: 0 };
        vAcc.totalQty += info.qty;
        vAcc.refundedQty += refQty;
        variantAgg.set(vKey, vAcc);

        // PIX share (BR apenas) — 30d rolling por SKU
        const pixQ = isPix ? info.qty : 0;
        unitsTotal += info.qty;
        pixUnitsTotal += pixQ;
        const mPix = motherPix.get(mSku) || { totalQty: 0, pixQty: 0 };
        mPix.totalQty += info.qty;
        mPix.pixQty += pixQ;
        motherPix.set(mSku, mPix);
        const vPix = variantPix.get(vKey) || { totalQty: 0, pixQty: 0 };
        vPix.totalQty += info.qty;
        vPix.pixQty += pixQ;
        variantPix.set(vKey, vPix);
      }
    }

    hasNext = orders.pageInfo.hasNextPage;
    cursor = orders.pageInfo.endCursor;
  }

  const byMother = new Map<string, { totalQty: number; refundedQty: number; returnRate: number }>();
  for (const [k, v] of motherAgg.entries()) {
    byMother.set(k, {
      totalQty: v.totalQty,
      refundedQty: v.refundedQty,
      returnRate: v.totalQty > 0 ? v.refundedQty / v.totalQty : 0,
    });
  }
  const byVariant = new Map<string, { totalQty: number; refundedQty: number; returnRate: number }>();
  for (const [k, v] of variantAgg.entries()) {
    byVariant.set(k, {
      totalQty: v.totalQty,
      refundedQty: v.refundedQty,
      returnRate: v.totalQty > 0 ? v.refundedQty / v.totalQty : 0,
    });
  }

  const pixByMother = new Map<string, { totalQty: number; pixQty: number; pixShare: number }>();
  for (const [k, v] of motherPix.entries()) {
    pixByMother.set(k, {
      totalQty: v.totalQty,
      pixQty: v.pixQty,
      pixShare: v.totalQty > 0 ? v.pixQty / v.totalQty : 0,
    });
  }
  const pixByVariant = new Map<string, { totalQty: number; pixQty: number; pixShare: number }>();
  for (const [k, v] of variantPix.entries()) {
    pixByVariant.set(k, {
      totalQty: v.totalQty,
      pixQty: v.pixQty,
      pixShare: v.totalQty > 0 ? v.pixQty / v.totalQty : 0,
    });
  }
  const pixShareOverall = unitsTotal > 0 ? pixUnitsTotal / unitsTotal : 0;

  console.log(
    `[ue-ret30d ${market}] ${pages} pages, ${motherAgg.size} mothers, ${variantAgg.size} variants, pixShare30d=${(pixShareOverall * 100).toFixed(1)}%, partial=${partial}, ${Date.now() - t0}ms`
  );

  return { byMother, byVariant, pixByMother, pixByVariant, pixShareOverall, pages, partial };
}
