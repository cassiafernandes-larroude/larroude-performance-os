// Cassia 2026-06-29: congelamento point-in-time da composição das collections do Calendário.
// PROBLEMA: o Shopify Admin só devolve os membros ATUAIS de uma collection (sem histórico) e o
// warehouse não guarda histórico de membership. Se uma collection é editada DEPOIS da campanha,
// medir performance pela composição de hoje atribui vendas aos SKUs errados.
// SOLUÇÃO: um cron diário grava aqui (Vercel KV) os SKUs canônicos de cada collection usada no
// Calendário, datados. Ao medir uma campanha, o results.ts lê o snapshot da JANELA (membership de
// quando rodou), não o membership ao vivo. Campanhas anteriores ao 1º snapshot caem no live
// (flag frozen=false).
// Por que KV e não BigQuery: o app não tem permissão de escrita no BQ; o KV é controlado pela Vercel,
// o dado é minúsculo e não exige IAM/time de dados.
//
// Armazenamento: uma chave por collection — `calcoll:<market>:<collectionId>` → JSON
//   { "YYYY-MM-DD": ["L123-...","..."], ... } (mapa data → SKUs canônicos). Mantém ~180 dias.
// Tudo é defensivo: sem KV configurado (env ausente) ou em qualquer erro, leitura volta [] e o
// results.ts cai no membership ao vivo — nada quebra.

import { kv } from '@vercel/kv';
import type { Market } from './asana';

const KEEP_DAYS = 180;

type DateMap = Record<string, string[]>;

function key(market: Market, collectionId: string): string {
  return `calcoll:${market}:${collectionId}`;
}

/** KV só funciona com as env vars que a Vercel injeta ao vincular um KV Store ao projeto. */
function kvReady(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function cutoffUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - KEEP_DAYS);
  return d.toISOString().slice(0, 10);
}

/**
 * Grava (idempotente) a composição de hoje de uma collection. Reescreve só a entrada do dia e poda
 * datas com mais de ~180 dias, então rodar o cron mais de uma vez no mesmo dia não duplica.
 */
export async function writeSnapshot(market: Market, collectionId: string, canonicalSkus: string[]): Promise<void> {
  if (!canonicalSkus.length || !kvReady()) return;
  const k = key(market, collectionId);
  const map = (await kv.get<DateMap>(k)) || {};
  map[todayUTC()] = canonicalSkus;
  const cutoff = cutoffUTC();
  for (const d of Object.keys(map)) if (d < cutoff) delete map[d];
  await kv.set(k, map);
}

/**
 * SKUs canônicos congelados de uma collection NA JANELA DA CAMPANHA: pega o snapshot mais recente
 * com data <= fim da janela (a composição de quando a campanha rodou). Vazio se não houver snapshot
 * (campanha anterior ao congelamento, ou KV indisponível) → o chamador cai no membership ao vivo.
 */
export async function getFrozenCollectionSkus(market: Market, collectionId: string, end: string): Promise<string[]> {
  if (!kvReady()) return [];
  const map = await kv.get<DateMap>(key(market, collectionId));
  if (!map) return [];
  let best: string | null = null;
  for (const d of Object.keys(map)) {
    if (d <= end && (best === null || d > best)) best = d;
  }
  return best ? map[best] || [] : [];
}
