// Cassia 2026-06-21: prompts do gerador. Dividido em 2 etapas p/ velocidade:
//  1) COPY (assuntos + segmentação) — rápido, sem HTML.
//  2) TEMPLATE (HTML do e-mail) — etapa separada.
import { LARROUDE_VOICE } from './brand-voice';
import type { GeneratorInput, PerformanceContext } from '@/types/klaviyo/generator';

const TYPE_LABEL: Record<string, string> = {
  FULLPRICE: 'FULLPRICE — Full Price (new arrivals, drops, back in stock, editorial)',
  MARKDOWN: 'MARKDOWN — Markdown / Sale (descontos, % off, liquidação)',
  PREORDER: 'PREORDER — Pre-Order',
  FLASH: 'FLASH — urgência (last chance, 24h, today only)',
  VIP: 'VIP — base VIP / clientes fiéis',
  OTHER: 'OUTROS — comunicados, operacional, etc.',
};

function langRule(market: 'US' | 'BR'): string {
  return market === 'BR'
    ? 'MERCADO = BR → TODO o conteúdo voltado ao cliente (assuntos, preview e copy) DEVE ser em PORTUGUÊS DO BRASIL. NÃO use inglês.'
    : 'MARKET = US → ALL customer-facing content (subjects, preview, copy) MUST be in ENGLISH (US). Do NOT use Portuguese.';
}

const fmtCamp = (c: PerformanceContext['topCampaigns'][number]) =>
  `  • [${c.type}] "${c.subject || c.name}" — OR ${c.openRate}% · CTR ${c.clickRate}% · RPR ${c.rpr} · ${c.recipients} dest.`;

// ===================== ETAPA 1: COPY (assuntos + segmentação) =====================
export function systemPrompt(market: 'US' | 'BR'): string {
  return `Você é o(a) lead de CRM/e-mail da Larroudé, marca de calçados premium (US em USD, BR em BRL).
Tarefa: gerar ASSUNTOS e a SEGMENTAÇÃO de uma campanha, calibrados pela performance histórica e pela VOZ DA MARCA. (O HTML do e-mail é gerado em outra etapa.)

⚠️ REGRA DE IDIOMA (OBRIGATÓRIA): ${langRule(market)}

${LARROUDE_VOICE}

ESTUDE os assuntos vencedores fornecidos e replique o padrão de voz REAL da conta.

Princípios:
- Imite os assuntos e o posicionamento das campanhas REAIS do MESMO tipo com maior open rate e RPR. Mire o benchmark do tipo.
- Segmentação: se um PLANO DE META for fornecido, USE exatamente as audiências do plano. Caso contrário, escolha 1 audiência SOMENTE entre as listadas (id exato), com bom RPR e coerente com o tipo/objetivo. Nunca invente segmento.
- Sugira o melhor dia/horário de envio com base em "Melhores dias".
- 3 assuntos distintos (curto/direto, curiosidade, oferta/benefício), cada um com preview text e justificativa ancorada nos dados.
- nameSlug: descrição curta em PascalCase SEM espaços/data/prefixo (ex.: "VeronaNewArrival").
- Não invente preços, cupons ou claims não fornecidos.

Responda SOMENTE com JSON do schema (subjects, segment, recommendedSendDay, nameSlug, rationale). Sem texto fora do JSON.`;
}

export const CAMPAIGN_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    subjects: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          subject: { type: 'STRING' },
          previewText: { type: 'STRING' },
          rationale: { type: 'STRING' },
        },
        required: ['subject', 'previewText', 'rationale'],
      },
    },
    segment: {
      type: 'OBJECT',
      properties: {
        id: { type: 'STRING' },
        name: { type: 'STRING' },
        why: { type: 'STRING' },
        estReach: { type: 'NUMBER' },
      },
      required: ['id', 'name', 'why'],
    },
    recommendedSendDay: { type: 'STRING' },
    nameSlug: { type: 'STRING' },
    rationale: { type: 'STRING' },
  },
  required: ['subjects', 'segment', 'recommendedSendDay', 'nameSlug', 'rationale'],
};

export function userPrompt(input: GeneratorInput, ctx: PerformanceContext, goalPlanText?: string): string {
  return `TIPO DA CAMPANHA: ${TYPE_LABEL[input.type] || input.type}

OBJETIVO / BRIEFING
- Descrição: ${input.objective}
${input.productName ? `- Produto/coleção: ${input.productName}\n` : ''}${input.offer ? `- Oferta: ${input.offer}\n` : ''}${input.revenueGoal ? `- Meta de faturamento: ${ctx.currency} ${input.revenueGoal.toLocaleString()}\n` : ''}- Link de destino (CTA): ${input.destinationUrl}
${goalPlanText ? `\n${goalPlanText}\n` : ''}
>>> CAMPANHAS REAIS DO TIPO ${ctx.focusType} (${ctx.focusTypeLabel}) — IMITE estas vencedoras:
${ctx.focusTypeCampaigns.length ? ctx.focusTypeCampaigns.map(fmtCamp).join('\n') : '  (sem histórico desse tipo; use o top geral)'}

CONTEXTO GERAL (${ctx.market}, ${ctx.period}, ${ctx.currency}):
- Média da conta: OR ${ctx.accountAvgOpenRate}% · CTR ${ctx.accountAvgClickRate}%
- Top campanhas:
${ctx.topCampaigns.map(fmtCamp).join('\n')}
- Melhores dias (RPR desc): ${ctx.bestDays.slice(0, 4).map((d) => `${d.dayName} (OR ${d.avgOpenRate}% · RPR ${d.avgRpr})`).join(' · ')}
- Benchmarks: ${ctx.benchmarks.map((b) => `${b.type} OR ${b.avgOpenRate}%/RPR ${b.avgRpr}`).join(' · ')}

IMPACTADAS NOS ÚLTIMOS ${ctx.recentlyMailed.days} DIAS (evite escolher — overlap/fadiga):
${ctx.recentlyMailed.audiences.length ? ctx.recentlyMailed.audiences.map((a) => `  • ${a.name}`).join('\n') : '  (nenhuma)'}

AUDIÊNCIAS DISPONÍVEIS (escolha 1 pelo id, de preferência não impactada recentemente):
${ctx.audiences.map((a) => `  • id=${a.id} | ${a.name} (${a.kind})${a.recipients ? ` — ${a.recipients} dest. · OR ${a.openRate}% · RPR ${a.rpr}` : ''}`).join('\n')}

Gere os assuntos e a segmentação (JSON do schema).`;
}

// ===================== ETAPA 2: TEMPLATE (HTML) =====================
export function systemPromptTemplate(market: 'US' | 'BR'): string {
  return `Você é o(a) lead de CRM/e-mail da Larroudé. Gere o HTML de UM e-mail responsivo.

⚠️ REGRA DE IDIOMA (OBRIGATÓRIA): ${langRule(market)}

${LARROUDE_VOICE}

TEMPLATE (regra principal): se BASE_HTML for fornecido (último e-mail do mesmo tipo), DUPLIQUE-O. Preserve EXATAMENTE layout, estrutura, estilos/CSS, seções, larguras, fontes e rodapé. Altere SOMENTE:
 (a) o src das imagens principais (hero/produto) para as URLs dos criativos — mantendo width/height;
 (b) a copy visível (título, subtítulo, parágrafos, label do botão) conforme objetivo/oferta;
 (c) os href dos links e CTAs para o link de destino.
NÃO mude mais nada. Se NÃO houver BASE_HTML, crie um e-mail premium do zero (tabular, máx. 600px, minimalista, título serifado). Sempre mantenha {% unsubscribe %} no rodapé. Não invente preços/cupons não fornecidos.

Responda SOMENTE com JSON { "html": "<html completo>" }. Sem texto fora do JSON.`;
}

export function userPromptTemplate(input: GeneratorInput, ctx: PerformanceContext): string {
  const creatives = input.creatives
    .map((c, i) => `  ${i + 1}. url=${c.imageUrl}${c.altText ? ` | alt=${c.altText}` : ''}${c.caption ? ` | legenda=${c.caption}` : ''}`)
    .join('\n');
  return `TIPO: ${TYPE_LABEL[input.type] || input.type}
OBJETIVO: ${input.objective}
${input.productName ? `Produto/coleção: ${input.productName}\n` : ''}${input.offer ? `Oferta: ${input.offer}\n` : ''}Link de destino (CTA): ${input.destinationUrl}

CRIATIVOS (use estas imagens):
${creatives || '  (nenhum — gere layout só com texto + CTA)'}

${
  ctx.baseTemplate
    ? `BASE_HTML — DUPLIQUE (último ${ctx.focusType} enviado: "${ctx.baseTemplate.campaignName}"). Troque só imagem/copy/links:\n<<<BASE_HTML\n${ctx.baseTemplate.html}\nBASE_HTML>>>`
    : 'BASE_HTML: (sem e-mail anterior do tipo — crie do zero).'
}

Gere o HTML (JSON { "html": ... }).`;
}

export const TEMPLATE_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    html: { type: 'STRING', description: 'HTML completo do e-mail, com <html>/<body> e {% unsubscribe %}' },
  },
  required: ['html'],
};
