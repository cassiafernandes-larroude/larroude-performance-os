// Transformações: mapeia respostas Klaviyo para CampaignRow/FlowRow normalizados.
import { classifyCampaign, classifyFlow, isCsFlow, classifyFlowCategory } from './classify';
import type { CampaignRow, FlowRow } from '@/types/klaviyo/models';

interface ReportEntry { groupings?: { campaign_id?: string; flow_id?: string }; statistics: Record<string, number>; }

export function reportToMap(report: any): Map<string, Record<string, number>> {
  const m = new Map<string, Record<string, number>>();
  const results = report?.data?.attributes?.results || report?.attributes?.results || [];
  for (const r of results) {
    const id = r?.groupings?.campaign_id || r?.groupings?.flow_id;
    if (!id) continue;
    m.set(id, r?.statistics || {});
  }
  return m;
}

export function buildCampaignRows(meta: any[], reportMap: Map<string, Record<string, number>>): CampaignRow[] {
  return meta.map((c: any) => {
    const id = c.id;
    const a = c.attributes || {};
    const s = reportMap.get(id) || {};
    const recipients = num(s.recipients);
    const delivered = num(s.delivered);
    const opens = num(s.opens_unique);
    const clicks = num(s.clicks_unique);
    const conversions = num(s.conversions);
    const revenue = num(s.conversion_value);
    const bounces = num(s.bounced);
    const unsubs = num(s.unsubscribes);
    const spam = num(s.spam_complaints);
    return {
      id,
      name: a.name || '(unnamed)',
      sendDate: a.send_time || a.scheduled_at || '',
      status: a.status || 'Sent',
      recipients, delivered, opens, clicks, conversions, revenue, bounces, unsubs,
      spamComplaints: spam,
      openRate: pct(s.open_rate, opens, delivered),
      clickRate: pct(s.click_rate, clicks, delivered),
      rpr: recipients ? revenue / recipients : 0,
      cvr: pct(s.conversion_rate, conversions, recipients),
      bounceRate: pct(s.bounce_rate, bounces, recipients),
      unsubRate: pct(s.unsubscribe_rate, unsubs, recipients),
      type: classifyCampaign(a.name || ''),
      audience: undefined
    };
  });
}

export function buildFlowRows(meta: any[], reportMap: Map<string, Record<string, number>>): FlowRow[] {
  return meta.map((f: any) => {
    const id = f.id;
    const a = f.attributes || {};
    const s = reportMap.get(id) || {};
    const recipients = num(s.recipients);
    const delivered = num(s.delivered);
    const opens = num(s.opens_unique);
    const clicks = num(s.clicks_unique);
    const conversions = num(s.conversions);
    const revenue = num(s.conversion_value);
    const bounces = num(s.bounced);
    const unsubs = num(s.unsubscribes);
    const spam = num(s.spam_complaints);
    return {
      id,
      name: a.name || '(unnamed)',
      status: a.status || 'live',
      recipients, delivered, opens, clicks, conversions, revenue, bounces, unsubs,
      spamComplaints: spam,
      openRate: pct(s.open_rate, opens, delivered),
      clickRate: pct(s.click_rate, clicks, delivered),
      rpr: recipients ? revenue / recipients : 0,
      cvr: pct(s.conversion_rate, conversions, recipients),
      bounceRate: pct(s.bounce_rate, bounces, recipients),
      unsubRate: pct(s.unsubscribe_rate, unsubs, recipients),
      triggerType: a.trigger_type || '—',
      flowType: classifyFlow(a.name || ''),
      category: classifyFlowCategory(a.name || ''),
      isLive: (a.status || 'live') === 'live',
      isCS: isCsFlow(a.name || '')
    };
  });
}

function num(v: any): number { return typeof v === 'number' && !isNaN(v) ? v : 0; }
function pct(rate: any, numerator: number, denominator: number): number {
  if (typeof rate === 'number' && !isNaN(rate)) return rate > 1 ? rate : rate * 100;
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}
