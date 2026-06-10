import { NextResponse } from 'next/server';
import {
  queryGoogleAdsViaSupermetrics,
  queryGoogleAdsTotalViaSupermetrics,
} from '@/lib/main-dashboard/supermetrics';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  const start = '2026-05-13';
  const end = '2026-06-09';

  const out: any = {
    start, end,
    supermetrics_api_key_present: !!process.env.SUPERMETRICS_API_KEY,
    supermetrics_api_key_length: (process.env.SUPERMETRICS_API_KEY ?? '').length,
  };

  try {
    const total = await queryGoogleAdsTotalViaSupermetrics('US', start, end);
    out.googleTotal_US = total;
  } catch (err: any) {
    out.googleTotal_US_error = String(err?.message || err);
  }

  try {
    const daily = await queryGoogleAdsViaSupermetrics('US', start, end);
    out.googleDaily_US_count = daily.length;
    out.googleDaily_US_first3 = daily.slice(0, 3);
    out.googleDaily_US_sum = daily.reduce((s, r) => s + (Number(r.spend) || 0), 0);
  } catch (err: any) {
    out.googleDaily_US_error = String(err?.message || err);
  }

  return NextResponse.json(out);
}
