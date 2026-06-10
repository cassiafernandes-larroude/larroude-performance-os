import { NextResponse } from 'next/server';
import {
  queryGoogleAdsViaSupermetrics,
  queryGoogleAdsTotalViaSupermetrics,
} from '@/lib/main-dashboard/supermetrics';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SUPERMETRICS_API = 'https://api.supermetrics.com/enterprise/v2/query/data/json';
const GADS_ACCOUNT_IDS_US = ['7244161860'];

export async function GET() {
  const start = '2026-05-13';
  const end = '2026-06-09';
  const apiKey = process.env.SUPERMETRICS_API_KEY;
  const out: any = { start, end, api_key_present: !!apiKey };

  // 1. RAW fetch direto pra Supermetrics
  const params = {
    ds_id: 'AW',
    ds_accounts: GADS_ACCOUNT_IDS_US,
    fields: 'Date,Cost,Clicks,Impressions,Conversions,ConversionValue',
    date_range_type: 'custom',
    start_date: start,
    end_date: end,
    max_rows: 1000,
  };
  try {
    const url = `${SUPERMETRICS_API}?json=${encodeURIComponent(JSON.stringify(params))}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey ?? ''}` },
    });
    const bodyText = await res.text();
    const json = JSON.parse(bodyText);
    out.raw_http_status = res.status;
    out.raw_data_length = json.data?.length;
    out.raw_first_row = json.data?.[0];
    out.raw_second_row = json.data?.[1];
    out.raw_sum_spend = json.data?.slice(1).reduce((s: number, r: any[]) => s + (Number(r[1]) || 0), 0);
  } catch (err: any) {
    out.raw_error = String(err?.message || err);
  }

  // 2. Função do main-dashboard
  try {
    const total = await queryGoogleAdsTotalViaSupermetrics('US', start, end);
    out.fn_total_spend = total.spend;
  } catch (err: any) {
    out.fn_total_error = String(err?.message || err);
  }

  try {
    const daily = await queryGoogleAdsViaSupermetrics('US', start, end);
    out.fn_daily_count = daily.length;
    out.fn_daily_first = daily[0];
    out.fn_daily_sum = daily.reduce((s, r) => s + (Number(r.spend) || 0), 0);
  } catch (err: any) {
    out.fn_daily_error = String(err?.message || err);
  }

  return NextResponse.json(out);
}
