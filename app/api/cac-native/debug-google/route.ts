import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SUPERMETRICS_API = 'https://api.supermetrics.com/enterprise/v2/query/data/json';
const GADS_ACCOUNT_IDS_US = ['7244161860'];

export async function GET() {
  const start = '2026-05-13';
  const end = '2026-06-09';
  const apiKey = process.env.SUPERMETRICS_API_KEY;

  const out: any = {
    start, end,
    api_key_present: !!apiKey,
    api_key_length: (apiKey ?? '').length,
    api_key_first_8: apiKey ? apiKey.slice(0, 8) : null,
  };

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
    out.url_length = url.length;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey ?? ''}` },
    });
    out.http_status = res.status;
    out.http_ok = res.ok;
    const bodyText = await res.text();
    out.body_length = bodyText.length;
    out.body_first_500 = bodyText.slice(0, 500);
    try {
      const json = JSON.parse(bodyText);
      out.json_keys = Object.keys(json);
      out.has_data = !!json.data;
      out.data_length = json.data?.length;
      out.error = json.error;
      out.meta = json.meta;
      out.data_sample = json.data?.slice(0, 3);
    } catch (e: any) {
      out.json_parse_error = String(e?.message || e);
    }
  } catch (err: any) {
    out.fetch_error = String(err?.message || err);
  }

  return NextResponse.json(out);
}
