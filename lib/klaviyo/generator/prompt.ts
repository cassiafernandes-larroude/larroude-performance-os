// Cassia 2026-06-21: system prompt + response schema do gerador de campanhas Klaviyo (Gemini/Vertex AI).
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

export function systemPrompt(market: 'US' | 'BR'): string {
  const lang =
    market === 'BR'
      ? 'MERCADO = BR → TODO o conteúdo voltado ao cliente (os 3 assuntos, os preview texts e TODA a copy do template) DEVE ser em PORTUGUÊS DO BRASIL. NÃO use inglês.'
      : 'MARKET = US → ALL customer-facing content (the 3 subjects, the preview texts and ALL the template copy) MUST be in ENGLISH (US). Do NOT use Portuguese.';
  return `Você é o(a) lead de CRM/e-mail da Larroudé, marca de calçados premium (US em USD, BR em BRL).
Sua tarefa: gerar UMA campanha de e-mail pronta para virar rascunho no Klaviyo, baseada no tipo, objetivo e criativos, CALIBRADA pela performance histórica real da conta E NA VOZ DA MARCA.

⚠️ REGRA DE IDIOMA (OBRIGATÓRIA, não negociável): ${lang}

${LARROUDE_VOICE}

ESTUDE os assuntos vencedores e o BASE_HTML fornecidos e EXTRAIA o padrão de voz REAL da conta (vocabulário, ritmo, estrutura de assunto, CTA) — replique esse padrão, não invente um novo.

Princípios:
- Imite os assuntos e o posicionamento das campanhas REAIS do MESMO tipo com maior open rate e RPR (bloco "Campanhas reais do tipo"). Mire o benchmark do tipo.
- Segmentação: se um PLANO DE META for fornecido, USE exatamente as audiências do plano (não escolha outra). Caso contrário, escolha 1 audiência SOMENTE entre as listadas (id exato), com bom RPR e coerente com o tipo/objetivo. Nunca invente segmento.
- Sugira o melhor dia/horário de envio com base em "Melhores dias".
- Gere 3 opções de assunto distintas (curto/direto, com curiosidade, com oferta/benefício), cada uma com preview text e justificativa ancorada nos dados.
- nameSlug: uma descrição curta em PascalCase SEM espaços, SEM data e SEM prefixo de tipo (ex.: "WinterBootsEarlyAccess"). O sistema monta o nome final como AAAAMMDD_TIPO_nameSlug.
- TEMPLATE (regra principal): quando BASE_HTML for fornecido (é o último e-mail enviado deste mesmo tipo), você deve DUPLICÁ-LO. Preserve EXATAMENTE o layout, a estrutura, os estilos/CSS, as seções, larguras, fontes e o rodapé. Altere SOMENTE:
   (a) o src das imagens principais (hero/produto) para as URLs dos criativos fornecidos — mantendo width/height/atributos originais;
   (b) a COPY visível (título, subtítulo, parágrafos, label do botão) conforme a nova copy/objetivo/oferta;
   (c) os href dos links e CTAs para o link de destino informado.
   NÃO mude mais nada (não reescreva o HTML, não troque cores, não remova seções). Retorne o HTML completo modificado em "html".
   Se BASE_HTML NÃO for fornecido, aí sim crie um e-mail responsivo premium do zero (tabular, máx. 600px, estética minimalista, título serifado). Em ambos os casos mantenha o placeholder de descadastro EXATAMENTE como {% unsubscribe %} no rodapé.
- Não invente preços, cupons ou claims não fornecidos. Use só a oferta informada (se houver).
- Seja específico da Larroudé, sem texto genérico.

Responda SOMENTE com um objeto JSON válido seguindo o schema fornecido (campos: subjects, segment, recommendedSendDay, html, nameSlug, rationale). Sem texto fora do JSON.`;
}

export function userPrompt(
  input: GeneratorInput,
  ctx: PerformanceContext,
  goalPlanText?: string
): string {
  const creatives = input.creatives
    .map((c, i) => `  ${i + 1}. url=${c.imageUrl}${c.altText ? ` | alt=${c.altText}` : ''}${c.caption ? ` | legenda=${c.caption}` : ''}`)
    .join('\n');

  const fmtCamp = (c: PerformanceContext['topCampaigns'][number]) =>
    `  • [${c.type}] "${c.subject || c.name}" — OR ${c.openRate}% · CTR ${c.clickRate}% · RPR ${c.rpr} · ${c.recipients} dest.`;

  return `TIPO DA CAMPANHA: ${TYPE_LABEL[input.type] || input.type}

OBJETIVO / BRIEFING
- Descrição: ${input.objective}
${input.productName ? `- Produto/coleção: ${input.productName}\n` : ''}${input.offer ? `- Oferta: ${input.offer}\n` : ''}${input.revenueGoal ? `- Meta de faturamento com este e-mail: ${ctx.currency} ${input.revenueGoal.toLocaleString()}\n` : ''}- Link de destino (CTA): ${input.destinationUrl}
${goalPlanText ? `\n${goalPlanText}\n` : ''}

CRIATIVOS (use estas imagens no template):
${creatives || '  (nenhum criativo fornecido — gere layout só com texto + CTA)'}

>>> CAMPANHAS REAIS DO TIPO ${ctx.focusType} (${ctx.focusTypeLabel}) — IMITE estas vencedoras:
${ctx.focusTypeCampaigns.length ? ctx.focusTypeCampaigns.map(fmtCamp).join('\n') : '  (sem histórico desse tipo na janela; use o top geral abaixo como referência)'}

CONTEXTO GERAL (${ctx.market}, janela ${ctx.period}, moeda ${ctx.currency}):
- Média da conta: open rate ${ctx.accountAvgOpenRate}% · click rate ${ctx.accountAvgClickRate}%
- Top campanhas (geral):
${ctx.topCampaigns.map(fmtCamp).join('\n')}
- Melhores dias de envio (RPR desc):
${ctx.bestDays.slice(0, 4).map((d) => `  • ${d.dayName}: OR ${d.avgOpenRate}% · RPR ${d.avgRpr} (${d.campaigns} camp.)`).join('\n')}
- Benchmarks por tipo:
${ctx.benchmarks.map((b) => `  • ${b.type}: OR ${b.avgOpenRate}% · CTR ${b.avgClickRate}% · RPR ${b.avgRpr} (${b.campaigns} camp.)`).join('\n')}

IMPACTADAS NOS ÚLTIMOS ${ctx.recentlyMailed.days} DIAS (evite escolher estas — risco de overlap/fadiga; o sistema as exclui automaticamente):
${ctx.recentlyMailed.audiences.length ? ctx.recentlyMailed.audiences.map((a) => `  • ${a.name}`).join('\n') : '  (nenhuma)'}

AUDIÊNCIAS DISPONÍVEIS (escolha 1 pelo id, de preferência NÃO impactada recentemente):
${ctx.audiences
  .map(
    (a) =>
      `  • id=${a.id} | ${a.name} (${a.kind})${
        a.recipients ? ` — hist: ${a.recipients} dest. · OR ${a.openRate}% · RPR ${a.rpr}` : ''
      }`
  )
  .join('\n')}

${
  ctx.baseTemplate
    ? `BASE_HTML — DUPLIQUE este e-mail (último enviado do tipo ${ctx.focusType}: "${ctx.baseTemplate.campaignName}", ${ctx.baseTemplate.sendDate}). Troque SOMENTE imagem(ns), copy e links conforme as regras:\n<<<BASE_HTML\n${ctx.baseTemplate.html}\nBASE_HTML>>>`
    : 'BASE_HTML: (não há e-mail anterior desse tipo — crie o template do zero conforme as regras).'
}

Gere a campanha agora, retornando o JSON no schema.`;
}

// Schema de saída estruturada para o Gemini (Vertex AI). Tipos em UPPERCASE (formato do Vertex).
export const CAMPAIGN_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    subjects: {
      type: 'ARRAY',
      description: '3 opções de assunto',
      items: {
        type: 'OBJECT',
        properties: {
          subject: { type: 'STRING' },
          previewText: { type: 'STRING' },
          rationale: { type: 'STRING', description: 'Por que esse assunto, ancorado no histórico do tipo' },
        },
        required: ['subject', 'previewText', 'rationale'],
      },
    },
    segment: {
      type: 'OBJECT',
      properties: {
        id: { type: 'STRING', description: 'id exato de uma audiência listada' },
        name: { type: 'STRING' },
        why: { type: 'STRING' },
        estReach: { type: 'NUMBER', description: 'alcance estimado (se conhecido pelo histórico)' },
      },
      required: ['id', 'name', 'why'],
    },
    recommendedSendDay: { type: 'STRING', description: 'Ex.: "Quinta-feira, ~10h"' },
    html: { type: 'STRING', description: 'HTML completo do e-mail responsivo, com <html> e <body> e {% unsubscribe %}' },
    nameSlug: { type: 'STRING', description: 'Descrição curta em PascalCase, sem espaços/data/prefixo (ex.: WinterBootsEarlyAccess)' },
    rationale: { type: 'STRING', description: 'Resumo estratégico da decisão' },
  },
  required: ['subjects', 'segment', 'recommendedSendDay', 'html', 'nameSlug', 'rationale'],
};
