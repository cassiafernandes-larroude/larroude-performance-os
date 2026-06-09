'use client';

import type { CategoryLtv, CustomerJourney, LtvKpiSummary, Market } from '@/lib/ltv-dashboard/queries';
import { formatMoney, formatPercent, formatNumber } from '@/lib/ltv-dashboard/format';

/**
 * Heurísticas para gerar insights automáticos.
 * Não é "machine learning" — é interpretação de KPIs vs benchmarks de fashion DTC.
 * `tempo1to2` vem da Jornada (histórico completo, mesma definição do bloco "Tempo 1ª → 2ª")
 * — garante que TODO o dashboard usa a mesma metodologia.
 */
function buildInsights(
  summary: LtvKpiSummary,
  categories: CategoryLtv[] | null,
  market: Market,
  tempo1to2: number,
) {
  const insights: Array<{ kind: 'good' | 'warn' | 'bad' | 'info'; title: string; body: string }> = [];

  // LTV / CAC ratio
  if (summary.ltvCacRatio > 0) {
    if (summary.ltvCacRatio >= 3) {
      insights.push({
        kind: 'good',
        title: `LTV / CAC saudável (${summary.ltvCacRatio.toFixed(2)}x)`,
        body: `Cada ${formatMoney(summary.cac, market, true)} investido retorna ${formatMoney(
          summary.ltvPredictive,
          market,
          true
        )} ao longo da vida do cliente. Ratio ≥3x indica espaço para escalar aquisição.`,
      });
    } else if (summary.ltvCacRatio >= 2) {
      insights.push({
        kind: 'warn',
        title: `LTV / CAC apertado (${summary.ltvCacRatio.toFixed(2)}x)`,
        body: `Ratio entre 2x e 3x sinaliza margem reduzida. Considere otimizar criativos antes de escalar ou trabalhar o CAC para baixo.`,
      });
    } else {
      insights.push({
        kind: 'bad',
        title: `LTV / CAC abaixo do saudável (${summary.ltvCacRatio.toFixed(2)}x)`,
        body: `Você está gastando mais para adquirir do que recupera. Reduza CAC (corte campanhas com CPA alto) ou suba o LTV (upsell, win-back).`,
      });
    }
  } else {
    insights.push({
      kind: 'info',
      title: 'LTV / CAC indisponível',
      body: 'Spend Meta+Google ainda não foi sincronizado para o período. KPI fica fora até o próximo refresh.',
    });
  }

  // Returning Customer Rate (vs fashion benchmark 25-35%)
  const rr = summary.returningCustomerRate;
  if (rr >= 35) {
    insights.push({
      kind: 'good',
      title: `Returning rate alta (${formatPercent(rr)})`,
      body: `Sua base é leal — acima do benchmark fashion DTC (25-35%). Capture isso: subscriptions, programa de fidelidade, lançamentos exclusivos.`,
    });
  } else if (rr >= 25) {
    insights.push({
      kind: 'good',
      title: `Returning rate saudável (${formatPercent(rr)})`,
      body: `Dentro do benchmark fashion DTC (25-35%). Mantenha cadência de e-mail/CRM para nutrir retenção.`,
    });
  } else if (rr >= 15) {
    insights.push({
      kind: 'warn',
      title: `Returning rate abaixo do benchmark (${formatPercent(rr)})`,
      body: `Cuidado: abaixo de 25% indica problema de retenção. Revisar pós-compra, e-mails de win-back, qualidade percebida.`,
    });
  } else {
    insights.push({
      kind: 'bad',
      title: `Returning rate baixa (${formatPercent(rr)})`,
      body: `Crítico. Clientes não voltam. Auditar: experiência pós-compra, qualidade do produto, percepção de marca.`,
    });
  }

  // Purchase Frequency
  if (summary.purchaseFrequency >= 1.5) {
    insights.push({
      kind: 'good',
      title: `Frequência de compra forte (${summary.purchaseFrequency.toFixed(2)})`,
      body: `Clientes voltam mais de 1.5x em média — ótimo para um vertical fashion. Considere segmentar high-frequency buyers para early-access.`,
    });
  } else if (summary.purchaseFrequency < 1.15) {
    insights.push({
      kind: 'warn',
      title: `Frequência baixa (${summary.purchaseFrequency.toFixed(2)})`,
      body: `Maioria dos clientes compra apenas uma vez no período. Foco em segunda compra: e-mail series 30/60/90 dias, ofertas de cross-sell.`,
    });
  }

  // Tempo 1ª → 2ª compra (lifetime — IDÊNTICO ao bloco Jornada)
  if (tempo1to2 > 0) {
    if (tempo1to2 <= 30) {
      insights.push({
        kind: 'good',
        title: `Tempo 1ª → 2ª compra curto (${tempo1to2}d)`,
        body: `Clientes fazem a 2ª compra em menos de 30 dias na mediana. Ativar flows de cross-sell em ~${Math.max(7, Math.round(tempo1to2 * 0.6))} dias da 1ª compra captura essa janela.`,
      });
    } else if (tempo1to2 >= 60) {
      insights.push({
        kind: 'info',
        title: `Tempo 1ª → 2ª compra longo (${tempo1to2}d)`,
        body: `Mediana entre 1ª e 2ª compra acima de 60 dias. Normal em fashion premium. Garanta flow de nurture (E-mail D+30, D+60) + win-back ativando em ~${Math.round(tempo1to2 * 1.3)} dias.`,
      });
    } else {
      insights.push({
        kind: 'good',
        title: `Tempo 1ª → 2ª compra moderado (${tempo1to2}d)`,
        body: `Mediana entre 1ª e 2ª compra de ${tempo1to2} dias. Flow de cross-sell deve disparar em ~${Math.round(tempo1to2 * 0.5)}-${Math.round(tempo1to2 * 0.7)} dias da 1ª compra.`,
      });
    }
  }

  // Top category insight
  if (categories && categories.length > 0) {
    const topByLtv = [...categories]
      .filter((c) => c.customers >= 20)
      .sort((a, b) => b.customerLtvAvg - a.customerLtvAvg)[0];
    const topByVolume = [...categories].sort((a, b) => b.units - a.units)[0];

    if (topByVolume) {
      insights.push({
        kind: 'info',
        title: `Categoria líder em volume: ${topByVolume.categoryName}`,
        body: `${formatNumber(topByVolume.units, market)} unidades vendidas, ${formatNumber(
          topByVolume.customers,
          market
        )} clientes únicos. ${
          topByLtv && topByLtv.categoryCode !== topByVolume.categoryCode
            ? `Mas quem traz clientes de maior LTV é "${topByLtv.categoryName}" (${formatMoney(
                topByLtv.customerLtvAvg,
                market,
                true
              )} médio). Considere investir mais em ${topByLtv.categoryName} no funil de aquisição.`
            : 'Mesma categoria lidera volume E LTV — concentre esforço de marketing aqui.'
        }`,
      });
    }
  }

  // CAC recommendation
  if (summary.cac > 0 && summary.ltvPredictive > 0) {
    const sustainableCac = summary.ltvPredictive / 3;
    if (sustainableCac > summary.cac * 1.2) {
      insights.push({
        kind: 'good',
        title: `Espaço para subir CAC até ${formatMoney(sustainableCac, market, true)}`,
        body: `Mantendo ratio LTV/CAC ≥3x, você pode aumentar o CAC atual (${formatMoney(
          summary.cac,
          market,
          true
        )}) em até ${(((sustainableCac - summary.cac) / summary.cac) * 100).toFixed(0)}% e ainda continuar saudável. Considere subir bid em campanhas top-performers.`,
      });
    } else if (sustainableCac < summary.cac * 0.85) {
      insights.push({
        kind: 'warn',
        title: `CAC acima do sustentável (${formatMoney(sustainableCac, market, true)})`,
        body: `Para manter LTV/CAC ≥3x, o CAC ideal seria ${formatMoney(
          sustainableCac,
          market,
          true
        )}. Atual está ${(((summary.cac - sustainableCac) / sustainableCac) * 100).toFixed(0)}% acima. Reduza budget de campanhas com CPA alto.`,
      });
    } else {
      insights.push({
        kind: 'info',
        title: `CAC estável próximo ao teto saudável`,
        body: `Atual ${formatMoney(summary.cac, market, true)} ≈ teto recomendado ${formatMoney(
          sustainableCac,
          market,
          true
        )}. Não escalar agressivamente sem antes melhorar conversão/retenção.`,
      });
    }
  }

  return insights;
}

function colorFor(kind: 'good' | 'warn' | 'bad' | 'info'): { bg: string; border: string; ink: string; icon: string } {
  switch (kind) {
    case 'good':
      return { bg: '#ecf6f0', border: '#2c7a5b', ink: '#1d5b41', icon: '✓' };
    case 'warn':
      return { bg: '#fff7e0', border: '#c0822a', ink: '#8a5b18', icon: '!' };
    case 'bad':
      return { bg: '#fff5f5', border: '#b3382f', ink: '#7a221c', icon: '✗' };
    case 'info':
      return { bg: '#f5f3ee', border: '#8a8a8a', ink: '#4a4a4a', icon: 'i' };
  }
}

export default function AnalysisBlock({
  summary,
  categories,
  market,
  journey,
}: {
  summary: LtvKpiSummary | undefined;
  categories: CategoryLtv[] | null;
  market: Market;
  journey?: CustomerJourney | null;
}) {
  if (!summary) {
    return null;
  }
  // tempo 1→2 da Jornada (lifetime, mesma metodologia em todo dashboard)
  const tempo1to2 = journey?.medianDays1to2 ?? 0;
  const insights = buildInsights(summary, categories, market, tempo1to2);
  if (insights.length === 0) return null;

  return (
    <div className="card-section">
      <div className="section-head">
        <span
          className="section-badge"
          style={{ background: '#1a1a1a', color: '#fff' }}
        >
          🧠 ANÁLISE
        </span>
        <h3>Análise & Recomendações</h3>
        <span className="section-meta">
          Insights automáticos baseados em benchmarks fashion DTC · {insights.length} pontos
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14,
          alignItems: 'stretch',
        }}
      >
        {insights.map((ins, i) => {
          const c = colorFor(ins.kind);
          return (
            <div
              key={i}
              style={{
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: 10,
                padding: '14px 16px',
                minHeight: 124,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: c.ink,
                  marginBottom: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    background: c.border,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {c.icon}
                </span>
                {ins.title}
              </div>
              <div style={{ fontSize: 12.5, color: c.ink, lineHeight: 1.5 }}>{ins.body}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
