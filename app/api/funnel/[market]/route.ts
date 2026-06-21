// Cassia 2026-06-21: STUB de diagnóstico — sem imports do funil, p/ isolar a falha de build.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ available: false, error: 'stub-diagnostico', series: [], totals: null, shares: null, payment: { series: [], totals: null }, today: null, alerts: [] });
}
