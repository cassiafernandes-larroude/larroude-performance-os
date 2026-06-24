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
  mont AS (
    SELECT remessa,
           SUM(quant) AS baixados,
           COUNT(DISTINCT sku) AS qtd_skus,
           ARRAY_TO_STRING(ARRAY_AGG(DISTINCT sku IGNORE NULLS ORDER BY sku LIMIT 40), ',') AS skus_csv
    FROM \`${SILVER}.vw_baixa_par_saidas\`
    GROUP BY remessa
  ),
  op AS (
    SELECT remessa,
           COUNT(DISTINCT cod_ref) AS qtd_produtos,
           ANY_VALUE(cod_ref) AS cod_ref,
           ARRAY_TO_STRING(ARRAY_AGG(DISTINCT cod_ref IGNORE NULLS ORDER BY cod_ref LIMIT 40), ',') AS refs_csv
    FROM \`${SILVER}.vpcp_op\`
    GROUP BY remessa
  ),
  cur AS (
    SELECT remessa,
           ARRAY_AGG(STRUCT(nome_setor, cod_setor) ORDER BY dt_baixa DESC, hora_baixa DESC LIMIT 1)[OFFSET(0)] AS ultimo
    FROM \`${SILVER}.vpcp_baixas_op_setores\`
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
      cur.ultimo.nome_setor AS setor_atual,
      DATE_DIFF(rem.dt_entrega, CURRENT_DATE(), DAY) AS dias_para_entrega,
      DATE_DIFF(CURRENT_DATE(), rem.data_inclusao, DAY) AS lead_time_dias
    FROM rem
    LEFT JOIN mont USING (remessa)
    LEFT JOIN op USING (remessa)
    LEFT JOIN cur USING (remessa)
  )`;

// is_bottleneck (heurística transparente, já que o TOC/gargalo do mart não está nas silver):
// remessa atrasada (dt_entrega passada) E ainda com pendência > 0.
const BOTTLENECK_EXPR = `(b.dias_para_entrega < 0 AND b.pares_pendentes > 0)`;

function mapRemessaRow(r: any): RemessaRow {
  const dias = r.dias_para_entrega == null ? null : Number(r.dias_para_entrega);
  const isBottleneck = dias != null && dias < 0 && Number(r.pares_pendentes) > 0;
  return {
    remessa: r.remessa,
    fabrica: r.nome_fabrica ?? '—',
    cod_fabrica: r.cod_fabrica ?? '',
    sku: r.skus_csv ? String(r.skus_csv).split(',')[0] : undefined,
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
    dt_entrega: r.dt_entrega ? String(r.dt_entrega) : null,
    data_inclusao: r.data_inclusao ? String(r.data_inclusao) : null,
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
  const [fabricaRows, totalRow, setorRows, semanaRows, diariaRows, topRows, gargaloRows] = await Promise.all([
    // Fábricas (todas)
    runQuery<any>(`
      WITH ${REMESSA_ROLLUP_CTE}
      SELECT b.nome_fabrica,
             COUNT(*) AS remessas,
             SUM(b.pares_pendentes) AS pares_pendentes,
             SUM(b.pares_baixados) AS pares_baixados,
             ROUND(AVG(b.lead_time_dias), 1) AS avg_lead_time,
             COUNTIF(${BOTTLENECK_EXPR}) AS remessas_em_gargalo
      FROM base b
      GROUP BY b.nome_fabrica
      ORDER BY pares_pendentes DESC`),
    // Totais Senda 4
    runQuery<any>(`
      WITH ${REMESSA_ROLLUP_CTE}
      SELECT
        SUM(b.pares_pendentes) AS pares_pendentes,
        SUM(b.pares_baixados) AS pares_baixados,
        COUNT(*) AS remessas_ativas,
        COUNTIF(${BOTTLENECK_EXPR}) AS remessas_gargalo,
        COUNTIF(b.dias_para_entrega < 0) AS remessas_atrasadas,
        ROUND(AVG(b.lead_time_dias), 1) AS lead_time_medio,
        MIN(IF(b.dias_para_entrega >= 0, b.dt_entrega, NULL)) AS proxima_entrega
      FROM base b
      WHERE b.cod_fabrica = '${SENDA4}'`),
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
    // Próximas semanas (Senda 4, dt_entrega futura — próximas 8 semanas)
    runQuery<any>(`
      WITH ${REMESSA_ROLLUP_CTE}
      SELECT FORMAT_DATE('%G-W%V', b.dt_entrega) AS semana,
             DATE_TRUNC(b.dt_entrega, WEEK(MONDAY)) AS data_inicio,
             SUM(b.pares_pendentes) AS pares,
             COUNT(*) AS remessas
      FROM base b
      WHERE b.cod_fabrica = '${SENDA4}'
        AND b.dt_entrega >= CURRENT_DATE()
        AND b.dt_entrega < DATE_ADD(CURRENT_DATE(), INTERVAL 56 DAY)
      GROUP BY semana, data_inicio
      ORDER BY data_inicio`),
    // Produção diária por setor (Senda 4, últimos 60 dias) — apontamento produtivo
    runQuery<any>(`
      SELECT FORMAT_DATE('%Y-%m-%d', dt_baixa) AS dia, nome_setor AS setor, SUM(quant) AS pares
      FROM \`${SILVER}.vpcp_baixas_op_setores\`
      WHERE cod_fabrica = '${SENDA4}'
        AND dt_baixa >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
      GROUP BY dia, setor
      HAVING pares > 0
      ORDER BY dia`),
    // Risco crítico: Senda 4, atrasadas com pendente > 50, mais atrasadas primeiro
    runQuery<any>(`
      WITH ${REMESSA_ROLLUP_CTE}
      SELECT * FROM base b
      WHERE b.cod_fabrica = '${SENDA4}' AND b.dias_para_entrega < 0 AND b.pares_pendentes > 50
      ORDER BY b.dias_para_entrega ASC
      LIMIT 200`),
    // TOC / gargalo: Senda 4, bottleneck heurístico, por volume
    runQuery<any>(`
      WITH ${REMESSA_ROLLUP_CTE}
      SELECT * FROM base b
      WHERE b.cod_fabrica = '${SENDA4}' AND ${BOTTLENECK_EXPR}
      ORDER BY b.pares_pendentes DESC
      LIMIT 200`),
  ]);

  const t = totalRow[0] ?? {};
  return {
    generatedAt: new Date().toISOString(),
    source: `${SILVER}.vpcp_op + vpcp_baixas_op_setores + vw_baixa_par_saidas (+vpcp_remessa)`,
    totals: {
      paresPendentes: Number(t.pares_pendentes ?? 0),
      paresBaixados: Number(t.pares_baixados ?? 0),
      remessasAtivas: Number(t.remessas_ativas ?? 0),
      remessasGargalo: Number(t.remessas_gargalo ?? 0),
      remessasBloqueadas: 0,
      remessasAtrasadas: Number(t.remessas_atrasadas ?? 0),
      leadTimeMedio: t.lead_time_medio != null ? Number(t.lead_time_medio) : null,
      proximaEntrega: t.proxima_entrega ? String(t.proxima_entrega) : null,
    },
    fabricas: fabricaRows.map((f) => ({
      nome_fabrica: f.nome_fabrica ?? '—',
      remessas: Number(f.remessas ?? 0),
      pares_pendentes: Number(f.pares_pendentes ?? 0),
      pares_baixados: Number(f.pares_baixados ?? 0),
      avg_lead_time: f.avg_lead_time != null ? Number(f.avg_lead_time) : null,
      remessas_em_gargalo: Number(f.remessas_em_gargalo ?? 0),
    })),
    setores: setorRows.map((s) => ({
      nome_setor: s.nome_setor ?? '—',
      sequencia: s.sequencia != null ? Number(s.sequencia) : 999,
      lotes_no_setor: Number(s.lotes_no_setor ?? 0),
      pares_pendentes: Number(s.pares_pendentes ?? 0),
      avg_dias_no_setor: s.avg_dias_no_setor != null ? Number(s.avg_dias_no_setor) : null,
      avg_dias_espera: null,
      total_em_gargalo: Number(s.total_em_gargalo ?? 0),
    })),
    remessasTop: topRows.map(mapRemessaRow),
    remessasGargalo: gargaloRows.map(mapRemessaRow),
    semanasEntrega: semanaRows.map((w) => ({
      semana: w.semana,
      data_inicio: w.data_inicio ? String(w.data_inicio) : '',
      pares: Number(w.pares ?? 0),
      remessas: Number(w.remessas ?? 0),
    })),
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
