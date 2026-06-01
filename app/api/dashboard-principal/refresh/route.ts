// POST /api/dashboard-principal/refresh
// Endpoint do botao "Atualizar agora".
// Como o cache do data route eh per-instance Serverless, nao podemos invalidar
// imperativamente daqui. O client manda ?t=<timestamp> no proximo GET, que
// passa cache-busting via Cache-Control no-store no fetch.
// Esta rota apenas confirma a intenticao - nao toca em estado.

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json({ ok: true, clearedAt: new Date().toISOString() });
}

export async function GET() {
  return NextResponse.json({ ok: true, clearedAt: new Date().toISOString() });
}
