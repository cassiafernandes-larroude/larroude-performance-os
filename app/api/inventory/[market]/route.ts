// Cassia 2026-06-14: proxy interno para o dashboard de inventory.
// Endpoint: /api/inventory/US | /api/inventory/BR
// Retorna o mesmo shape que larroude-inventory-dashboard.vercel.app/api/inventory/{market}.
//
// Estrutura da row:
//   s: SKU mãe (ex L422-VERO-BLAC-1716)
//   n: nome do produto
//   m: método/source (from_batch | from_variant)
//   r7/q7/c7/p7/p7q: vendas 7d (revenue, qty, cost, profit, profit qty)
//   r14/q14/...     : 14d
//   r28/q28/...     : 28d (DTC só)
//   r3/q3/...       : 3M
//   r6/q6/...       : 6M
//   r12/q12/...     : 12M
//   q60             : qty últimos 60d
//   e               : estoque atual em loja/site
//   eo              : estoque outro depósito
//   eb              : estoque em lote/batch
//   r               : received (encomendas chegadas)
//   t               : in transit (em trânsito)
//   rp / tp         : data próxima recebimento / próxima em trânsito
//   rnum / tnum     : números das POs
//   ap              : avg price

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 600; // 10 min — atualiza com o dashboard externo
export const maxDuration = 60;

const EXTERNAL_BASE = 'https://larroude-inventory-dashboard.vercel.app/api/inventory';

export async function GET(_req: NextRequest, { params }: { params: { market: string } }) {
  const market = (params.market || '').toUpperCase();
  if (!['US', 'BR'].includes(market)) {
    return NextResponse.json({ error: 'Invalid market. Use US or BR.' }, { status: 400 });
  }
  try {
    const r = await fetch(`${EXTERNAL_BASE}/${market}`, {
      // Cache parcial — re-fetch a cada 10min via revalidate; sem 'no-store' senão perdemos perf.
      next: { revalidate: 600 },
    });
    if (!r.ok) {
      return NextResponse.json({ error: `Upstream HTTP ${r.status}` }, { status: 502 });
    }
    const data = await r.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=3600, public' },
    });
  } catch (e: any) {
    console.error('[inventory proxy] error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
