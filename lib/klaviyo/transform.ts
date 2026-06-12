/**
 * Klaviyo response parsers e transformers.
 *
 * GOTCHA: parser usa `results[].statistics[name]` (objeto com arrays), NÃO
 * `results[].data[idx]` (Cassia 2026-06-11, 1h de debug).
 */

import type { CampaignRow, FlowRow, CampaignType, FlowType, FlowCategory } from './types';
import { classifyCampaign, classifyFlow, classifyFlowCategory } from './classify';

function sumArr(arr: any): number {
  if (!Array.isArray(arr)) return Number(arr) || 0;
  return arr.reduce((a, b) => a + (Number(b) || 0), 0);
}

/**
 * Merge campaigns list + values-report results em CampaignRow[].
 */
export function buildCampaignRows(
  campaigns: any[],
  reports: any[]
): CampaignRow[] {
  const reportsById = new Map<string, any>();
  for (const r of reports) {
    const id = r?.groupings?.campaign_id || r?.groupings?.id;
    if (id) reportsById.set(id, r?.statistics ?? {});
  }
  return campaigns.map((c) => {
    const id = c.id;
    const name = c?.attributes?.name || 'Unnamed';
    const stats = reportsById.get(id) || {};
    const recipients = sumArr(stats.recipients);
    const delivered = sumArr(stats.delivered);
    const opens = sumArr(stats.opens_unique);
    const clicks = sumArr(stats.clicks_unique);
    const unsubscribes = sumArr(stats.unsubscribes);
    const bounces = sumArr(stats.bounced);
    const spam = sumArr(stats.spam_complaints);
    const revenue = sumArr(stats.revenue);
    const orders = sumArr(stats.orders);
    const sentAt = c?.attributes?.send_time || c?.attributes?.scheduled_at || '';
    return {
      id,
      name,
      sentAt,
      type: classifyCampaign(name),
      recipients,
      delivered,
      opens,
      clicks,
      unsubscribes,
      bounces,
      spamComplaints: spam,
      revenue,
      orders,
      openRate: delivered > 0 ? opens / delivered : 0,
      clickRate: delivered > 0 ? clicks / delivered : 0,
      unsubRate: delivered > 0 ? unsubscribes / delivered : 0,
      bounceRate: recipients > 0 ? bounces / recipients : 0,
      revenuePerRecipient: recipients > 0 ? revenue / recipients : 0,
    };
  });
}

/**
 * Merge flows list + values-report results em FlowRow[].
 */
export function buildFlowRows(flows: any[], reports: any[]): FlowRow[] {
  const reportsById = new Map<string, any>();
  for (const r of reports) {
    const id = r?.groupings?.flow_id || r?.groupings?.id;
    if (id) reportsById.set(id, r?.statistics ?? {});
  }
  return flows.map((f) => {
    const id = f.id;
    const name = f?.attributes?.name || 'Unnamed';
    const stats = reportsById.get(id) || {};
    const recipients = sumArr(stats.recipients);
    const delivered = sumArr(stats.delivered);
    const opens = sumArr(stats.opens_unique);
    const clicks = sumArr(stats.clicks_unique);
    const unsubscribes = sumArr(stats.unsubscribes);
    const bounces = sumArr(stats.bounced);
    const revenue = sumArr(stats.revenue);
    const orders = sumArr(stats.orders);
    return {
      id,
      name,
      flowType: classifyFlow(name),
      category: classifyFlowCategory(name),
      status: f?.attributes?.status || 'unknown',
      recipients,
      delivered,
      opens,
      clicks,
      unsubscribes,
      bounces,
      revenue,
      orders,
      openRate: delivered > 0 ? opens / delivered : 0,
      clickRate: delivered > 0 ? clicks / delivered : 0,
      unsubRate: delivered > 0 ? unsubscribes / delivered : 0,
      bounceRate: recipients > 0 ? bounces / recipients : 0,
      revenuePerRecipient: recipients > 0 ? revenue / recipients : 0,
    };
  });
}

/**
 * Aggregate totals across campaigns or flows.
 */
export function aggregateRows(rows: { recipients: number; delivered: number; opens: number; clicks: number; unsubscribes: number; bounces: number; revenue: number; orders: number }[]) {
  return rows.reduce(
    (acc, r) => ({
      recipients: acc.recipients + r.recipients,
      delivered: acc.delivered + r.delivered,
      opens: acc.opens + r.opens,
      clicks: acc.clicks + r.clicks,
      unsubscribes: acc.unsubscribes + r.unsubscribes,
      bounces: acc.bounces + r.bounces,
      revenue: acc.revenue + r.revenue,
      orders: acc.orders + r.orders,
    }),
    { recipients: 0, delivered: 0, opens: 0, clicks: 0, unsubscribes: 0, bounces: 0, revenue: 0, orders: 0 }
  );
}
