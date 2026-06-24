// Cassia 2026-06-24: Produção 2.0 agora é interno ao OS — lê BigQuery direto,
// sem o app externo (larroude-producao-dashboard) e sem o mart DM_SUPPLY_CHAIN.
//
// Fontes (camada silver de larroude-data-platform), conforme definido pela Cássia:
//   - silver.vpcp_op                 → View de remessas (OP × tamanho: quantidade, cod_ref, roteiro de setores)
//   - silver.vpcp_baixas_op_setores  → Apontamento produtivo (baixas por setor/fábrica/dia)
//   - silver.vw_baixa_par_saidas     → Apontamento par a par / montagem (baixados finais por sku)
//   - silver.vpcp_remessa            → HEADER da remessa (fábrica, dt_entrega, dt_inicio, ativa). Necessário
//                                       pois dt_entrega/datas/flag-ativa NÃO existem nas 3 views acima.
//
// Recorte de "remessa ativa" = vpcp_remessa.eh_encerrado = 'F'.
// Os volumes batem ~99% com o antigo proxy (o mart aplicava um filtro de status
// um pouco mais fino que não é reconstituível a partir do cru).

import { runQuery } from '@/lib/cac-dashboard/bigquery';

const SILVER = 'larroude-data-platform.silver';
const SENDA4 = '40'; // cod_fabrica da LARROUDE FILIAL SAPIRANGA 4 - 1 (parque principal)

// ---------------------------------------------------------------------------
// Tipos espelhando o shape que components/producao-native/Dashboard.tsx consome
// ---------------------------------------------------------------------------
export interface ProducaoTotals {
  paresPendentes: number;
  paresBaixados: number;
  remessasAtivas: number;
  remessasGargalo: number;
  remessasBloqueadas: number;
  remessasAtrasadas: number;
  leadTimeMedio: number | null;
  proximaEntrega: string | null;
}
export interface Fabrica {
  nome_fabrica: string;
  remessas: number;
  pares_pendentes: number;
  pares_baixados: number;
  avg_lead_time: number | null;
  remessas_em_gargalo: number;
}
export interface Setor {
  nome_setor: string;
  sequencia: number;
  lotes_no_setor: number;
  pares_pendentes: number;
  avg_dias_no_setor: number | null;
  avg_dias_espera: number | null;
  total_em_gargalo: number;
}
export interface RemessaRow {
  remessa: string;
  fabrica: string;
  cod_fabrica: string;
  nome?: string;
  sku?: string;
  cod_ref?: string;
  pares_pendentes: number;
  pares_baixados: number;
  pares_totais: number;
  qtd_skus?: number;
  qtd_produtos?: number;
  setor_atual?: string | null;
  setor_predominante?: string | null;
  setores?: string;
  skus_csv?: string;
  produtos_csv?: string;
  dt_entrega: string | null;
  data_inclusao: string | null;
  is_bottleneck: boolean;
  toc_status: string | null;
  lead_time_dias: number | null;
  status_entrega: string;
  dias_para_entrega: number | null;
}
export interface SemanaEntrega { semana: string; data_inicio: string; pares: number; remessas: number; }
export interface ProducaoDia { dia: string; setor: string; pares: number; }

export interface ProducaoPayload {
  generatedAt: string;
  source: string;
  totals: ProducaoTotals;
  fabricas: Fabrica[];
  setores: Setor[];
  remessasTop: RemessaRow[];
  remessasGargalo: RemessaRow[];
  semanasEntrega: SemanaEntrega[];
  producaoDiaria: ProducaoDia[];
}
export interface RemessasPayload {
  generatedAt: string;
  source: string;
  totals: { remessas: number; paresPendentes: number; paresBaixados: number; paresTotais: number; remessasAtrasadas: number; };
  remessas: RemessaRow[];
}

// ---------------------------------------------------------------------------
// CTE base reaproveitada: rollup por remessa (todas as fábricas, só ativas)
// ---------------------------------------------------------------------------
const REMESSA_ROLLUP_CTE = `
  rem AS (
    SELECT remessa, cod_fabrica, nome_fabrica,
           dt_entrega, dt_inicio_producao AS data_inclusao,
           CAST(quant_total AS FLOAT64) AS pares_totais
    FROM \`${SILVER}.vpcp_remessa\`
    WHERE eh_encerrado = 'F'
  ),
  -- Semi-join em rem (só ativas, ~1.5k remessas) ANTES de agregar: corta a varredura
  -- da vw_baixa_par_saidas (360k) e principalmente da vpcp_baixas_op_setores (7,8M).
  mont AS (
    SELECT remessa,
           SUM(quant) AS baixados,
           COUNT(DISTINCT sku) AS qtd_skus,
           ARRAY_TO_STRING(ARRAY_AGG(DISTINCT sku IGNORE NULLS ORDER BY sku LIMIT 40), ',') AS skus_csv
    FROM \`${SILVER}.vw_baixa_par_saidas\`
    WHERE remessa IN (SELECT remessa FROM rem)
    GROUP BY remessa
  ),
  op AS (
    SELECT remessa,
           COUNT(DISTINCT cod_ref) AS qtd_produtos,
           ANY_VALUE(cod_ref) AS cod_ref,
           ARRAY_TO_STRING(ARRAY_AGG(DISTINCT cod_ref IGNORE NULLS ORDER BY cod_ref LIMIT 40), ',') AS refs_csv
    FROM \`${SILVER}.vpcp_op\`
    WHERE remessa IN (SELECT remessa FROM rem)
    GROUP BY remessa
  ),
  ref2sku AS (
    -- Mapa cod_ref base → SKU canônico, do histórico de montagem.
    -- referencia = 'codref-cor' (ex.: 100.0020-1); n_skus>1 = ref com várias cores (cor indefinida).
    SELECT base_ref, ANY_VALUE(sku) AS any_sku, COUNT(DISTINCT sku) AS n_skus
    FROM (
      SELECT SPLIT(referencia, '-')[OFFSET(0)] AS base_ref, sku
      FROM \`${SILVER}.vw_baixa_par_saidas\`
      WHERE sku IS NOT NULL AND referencia IS NOT NULL
    )
    GROUP BY base_ref
  ),
  cur AS (
    SELECT remessa,
           ARRAY_AGG(STRUCT(nome_setor, cod_setor) ORDER BY dt_baixa DESC, hora_baixa DESC LIMIT 1)[OFFSET(0)] AS ultimo
    FROM \`${SILVER}.vpcp_baixas_op_setores\`
    WHERE remessa IN (SELECT remessa FROM rem)
    GROUP BY remessa
  ),
  base AS (
    SELECT
      rem.remessa, rem.cod_fabrica, rem.nome_fabrica,
      rem.dt_entrega, rem.data_inclusao, rem.pares_totais,
      IFNULL(mont.baixados, 0) AS pares_baixados,
      GREATEST(rem.pares_totais - IFNULL(mont.baixados, 0), 0) AS pares_pendentes,
      mont.qtd_skus, mont.skus_csv,
      op.qtd_produtos, op.cod_ref, op.refs_csv,
      ref2sku.any_sku AS ref_sku, ref2sku.n_skus AS ref_sku_n,
      cur.ultimo.nome_setor AS setor_atual,
      DATE_DIFF(rem.dt_entrega, CURRENT_DATE(), DAY) AS dias_para_entrega,
      DATE_DIFF(CURRENT_DATE(), rem.data_inclusao, DAY) AS lead_time_dias
    FROM rem
    LEFT JOIN mont USING (remessa)
    LEFT JOIN op USING (remessa)
    LEFT JOIN cur USING (remessa)
    LEFT JOIN ref2sku ON ref2sku.base_ref = op.cod_ref
  )`;

// is_bottleneck (heurística transparente, já que o TOC/gargalo do mart não está nas silver):
// remessa atrasada (dt_entrega passada) E ainda com pendência > 0.
const BOTTLENECK_EXPR = `(b.dias_para_entrega < 0 AND b.pares_pendentes > 0)`;

// O client @google-cloud/bigquery devolve DATE como objeto BigQueryDate ({ value: 'YYYY-MM-DD' }),
// não string — então String() vira "[object Object]". Extrai o .value.
function bqDate(v: any): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && 'value' in v) return (v as { value: string }).value;
  return String(v);
}

// ISO week ('%G-W%V') + segunda-feira da semana (igual DATE_TRUNC ... WEEK(MONDAY)), em JS.
function isoWeek(dateStr: string): { semana: string; data_inicio: string } {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dow = d.getUTCDay() || 7; // Mon=1 .. Sun=7
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (dow - 1));
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return {
    semana: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`,
    data_inicio: monday.toISOString().slice(0, 10),
  };
}

// SKU de exibição (Cassia 2026-06-24):
//  1) SKU real da montagem da própria remessa (quando já produziu);
//  2) histórico do cod_ref se ele só teve UMA cor (SKU canônico exato);
//  3) modelo "L###-MODELO-…" se o ref já teve várias cores (cor ainda indefinida);
//  4) cod_ref puro se não há histórico de montagem para o ref.
function displaySku(r: any): string | undefined {
  const own = r.skus_csv ? String(r.skus_csv).split(',')[0] : null;
  if (own) return own;
  const refSku: string | null = r.ref_sku ?? null;
  const n = r.ref_sku_n != null ? Number(r.ref_sku_n) : 0;
  if (refSku && n === 1) return refSku;
  if (refSku && n > 1) {
    const p = String(refSku).split('-');
    return p.length >= 2 ? `${p[0]}-${p[1]}-…` : refSku;
  }
  return r.cod_ref ?? undefined;
}

function mapRemessaRow(r: any): RemessaRow {
  const dias = r.dias_para_entrega == null ? null : Number(r.dias_para_entrega);
  const isBottleneck = dias != null && dias < 0 && Number(r.pares_pendentes) > 0;
  return {
    remessa: r.remessa,
    fabrica: r.nome_fabrica ?? '—',
    cod_fabrica: r.cod_fabrica ?? '',
    sku: displaySku(r),
    cod_ref: r.cod_ref ?? undefined,
    pares_pendentes: Number(r.pares_pendentes ?? 0),
    pares_baixados: Number(r.pares_baixados ?? 0),
    pares_totais: Number(r.pares_totais ?? 0),
    qtd_skus: r.qtd_skus != null ? Number(r.qtd_skus) : undefined,
    qtd_produtos: r.qtd_produtos != null ? Number(r.qtd_produtos) : undefined,
    setor_atual: r.setor_atual ?? null,
    setor_predominante: r.setor_atual ?? null,
    setores: r.refs_csv ?? undefined,
    skus_csv: r.skus_csv ?? undefined,
    produtos_csv: r.refs_csv ?? undefined,
    dt_entrega: bqDate(r.dt_entrega),
    data_inclusao: bqDate(r.data_inclusao),
    is_bottleneck: isBottleneck,
    toc_status: isBottleneck ? 'GARGALO' : null,
    lead_time_dias: r.lead_time_dias != null ? Number(r.lead_time_dias) : null,
    status_entrega: dias == null ? 'sem_data' : dias < 0 ? 'atrasada' : 'no_prazo',
    dias_para_entrega: dias,
  };
}

// ---------------------------------------------------------------------------
// /api/producao  — totais Senda 4 + breakdown todas fábricas + setores + diária
// ---------------------------------------------------------------------------
export async function getProducao(): Promise<ProducaoPayload> {
  const [baseRows, setorRows, diariaRows] = await Promise.all([
    // Fonte única: rollup por remessa (todas as fábricas, só ativas). Totais, fábricas,
    // semanas, risco e TOC saem disto em JS (≤ ~1.5k linhas) — evita re-rodar o CTE pesado 6×.
    runQuery<any>(`
      WITH ${REMESSA_ROLLUP_CTE}
      SELECT * FROM base b
      ORDER BY b.dias_para_entrega ASC`),
    // Setores Senda 4 — lote = remessa cujo setor atual = este setor; pendência = soma das pendências.
    // avg_dias_no_setor = dias desde a última baixa nesse setor (tempo parado). dias_espera não é
    // reconstituível das silver de forma confiável → null.
    runQuery<any>(`
      WITH ${REMESSA_ROLLUP_CTE},
      ap AS (
        SELECT remessa, nome_setor, SAFE_CAST(cod_setor AS INT64) AS seq,
               MAX(dt_baixa) AS ult_baixa
        FROM \`${SILVER}.vpcp_baixas_op_setores\`
        WHERE cod_fabrica = '${SENDA4}'
        GROUP BY remessa, nome_setor, cod_setor
      ),
      -- Remessas ativas sem nenhum apontamento ainda = não iniciadas → ALMOXARIFADO (matéria-prima).
      cur_setor AS (
        SELECT b.remessa, COALESCE(b.setor_atual, 'ALMOXARIFADO') AS setor,
               b.pares_pendentes, b.dias_para_entrega
        FROM base b WHERE b.cod_fabrica = '${SENDA4}'
      )
      SELECT cs.setor AS nome_setor,
             COALESCE(MIN(ap.seq), 1) AS sequencia,
             COUNT(DISTINCT cs.remessa) AS lotes_no_setor,
             SUM(cs.pares_pendentes) AS pares_pendentes,
             ROUND(AVG(DATE_DIFF(CURRENT_DATE(), ap.ult_baixa, DAY)), 1) AS avg_dias_no_setor,
             COUNTIF(cs.dias_para_entrega < 0) AS total_em_gargalo
      FROM cur_setor cs
      LEFT JOIN ap ON ap.remessa = cs.remessa AND ap.nome_setor = cs.setor
      GROUP BY cs.setor
      ORDER BY sequencia`),
    // Produção diária por setor (Senda 4, últimos 60 dias) — apontamento produtivo
    runQuery<any>(`
      SELECT FORMAT_DATE('%Y-%m-%d', dt_baixa) AS dia, nome_setor AS setor, SUM(quant) AS pares
      FROM \`${SILVER}.vpcp_baixas_op_setores\`
      WHERE cod_fabrica = '${SENDA4}'
        AND dt_baixa >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
      GROUP BY dia, setor
      HAVING pares > 0
      ORDER BY dia`),
  ]);

  // Todas as fábricas, já mapeadas (≤ ~1.5k linhas → derivar em JS é trivial).
  const rows = baseRows.map(mapRemessaRow);
  const senda4 = rows.filter((r) => r.cod_fabrica === SENDA4);
  const leadVals = senda4.map((r) => r.lead_time_dias).filter((v): v is number => v != null);
  const futuras = senda4
    .filter((r) => r.dt_entrega && r.dias_para_entrega != null && r.dias_para_entrega >= 0)
    .map((r) => r.dt_entrega as string)
    .sort();

  // Fábricas (todas), ordenadas por pendência
  const fabMap = new Map<string, { f: Fabrica; lead: number[] }>();
  for (const r of rows) {
    let e = fabMap.get(r.fabrica);
    if (!e) {
      e = { f: { nome_fabrica: r.fabrica, remessas: 0, pares_pendentes: 0, pares_baixados: 0, avg_lead_time: null, remessas_em_gargalo: 0 }, lead: [] };
      fabMap.set(r.fabrica, e);
    }
    e.f.remessas += 1;
    e.f.pares_pendentes += r.pares_pendentes;
    e.f.pares_baixados += r.pares_baixados;
    if (r.is_bottleneck) e.f.remessas_em_gargalo += 1;
    if (r.lead_time_dias != null) e.lead.push(r.lead_time_dias);
  }
  const fabricas: Fabrica[] = Array.from(fabMap.values())
    .map(({ f, lead }) => ({
      ...f,
      avg_lead_time: lead.length ? Math.round((lead.reduce((a, b) => a + b, 0) / lead.length) * 10) / 10 : null,
    }))
    .sort((a, b) => b.pares_pendentes - a.pares_pendentes);

  // Próximas 8 semanas (Senda 4, dt_entrega entre hoje e +56d)
  const semMap = new Map<string, SemanaEntrega>();
  for (const r of senda4) {
    if (r.dt_entrega == null || r.dias_para_entrega == null || r.dias_para_entrega < 0 || r.dias_para_entrega >= 56) continue;
    const { semana, data_inicio } = isoWeek(r.dt_entrega);
    let w = semMap.get(semana);
    if (!w) { w = { semana, data_inicio, pares: 0, remessas: 0 }; semMap.set(semana, w); }
    w.pares += r.pares_pendentes;
    w.remessas += 1;
  }
  const semanasEntrega = Array.from(semMap.values()).sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));

  return {
    generatedAt: new Date().toISOString(),
    source: `${SILVER}.vpcp_op + vpcp_baixas_op_setores + vw_baixa_par_saidas (+vpcp_remessa)`,
    totals: {
      paresPendentes: senda4.reduce((s, r) => s + r.pares_pendentes, 0),
      paresBaixados: senda4.reduce((s, r) => s + r.pares_baixados, 0),
      remessasAtivas: senda4.length,
      remessasGargalo: senda4.filter((r) => r.is_bottleneck).length,
      remessasBloqueadas: 0,
      remessasAtrasadas: senda4.filter((r) => r.dias_para_entrega != null && r.dias_para_entrega < 0).length,
      leadTimeMedio: leadVals.length ? Math.round((leadVals.reduce((a, b) => a + b, 0) / leadVals.length) * 10) / 10 : null,
      proximaEntrega: futuras[0] ?? null,
    },
    fabricas,
    setores: setorRows.map((s) => ({
      nome_setor: s.nome_setor ?? '—',
      sequencia: s.sequencia != null ? Number(s.sequencia) : 999,
      lotes_no_setor: Number(s.lotes_no_setor ?? 0),
      pares_pendentes: Number(s.pares_pendentes ?? 0),
      avg_dias_no_setor: s.avg_dias_no_setor != null ? Number(s.avg_dias_no_setor) : null,
      avg_dias_espera: null,
      total_em_gargalo: Number(s.total_em_gargalo ?? 0),
    })),
    remessasTop: senda4
      .filter((r) => r.dias_para_entrega != null && r.dias_para_entrega < 0 && r.pares_pendentes > 50)
      .sort((a, b) => (a.dias_para_entrega ?? 0) - (b.dias_para_entrega ?? 0))
      .slice(0, 200),
    remessasGargalo: senda4
      .filter((r) => r.is_bottleneck)
      .sort((a, b) => b.pares_pendentes - a.pares_pendentes)
      .slice(0, 200),
    semanasEntrega,
    producaoDiaria: diariaRows.map((d) => ({ dia: d.dia, setor: d.setor, pares: Number(d.pares ?? 0) })),
  };
}

// ---------------------------------------------------------------------------
// /api/producao/remessas — todas as fábricas
// ---------------------------------------------------------------------------
export async function getRemessas(): Promise<RemessasPayload> {
  const rows = await runQuery<any>(`
    WITH ${REMESSA_ROLLUP_CTE}
    SELECT * FROM base b
    ORDER BY b.dias_para_entrega ASC`);

  const remessas = rows.map(mapRemessaRow);
  return {
    generatedAt: new Date().toISOString(),
    source: `${SILVER}.vpcp_op + vpcp_baixas_op_setores + vw_baixa_par_saidas (+vpcp_remessa)`,
    totals: {
      remessas: remessas.length,
      paresPendentes: remessas.reduce((s, r) => s + r.pares_pendentes, 0),
      paresBaixados: remessas.reduce((s, r) => s + r.pares_baixados, 0),
      paresTotais: remessas.reduce((s, r) => s + r.pares_totais, 0),
      remessasAtrasadas: remessas.filter((r) => r.dias_para_entrega != null && r.dias_para_entrega < 0).length,
    },
    remessas,
  };
}

// ---------------------------------------------------------------------------
// /api/producao/remessas/[id] — SKUs/produtos de uma remessa
// ---------------------------------------------------------------------------
export async function getRemessaItems(remessa: string): Promise<{ remessa: string; items: any[] }> {
  // vpcp_op dá ref + tamanho + quantidade por OP; junta montagem (vw_baixa_par_saidas) pra sku + baixados.
  const items = await runQuery<any>(`
    WITH op AS (
      SELECT cod_ref, numero AS tamanho, SUM(quantidade) AS pares_totais, ANY_VALUE(cod_op) AS cod_op
      FROM \`${SILVER}.vpcp_op\`
      WHERE remessa = @remessa
      GROUP BY cod_ref, numero
    ),
    mont AS (
      SELECT cod_ref AS ref, ARRAY_AGG(DISTINCT sku IGNORE NULLS LIMIT 1)[SAFE_OFFSET(0)] AS sku,
             SUM(quant) AS baixados
      FROM (
        SELECT referencia AS cod_ref, sku, quant
        FROM \`${SILVER}.vw_baixa_par_saidas\`
        WHERE remessa = @remessa
      )
      GROUP BY ref
    )
    SELECT op.cod_ref, op.tamanho, op.pares_totais, m.sku, IFNULL(m.baixados, 0) AS pares_baixados
    FROM op LEFT JOIN mont m ON m.ref = op.cod_ref
    ORDER BY op.cod_ref, SAFE_CAST(op.tamanho AS FLOAT64)`,
    { remessa });

  return {
    remessa,
    items: items.map((i) => ({
      cod_ref: i.cod_ref,
      sku: i.sku ?? null,
      tamanho: i.tamanho,
      pares_totais: Number(i.pares_totais ?? 0),
      pares_baixados: Number(i.pares_baixados ?? 0),
      pares_pendentes: Math.max(Number(i.pares_totais ?? 0) - Number(i.pares_baixados ?? 0), 0),
    })),
  };
}
