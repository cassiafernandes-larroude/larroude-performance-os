// Cassia 2026-07-02: camada S&OP da aba Performance de Produto — unidades projetadas
// nas PRÓXIMAS 4 SEMANAS por SKU-mãe, usando o motor da aba Forecast (lib/forecast/bq.ts).
// Janela dinâmica (hoje → hoje+27d) pra não depender do default estático do getForecast.
// O forecast só cobre SKUs do Pareto com ≥100 un. no horizonte — produto fora dele fica
// sem projeção (null na UI, sem badge de ruptura). Falha/vazio degrada silenciosamente.

import { getForecast, type Market } from '@/lib/forecast/bq';
import { memo, TTL_6H } from '@/lib/ltv-dashboard/memo-cache';

// Chave do forecast (sku sem "-9.0") → SKU-mãe do Shopify (mesma normalização do stock.ts).
function toMotherSku(key: string): string {
  return key.replace(/^(L\d+-[A-Z]+)-[0-9.]+-/, '$1-');
}

/** Unidades projetadas nos próximos 28 dias, por SKU-mãe. Vazio se o forecast não retornar nada. */
export async function getForecastNext4w(market: Market): Promise<Record<string, number>> {
  const from = new Date().toISOString().slice(0, 10);
  return memo(`sop-forecast4w:${market}:${from}:v1`, TTL_6H, async () => {
    const toD = new Date(from + 'T00:00:00Z');
    toD.setUTCDate(toD.getUTCDate() + 27); // 4 semanas inclusivas
    const res = await getForecast(market, 'sku', { from, to: toD.toISOString().slice(0, 10) });
    const out: Record<string, number> = {};
    for (const r of res.rows) {
      const mother = toMotherSku(r.key);
      out[mother] = (out[mother] || 0) + r.total;
    }
    return out;
  });
}
