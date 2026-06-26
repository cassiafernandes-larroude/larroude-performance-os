// Cassia 2026-06-26: aba Forecast de produção — projeção de unidades por SKU/modelo/categoria.
// REGRA CANÔNICA (definida pela Cássia, sem hipótese):
//   previsão = venda real da MESMA ESTAÇÃO do ano anterior (2025) × crescimento (default 1,30).
//   - semanal: cada dia 2026 casa com o dia equivalente de 2025 via -364 dias (preserva dia da semana).
//   - lançamentos sem venda na mesma estação de 2025 → run-rate dos últimos 92 dias × crescimento.
//   - categoria: classifica BOTA por título (product_type do Shopify tem erro: Dani Flatform Boot e
//     Dolly Verona Low Boot vinham como "Pump"); consolida Flat-Sandal.
//   - SKU completo = referência MODELO-FORMA-COR-CÓDIGO (sem tamanho).
import { runQuery } from '@/lib/cac-dashboard/bigquery';

export type Market = 'US' | 'BR';
export type Level = 'categoria' | 'modelo' | 'sku';

const PROJ = 'larroude-data-prod';
const DS: Record<Market, string> = { US: 'stg_shopify', BR: 'stg_shopify_br' };
const TZ: Record<Market, string> = { US: 'America/New_York', BR: 'America/Sao_Paulo' };

const DIM_SKU = `REGEXP_REPLACE(JSON_VALUE(li,'$.sku'), r'-[0-9]+\\.[0-9]+','')`;
const DIM_MODELO = `REGEXP_EXTRACT(JSON_VALUE(li,'$.sku'), r'^[A-Z]?\\d+')`;

function finFilter(m: Market): string {
  return m === 'BR'
    ? "o.financial_status NOT IN ('voided','refunded','pending','expired','authorized')"
    : "o.financial_status NOT IN ('voided','refunded')";
}

export interface ForecastRow {
  key: string;
  metodo: 'YoY' | 'run-rate';
  weekly: number[];
  total: number;
}
export interface ForecastResult {
  market: Market;
  level: Level;
  growth: number;
  from: string;
  to: string;
  weeks: string[];
  rows: ForecastRow[];
  generatedAt: string;
}

// Pareto: modelos (mother-SKU) que acumulam >50% da receita nos últimos 12 meses.
// Filtro aplicado em todos os níveis — só consideramos os SKUs que puxam o faturamento.
function paretoCTE(market: Market): string {
  const ds = DS[market], tz = TZ[market], fin = finFilter(market);
  return `rev AS (
  SELECT REGEXP_EXTRACT(JSON_VALUE(li,'$.sku'),r'^[A-Z]?\\d+') root,
    SUM(CAST(JSON_VALUE(li,'$.quantity') AS INT64) * SAFE_CAST(JSON_VALUE(li,'$.price') AS NUMERIC)) rv
  FROM \`${PROJ}.${ds}.orders\` o, UNNEST(JSON_QUERY_ARRAY(line_items)) li
  WHERE DATE(o.created_at,'${tz}') BETWEEN DATE_SUB(DATE(@from), INTERVAL 12 MONTH) AND DATE_SUB(DATE(@from), INTERVAL 1 DAY)
    AND ${fin}
  GROUP BY 1
),
pareto AS (
  SELECT root FROM (
    SELECT root, rv, SUM(rv) OVER() tot, SUM(rv) OVER(ORDER BY rv DESC) cum
    FROM rev WHERE root IS NOT NULL AND rv > 0
  ) WHERE cum - rv < tot * 0.5
)`;
}
const PARETO_FILTER = `REGEXP_EXTRACT(JSON_VALUE(li,'$.sku'),r'^[A-Z]?\\d+') IN (SELECT root FROM pareto)`;

// SQL para sku/modelo (dimensão derivada direto do SKU)
function sqlSkuModelo(market: Market, dim: string): string {
  const ds = DS[market], tz = TZ[market], fin = finFilter(market);
  return `
WITH ${paretoCTE(market)},
s25 AS (
  SELECT ${dim} AS k, DATE(o.created_at,'${tz}') d, CAST(JSON_VALUE(li,'$.quantity') AS INT64) qty
  FROM \`${PROJ}.${ds}.orders\` o, UNNEST(JSON_QUERY_ARRAY(line_items)) li
  WHERE DATE(o.created_at,'${tz}') BETWEEN DATE_SUB(DATE(@from), INTERVAL 364 DAY) AND DATE_SUB(DATE(@to), INTERVAL 364 DAY)
    AND ${fin} AND ${dim} IS NOT NULL AND ${PARETO_FILTER}
),
s25d AS (SELECT k, d, SUM(qty) q FROM s25 GROUP BY 1,2),
has25 AS (SELECT DISTINCT k FROM s25),
rr AS (
  SELECT ${dim} AS k, SUM(CAST(JSON_VALUE(li,'$.quantity') AS INT64))/92 daily
  FROM \`${PROJ}.${ds}.orders\` o, UNNEST(JSON_QUERY_ARRAY(line_items)) li
  WHERE DATE(o.created_at,'${tz}') BETWEEN DATE_SUB(DATE(@from), INTERVAL 92 DAY) AND DATE_SUB(DATE(@from), INTERVAL 1 DAY)
    AND ${fin} AND ${dim} IS NOT NULL AND ${PARETO_FILTER}
  GROUP BY 1
),
allk AS (SELECT k FROM has25 UNION DISTINCT SELECT k FROM rr),
days AS (SELECT d AS d26, DATE_SUB(d, INTERVAL 364 DAY) d25, DATE_TRUNC(d, WEEK(MONDAY)) wk
         FROM UNNEST(GENERATE_DATE_ARRAY(DATE(@from), DATE(@to))) d),
daily AS (
  SELECT a.k, days.wk,
    (CASE WHEN h.k IS NOT NULL THEN IFNULL(s.q,0) ELSE IFNULL(rr.daily,0) END) * @growth f,
    (h.k IS NOT NULL) is_yoy
  FROM allk a CROSS JOIN days
  LEFT JOIN has25 h ON h.k = a.k
  LEFT JOIN s25d s ON s.k = a.k AND s.d = days.d25
  LEFT JOIN rr ON rr.k = a.k
)
SELECT k AS dim_key, IF(LOGICAL_OR(is_yoy),'YoY','run-rate') metodo, FORMAT_DATE('%Y-%m-%d', wk) wk, ROUND(SUM(f)) f
FROM daily GROUP BY k, wk ORDER BY k, wk`;
}

// SQL para categoria (classifica bota por título + consolida Flat-Sandal, via map root->product_type)
function sqlCategoria(market: Market): string {
  const ds = DS[market], tz = TZ[market], fin = finFilter(market);
  const bootRe = market === 'BR' ? 'boot|bootie|bota' : 'boot|bootie';
  const classify = `CASE
      WHEN REGEXP_CONTAINS(LOWER(JSON_VALUE(li,'$.title')), r'${bootRe}') THEN 'Boot'
      WHEN REGEXP_CONTAINS(LOWER(COALESCE(m.categoria,'')), r'flat.*sandal') THEN 'Flat-Sandal'
      ELSE COALESCE(m.categoria, '(outros)') END`;
  return `
WITH ${paretoCTE(market)},
cat_src AS (
  SELECT REGEXP_EXTRACT(v.sku,r'^[A-Z]?\\d+') root, p.product_type categoria, COUNT(*) c
  FROM \`${PROJ}.stg_shopify.product_variants\` v JOIN \`${PROJ}.stg_shopify.products\` p ON p.id=v.product_id
  WHERE v.sku IS NOT NULL AND COALESCE(p.product_type,'')!='' GROUP BY 1,2
  UNION ALL
  SELECT REGEXP_EXTRACT(v.sku,r'^[A-Z]?\\d+'), p.product_type, COUNT(*)
  FROM \`${PROJ}.stg_shopify_br.product_variants\` v JOIN \`${PROJ}.stg_shopify_br.products\` p ON p.id=v.product_id
  WHERE v.sku IS NOT NULL AND COALESCE(p.product_type,'')!='' GROUP BY 1,2
),
map AS (SELECT root, categoria FROM (
  SELECT root, categoria, ROW_NUMBER() OVER(PARTITION BY root ORDER BY SUM(c) DESC) rn FROM cat_src GROUP BY root,categoria
) WHERE rn=1),
s25 AS (
  SELECT ${classify} AS k, DATE(o.created_at,'${tz}') d, CAST(JSON_VALUE(li,'$.quantity') AS INT64) qty
  FROM \`${PROJ}.${ds}.orders\` o, UNNEST(JSON_QUERY_ARRAY(line_items)) li
  LEFT JOIN map m ON m.root = REGEXP_EXTRACT(JSON_VALUE(li,'$.sku'),r'^[A-Z]?\\d+')
  WHERE DATE(o.created_at,'${tz}') BETWEEN DATE_SUB(DATE(@from), INTERVAL 364 DAY) AND DATE_SUB(DATE(@to), INTERVAL 364 DAY)
    AND ${fin} AND ${PARETO_FILTER}
),
s25d AS (SELECT k, d, SUM(qty) q FROM s25 GROUP BY 1,2),
has25 AS (SELECT DISTINCT k FROM s25),
rr AS (
  SELECT ${classify} AS k, SUM(CAST(JSON_VALUE(li,'$.quantity') AS INT64))/92 daily
  FROM \`${PROJ}.${ds}.orders\` o, UNNEST(JSON_QUERY_ARRAY(line_items)) li
  LEFT JOIN map m ON m.root = REGEXP_EXTRACT(JSON_VALUE(li,'$.sku'),r'^[A-Z]?\\d+')
  WHERE DATE(o.created_at,'${tz}') BETWEEN DATE_SUB(DATE(@from), INTERVAL 92 DAY) AND DATE_SUB(DATE(@from), INTERVAL 1 DAY)
    AND ${fin} AND ${PARETO_FILTER}
  GROUP BY 1
),
allk AS (SELECT k FROM has25 UNION DISTINCT SELECT k FROM rr),
days AS (SELECT d AS d26, DATE_SUB(d, INTERVAL 364 DAY) d25, DATE_TRUNC(d, WEEK(MONDAY)) wk
         FROM UNNEST(GENERATE_DATE_ARRAY(DATE(@from), DATE(@to))) d),
daily AS (
  SELECT a.k, days.wk,
    (CASE WHEN h.k IS NOT NULL THEN IFNULL(s.q,0) ELSE IFNULL(rr.daily,0) END) * @growth f,
    (h.k IS NOT NULL) is_yoy
  FROM allk a CROSS JOIN days
  LEFT JOIN has25 h ON h.k = a.k
  LEFT JOIN s25d s ON s.k = a.k AND s.d = days.d25
  LEFT JOIN rr ON rr.k = a.k
)
SELECT k AS dim_key, IF(LOGICAL_OR(is_yoy),'YoY','run-rate') metodo, FORMAT_DATE('%Y-%m-%d', wk) wk, ROUND(SUM(f)) f
FROM daily GROUP BY k, wk ORDER BY k, wk`;
}

// Lista de segundas-feiras (ISO) de from..to
function mondays(from: string, to: string): string[] {
  const start = new Date(from + 'T00:00:00Z');
  // recua até segunda-feira
  const dow = (start.getUTCDay() + 6) % 7; // 0 = segunda
  start.setUTCDate(start.getUTCDate() - dow);
  const end = new Date(to + 'T00:00:00Z');
  const out: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 7)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function getForecast(
  market: Market,
  level: Level,
  opts?: { from?: string; to?: string; growth?: number }
): Promise<ForecastResult> {
  const from = opts?.from ?? '2026-06-29';
  const to = opts?.to ?? '2026-09-11';
  const growth = opts?.growth ?? 1.3;

  const sql = level === 'categoria'
    ? sqlCategoria(market)
    : sqlSkuModelo(market, level === 'sku' ? DIM_SKU : DIM_MODELO);

  const raw = await runQuery<{ dim_key: string; metodo: string; wk: string; f: number }>(sql, { from, to, growth });

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
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  return { market, level, growth, from, to, weeks, rows, generatedAt: new Date().toISOString() };
}
