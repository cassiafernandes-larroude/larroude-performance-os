// Cassia 2026-06-26: aba Forecast de produção — projeção de unidades por SKU/modelo/categoria.
// MÉTODO (definido com a Cássia; sem hipótese, especializado):
//   1) VOLUME por SKU = venda real da MESMA ESTAÇÃO de 2025 × crescimento (default 1,30).
//      Lançamentos sem 2025 → run-rate dos últimos 92 dias × crescimento.
//   2) FORMA SEMANAL = índice sazonal semanal da CATEGORIA (média 2024+2025, suavizado 3 semanas,
//      normalizado) — captura a curva real (sandália cai, bota/tênis sobem pro fim) sem picos de 1 SKU.
//   forecast(SKU, semana) = volume_total(SKU) × share_semanal(categoria, semana).
//   3) Considera só os SKUs do Pareto (modelos que somam >50% da receita nos últimos 12 meses).
//   4) Categoria classifica BOTA por título (product_type do Shopify erra) e consolida Flat-Sandal.
//      SKU completo = referência MODELO-FORMA-COR-CÓDIGO (sem tamanho).
import { runQuery } from '@/lib/cac-dashboard/bigquery';

export type Market = 'US' | 'BR';
export type Level = 'categoria' | 'modelo' | 'sku';

const PROJ = 'larroude-data-prod';
const DS: Record<Market, string> = { US: 'stg_shopify', BR: 'stg_shopify_br' };
const TZ: Record<Market, string> = { US: 'America/New_York', BR: 'America/Sao_Paulo' };

const DIM_SKU = `REGEXP_REPLACE(JSON_VALUE(li,'$.sku'), r'-[0-9]+\\.[0-9]+','')`;
const DIM_MODELO = `REGEXP_EXTRACT(JSON_VALUE(li,'$.sku'), r'^[A-Z]?\\d+')`;
const ROOT = `REGEXP_EXTRACT(JSON_VALUE(li,'$.sku'), r'^[A-Z]?\\d+')`;

function finFilter(m: Market): string {
  return m === 'BR'
    ? "o.financial_status NOT IN ('voided','refunded','pending','expired','authorized')"
    : "o.financial_status NOT IN ('voided','refunded')";
}

export interface ForecastRow { key: string; metodo: 'YoY' | 'run-rate'; weekly: number[]; total: number; }
export interface ForecastResult {
  market: Market; level: Level; growth: number; from: string; to: string;
  weeks: string[]; rows: ForecastRow[]; generatedAt: string;
}

function buildSQL(market: Market, level: Level): string {
  const ds = DS[market], tz = TZ[market], fin = finFilter(market);
  const bootRe = market === 'BR' ? 'boot|bootie|bota' : 'boot|bootie';
  const classify = `CASE
      WHEN REGEXP_CONTAINS(LOWER(JSON_VALUE(li,'$.title')), r'${bootRe}') THEN 'Boot'
      WHEN REGEXP_CONTAINS(LOWER(COALESCE(m.cat,'')), r'flat.*sandal') THEN 'Flat-Sandal'
      ELSE COALESCE(m.cat, '(outros)') END`;
  const keyexpr = level === 'sku' ? DIM_SKU : level === 'modelo' ? DIM_MODELO : classify;
  const D = (n: number) => `DATE_SUB(DATE(@from), INTERVAL ${n} DAY)`;
  const Dt = (n: number) => `DATE_SUB(DATE(@to), INTERVAL ${n} DAY)`;

  return `
WITH rev AS (
  SELECT ${ROOT} root, SUM(CAST(JSON_VALUE(li,'$.quantity') AS INT64)*SAFE_CAST(JSON_VALUE(li,'$.price') AS NUMERIC)) rv
  FROM \`${PROJ}.${ds}.orders\` o, UNNEST(JSON_QUERY_ARRAY(line_items)) li
  WHERE DATE(o.created_at,'${tz}') BETWEEN DATE_SUB(DATE(@from), INTERVAL 12 MONTH) AND ${D(1)} AND ${fin} GROUP BY 1
),
pareto AS (SELECT root FROM (SELECT root,rv,SUM(rv) OVER() tot,SUM(rv) OVER(ORDER BY rv DESC) cum FROM rev WHERE root IS NOT NULL AND rv>0) WHERE cum-rv<tot*0.5),
csrc AS (
  SELECT REGEXP_EXTRACT(v.sku,r'^[A-Z]?\\d+') root, p.product_type cat, COUNT(*) c
  FROM \`${PROJ}.stg_shopify.product_variants\` v JOIN \`${PROJ}.stg_shopify.products\` p ON p.id=v.product_id
  WHERE v.sku IS NOT NULL AND COALESCE(p.product_type,'')!='' GROUP BY 1,2
  UNION ALL
  SELECT REGEXP_EXTRACT(v.sku,r'^[A-Z]?\\d+'), p.product_type, COUNT(*)
  FROM \`${PROJ}.stg_shopify_br.product_variants\` v JOIN \`${PROJ}.stg_shopify_br.products\` p ON p.id=v.product_id
  WHERE v.sku IS NOT NULL AND COALESCE(p.product_type,'')!='' GROUP BY 1,2
),
map AS (SELECT root,cat FROM (SELECT root,cat,ROW_NUMBER() OVER(PARTITION BY root ORDER BY SUM(c) DESC) rn FROM csrc GROUP BY root,cat) WHERE rn=1),
days AS (
  SELECT d, EXTRACT(MONTH FROM d) mnum,
    DATE_DIFF(DATE_TRUNC(d,WEEK(MONDAY)), DATE_TRUNC(DATE(@from),WEEK(MONDAY)), WEEK)+1 widx,
    DATE_DIFF(DATE_ADD(DATE_TRUNC(d,MONTH),INTERVAL 1 MONTH),DATE_TRUNC(d,MONTH),DAY) md
  FROM UNNEST(GENERATE_DATE_ARRAY(DATE(@from), DATE(@to))) d
),
mfrac AS (SELECT mnum, COUNT(*) dih, ANY_VALUE(md) md FROM days GROUP BY mnum),
dayswk AS (SELECT DISTINCT widx FROM days),
hz AS (SELECT COUNT(*) n FROM days),
-- perfil semanal por categoria (2024 + 2025, suavizado 3 semanas, normalizado)
profsrc AS (
  SELECT ${classify} cat,
    DATE_DIFF(DATE_TRUNC(DATE(o.created_at,'${tz}'),WEEK(MONDAY)),
      DATE_TRUNC(IF(DATE(o.created_at,'${tz}')<DATE_SUB(DATE(@from),INTERVAL 546 DAY), ${D(728)}, ${D(364)}),WEEK(MONDAY)),WEEK)+1 widx,
    CAST(JSON_VALUE(li,'$.quantity') AS INT64) qty
  FROM \`${PROJ}.${ds}.orders\` o, UNNEST(JSON_QUERY_ARRAY(line_items)) li
  LEFT JOIN map m ON m.root=${ROOT}
  WHERE ${fin} AND ${ROOT} IN (SELECT root FROM pareto)
    AND (DATE(o.created_at,'${tz}') BETWEEN ${D(728)} AND ${Dt(728)}
      OR DATE(o.created_at,'${tz}') BETWEEN ${D(364)} AND ${Dt(364)})
),
grid AS (SELECT cat, widx FROM (SELECT DISTINCT cat FROM profsrc) CROSS JOIN dayswk),
praw AS (SELECT g.cat, g.widx, IFNULL(SUM(p.qty),0) u FROM grid g LEFT JOIN profsrc p ON p.cat=g.cat AND p.widx=g.widx GROUP BY 1,2),
psm AS (SELECT cat, widx, AVG(u) OVER(PARTITION BY cat ORDER BY widx ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) us FROM praw),
profile AS (SELECT cat, widx, SAFE_DIVIDE(us, SUM(us) OVER(PARTITION BY cat)) share FROM psm),
-- volume YoY por chave (mês 2025 × crescimento, proporcional aos dias no horizonte)
src25 AS (
  SELECT ${keyexpr} k, ${classify} cat, EXTRACT(MONTH FROM DATE(o.created_at,'${tz}')) mnum, CAST(JSON_VALUE(li,'$.quantity') AS INT64) qty
  FROM \`${PROJ}.${ds}.orders\` o, UNNEST(JSON_QUERY_ARRAY(line_items)) li
  LEFT JOIN map m ON m.root=${ROOT}
  WHERE DATE(o.created_at,'${tz}') BETWEEN DATE_TRUNC(${D(364)},MONTH) AND LAST_DAY(${Dt(364)})
    AND ${fin} AND ${ROOT} IN (SELECT root FROM pareto)
),
yoy AS (SELECT k, ANY_VALUE(cat) cat, SUM(qty*@growth*mfrac.dih/mfrac.md) tot FROM src25 JOIN mfrac USING(mnum) GROUP BY k),
-- run-rate p/ lançamentos sem 2025
rrsrc AS (
  SELECT ${keyexpr} k, ${classify} cat, CAST(JSON_VALUE(li,'$.quantity') AS INT64) qty
  FROM \`${PROJ}.${ds}.orders\` o, UNNEST(JSON_QUERY_ARRAY(line_items)) li
  LEFT JOIN map m ON m.root=${ROOT}
  WHERE DATE(o.created_at,'${tz}') BETWEEN ${D(92)} AND ${D(1)} AND ${fin} AND ${ROOT} IN (SELECT root FROM pareto)
),
rr AS (SELECT k, ANY_VALUE(cat) cat, SUM(qty)/92*@growth*(SELECT n FROM hz) tot FROM rrsrc GROUP BY k),
seas AS (
  SELECT COALESCE(y.k,r.k) k, IF(y.k IS NOT NULL,'YoY','run-rate') metodo, COALESCE(y.cat,r.cat) cat, COALESCE(y.tot,r.tot) tot
  FROM yoy y FULL OUTER JOIN rr r ON r.k=y.k
),
wkmap AS (SELECT widx, DATE_ADD(DATE_TRUNC(DATE(@from),WEEK(MONDAY)), INTERVAL widx-1 WEEK) wkm FROM dayswk)
SELECT s.k AS dim_key, s.metodo, FORMAT_DATE('%Y-%m-%d', w.wkm) wk, ROUND(s.tot * pr.share) f
FROM seas s
JOIN profile pr ON pr.cat = s.cat
JOIN wkmap w ON w.widx = pr.widx
WHERE s.tot IS NOT NULL`;
}

function mondays(from: string, to: string): string[] {
  const start = new Date(from + 'T00:00:00Z');
  const dow = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - dow);
  const end = new Date(to + 'T00:00:00Z');
  const out: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 7)) out.push(d.toISOString().slice(0, 10));
  return out;
}

export async function getForecast(
  market: Market, level: Level, opts?: { from?: string; to?: string; growth?: number }
): Promise<ForecastResult> {
  const from = opts?.from ?? '2026-06-29';
  const to = opts?.to ?? '2026-09-11';
  const growth = opts?.growth ?? 1.3;

  const raw = await runQuery<{ dim_key: string; metodo: string; wk: string; f: number }>(buildSQL(market, level), { from, to, growth });

  const weeks = mondays(from, to);
  const wkIndex = new Map(weeks.map((w, i) => [w, i]));
  const byKey = new Map<string, { metodo: string; weekly: number[] }>();
  for (const r of raw) {
    if (!r.dim_key) continue;
    let row = byKey.get(r.dim_key);
    if (!row) { row = { metodo: r.metodo, weekly: new Array(weeks.length).fill(0) }; byKey.set(r.dim_key, row); }
    const i = wkIndex.get(r.wk);
    if (i != null) row.weekly[i] = Number(r.f) || 0;
  }

  const rows: ForecastRow[] = [...byKey.entries()]
    .map(([key, v]) => ({
      key,
      metodo: (v.metodo === 'YoY' ? 'YoY' : 'run-rate') as ForecastRow['metodo'],
      weekly: v.weekly,
      total: v.weekly.reduce((s, n) => s + n, 0),
    }))
    .filter((r) => r.total >= 100) // só produtos com >= 100 un. no horizonte (mínimo p/ abrir produção)
    .sort((a, b) => b.total - a.total);

  return { market, level, growth, from, to, weeks, rows, generatedAt: new Date().toISOString() };
}
