// Cassia 2026-06-29: congelamento point-in-time da composição das collections do Calendário.
// PROBLEMA: o Shopify Admin só devolve os membros ATUAIS de uma collection (sem histórico) e o
// warehouse não guarda histórico de membership. Se uma collection é editada DEPOIS da campanha,
// medir performance pela composição de hoje atribui vendas aos SKUs errados.
// SOLUÇÃO: um cron diário grava aqui (BQ) os SKUs canônicos de cada collection usada no Calendário,
// datado. Ao medir uma campanha, o results.ts lê o snapshot da janela (membership de quando rodou),
// não o membership ao vivo. Campanhas anteriores ao 1º snapshot caem no live (flag frozen=false).
//
// Tabela: larroude-data-prod.app_calendar.collection_membership_daily
//   (market, collection_id, snapshot_date, canonical_sku, captured_at) — partitionada por data.
// Tudo é defensivo: se a service account não tiver permissão de escrita, o cron loga o erro e o
// caminho de leitura cai no membership ao vivo — nada quebra.

import { runQuery } from '@/lib/cac-dashboard/bigquery';
import type { Market } from './asana';

const DATASET = 'larroude-data-prod.app_calendar';
const TABLE = `${DATASET}.collection_membership_daily`;

let tableEnsured = false;

/** Cria dataset+tabela se não existirem (idempotente; só roda uma vez por processo). */
export async function ensureSnapshotTable(): Promise<void> {
  if (tableEnsured) return;
  await runQuery(`CREATE SCHEMA IF NOT EXISTS \`${DATASET}\` OPTIONS(location='US')`);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
      market STRING NOT NULL,
      collection_id STRING NOT NULL,
      snapshot_date DATE NOT NULL,
      canonical_sku STRING NOT NULL,
      captured_at TIMESTAMP
    )
    PARTITION BY snapshot_date
    CLUSTER BY market, collection_id`);
  tableEnsured = true;
}

/**
 * Grava (idempotente) a composição de hoje de uma collection. Reescreve a partição do dia para
 * (market, collection_id), então rodar o cron mais de uma vez no mesmo dia não duplica.
 */
export async function writeSnapshot(market: Market, collectionId: string, canonicalSkus: string[]): Promise<void> {
  if (!canonicalSkus.length) return;
  await ensureSnapshotTable();
  await runQuery(
    `DELETE FROM \`${TABLE}\` WHERE market=@m AND collection_id=@c AND snapshot_date=CURRENT_DATE('UTC')`,
    { m: market, c: collectionId }
  );
  await runQuery(
    `INSERT INTO \`${TABLE}\` (market, collection_id, snapshot_date, canonical_sku, captured_at)
     SELECT @m, @c, CURRENT_DATE('UTC'), sku, CURRENT_TIMESTAMP() FROM UNNEST(@skus) sku`,
    { m: market, c: collectionId, skus: canonicalSkus }
  );
}

/**
 * SKUs canônicos congelados de uma collection NA JANELA DA CAMPANHA: pega o snapshot mais recente
 * com data <= fim da janela (a composição de quando a campanha rodou). Vazio se não houver snapshot
 * (campanha anterior ao congelamento, ou tabela inexistente) → o chamador cai no membership ao vivo.
 */
export async function getFrozenCollectionSkus(market: Market, collectionId: string, end: string): Promise<string[]> {
  const rows = await runQuery<{ canonical_sku: string }>(
    `SELECT canonical_sku FROM \`${TABLE}\`
     WHERE market=@m AND collection_id=@c AND snapshot_date <= DATE(@end)
       AND snapshot_date = (
         SELECT MAX(snapshot_date) FROM \`${TABLE}\`
         WHERE market=@m AND collection_id=@c AND snapshot_date <= DATE(@end)
       )`,
    { m: market, c: collectionId, end }
  );
  return rows.map((r) => r.canonical_sku).filter(Boolean);
}
