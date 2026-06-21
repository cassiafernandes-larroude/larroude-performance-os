// Cassia 2026-06-21: chama o Claude com tool forçada para gerar a campanha estruturada.
import { getAnthropic, MODEL } from '@/lib/anthropic/client';
import { CAMPAIGN_TYPE_CODE } from '@/lib/klaviyo/classify';
import { buildPerformanceContext } from './context';
import { planSegmentationForGoal, computeExclusions } from './goal';
import { systemPrompt, userPrompt, EMIT_CAMPAIGN_TOOL } from './prompt';
import type {
  GeneratorInput,
  GeneratedCampaign,
  PerformanceContext,
  SubjectOption,
  SegmentRec,
  GoalPlan,
} from '@/types/klaviyo/generator';

type RawTool = {
  subjects: SubjectOption[];
  segment?: { id: string; name: string; why?: string; estReach?: number };
  recommendedSendDay: string;
  html: string;
  nameSlug: string;
  rationale: string;
};

function todayYYYYMMDD(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function sanitizeSlug(slug: string): string {
  return (slug || 'Campanha').replace(/[^a-zA-Z0-9]/g, '').slice(0, 40) || 'Campanha';
}

export async function generateCampaign(
  input: GeneratorInput
): Promise<{ campaign: GeneratedCampaign; context: PerformanceContext }> {
  const client = getAnthropic();
  if (!client) throw new Error('ANTHROPIC_API_KEY não configurada.');

  // Janela ampla (12M) para análise completa do histórico, não só campanhas recentes.
  const context = await buildPerformanceContext(input.market, input.type, input.period || '12M');

  // Plano de segmentação pela meta de faturamento (determinístico, em código).
  let goalPlan: GoalPlan | null = null;
  let goalSegments: SegmentRec[] | null = null;
  let goalExcluded: SegmentRec[] | null = null;
  let goalPlanText: string | undefined;
  if (input.revenueGoal && input.revenueGoal > 0) {
    const { segments, excluded, plan } = planSegmentationForGoal(
      context.audiences,
      input.revenueGoal,
      context.currency,
      context.recentlyMailed.audiences
    );
    goalPlan = plan;
    goalSegments = segments;
    goalExcluded = excluded;
    goalPlanText =
      `PLANO DE META (use EXATAMENTE estas audiências como segmentação):\n` +
      segments.map((s) => `  • id=${s.id} | ${s.name} — ${s.why}`).join('\n') +
      (excluded.length ? `\nExclusões (impactadas nos últimos ${context.recentlyMailed.days} dias): ${excluded.map((e) => e.name).join(', ')}` : '') +
      `\nProjeção: ${plan.currency} ${plan.projectedRevenue.toLocaleString()} de meta ${plan.currency} ${plan.goal.toLocaleString()} → ` +
      (plan.achievable ? 'meta atingível.' : `faltam ${plan.currency} ${plan.gap.toLocaleString()} (considere ampliar a audiência ou a oferta).`);
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: systemPrompt(input.market),
    tools: [EMIT_CAMPAIGN_TOOL],
    tool_choice: { type: 'tool', name: 'emit_campaign' },
    messages: [{ role: 'user', content: userPrompt(input, context, goalPlanText) }],
  });

  const block = response.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') {
    throw new Error('Claude não retornou a campanha estruturada.');
  }
  const raw = block.input as RawTool;

  // Segmentação: meta (código) tem prioridade; senão, escolha do Claude validada.
  let segments: SegmentRec[];
  let excludedSegments: SegmentRec[];
  let segmentationRationale: string;
  if (goalSegments && goalPlan) {
    segments = goalSegments;
    excludedSegments = goalExcluded || [];
    segmentationRationale =
      `Segmentação calculada para a meta de ${goalPlan.currency} ${goalPlan.goal.toLocaleString()}: ` +
      `${segments.length} audiência(s), alcance ~${goalPlan.totalReach.toLocaleString()}, ` +
      `projeção ${goalPlan.currency} ${goalPlan.projectedRevenue.toLocaleString()}` +
      (goalPlan.achievable ? '.' : ` (faltam ${goalPlan.currency} ${goalPlan.gap.toLocaleString()}).`) +
      (excludedSegments.length ? ` ${excludedSegments.length} exclusão(ões) por impacto recente.` : '');
  } else {
    const seg = raw.segment;
    const match = context.audiences.find((a) => a.id === seg?.id) || context.audiences[0];
    segments = match
      ? [{ id: match.id, name: match.name, why: seg?.why, estReach: match.recipients ?? seg?.estReach, rpr: match.rpr }]
      : [];
    excludedSegments = computeExclusions(context.recentlyMailed.audiences, new Set(segments.map((s) => s.id)));
    segmentationRationale = seg?.why || 'Audiência de melhor RPR coerente com o objetivo.';
  }

  const campaign: GeneratedCampaign = {
    subjects: raw.subjects,
    segments,
    excludedSegments,
    segmentationRationale,
    goalPlan,
    recommendedSendDay: raw.recommendedSendDay,
    html: raw.html,
    rationale: raw.rationale,
    campaignNameSuggestion: `${todayYYYYMMDD()}_${CAMPAIGN_TYPE_CODE[input.type]}_${sanitizeSlug(raw.nameSlug)}`,
  };

  return { campaign, context };
}
