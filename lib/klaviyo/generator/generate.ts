// Cassia 2026-06-21: gera a campanha em 2 etapas (copy rápido + template) via Gemini.
import { unstable_cache } from 'next/cache';
import { generateStructured } from '@/lib/gemini/client';
import { CAMPAIGN_TYPE_CODE } from '@/lib/klaviyo/classify';
import { buildPerformanceContext } from './context';
import { planSegmentationForGoal, computeExclusions } from './goal';
import {
  systemPrompt,
  userPrompt,
  CAMPAIGN_RESPONSE_SCHEMA,
  systemPromptTemplate,
  userPromptTemplate,
  TEMPLATE_RESPONSE_SCHEMA,
} from './prompt';
import type {
  GeneratorInput,
  GeneratedCampaign,
  PerformanceContext,
  SubjectOption,
  SegmentRec,
  GoalPlan,
} from '@/types/klaviyo/generator';

type RawCampaign = {
  subjects: SubjectOption[];
  segment?: { id: string; name: string; why?: string; estReach?: number };
  recommendedSendDay: string;
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

// Contexto histórico do Klaviyo, cacheado 12h por market/type/period (reusado pelas 2 etapas).
function getContext(input: GeneratorInput): Promise<PerformanceContext> {
  const period = input.period || '3M';
  return unstable_cache(
    () => buildPerformanceContext(input.market, input.type, period),
    ['klaviyo-gen-context', input.market, input.type, period],
    { revalidate: 43200, tags: [`klaviyo-gen-${input.market}`] }
  )();
}

// ETAPA 1: assuntos + segmentação (rápido, sem HTML).
export async function generateCampaign(
  input: GeneratorInput
): Promise<{ campaign: GeneratedCampaign; context: PerformanceContext }> {
  const context = await getContext(input);

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
      `PLANO DE META (use EXATAMENTE estas audiências):\n` +
      segments.map((s) => `  • id=${s.id} | ${s.name} — ${s.why}`).join('\n') +
      (excluded.length ? `\nExclusões (impactadas <${context.recentlyMailed.days}d): ${excluded.map((e) => e.name).join(', ')}` : '') +
      `\nProjeção: ${plan.currency} ${plan.projectedRevenue.toLocaleString()} de meta ${plan.currency} ${plan.goal.toLocaleString()} → ` +
      (plan.achievable ? 'atingível.' : `faltam ${plan.currency} ${plan.gap.toLocaleString()}.`);
  }

  const raw = await generateStructured<RawCampaign>({
    system: systemPrompt(input.market),
    user: userPrompt(input, context, goalPlanText),
    schema: CAMPAIGN_RESPONSE_SCHEMA,
    maxOutputTokens: 4096,
  });

  let segments: SegmentRec[];
  let excludedSegments: SegmentRec[];
  let segmentationRationale: string;
  if (goalSegments && goalPlan) {
    segments = goalSegments;
    excludedSegments = goalExcluded || [];
    segmentationRationale =
      `Segmentação para a meta de ${goalPlan.currency} ${goalPlan.goal.toLocaleString()}: ` +
      `${segments.length} audiência(s), alcance ~${goalPlan.totalReach.toLocaleString()}, projeção ${goalPlan.currency} ${goalPlan.projectedRevenue.toLocaleString()}` +
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
    rationale: raw.rationale,
    campaignNameSuggestion: `${todayYYYYMMDD()}_${CAMPAIGN_TYPE_CODE[input.type]}_${sanitizeSlug(raw.nameSlug)}`,
  };

  return { campaign, context };
}

// ETAPA 2: HTML do template (mais pesado). Reusa o contexto cacheado p/ a base.
export async function generateTemplate(input: GeneratorInput): Promise<{ html: string }> {
  const context = await getContext(input);
  const raw = await generateStructured<{ html: string }>({
    system: systemPromptTemplate(input.market),
    user: userPromptTemplate(input, context),
    schema: TEMPLATE_RESPONSE_SCHEMA,
    maxOutputTokens: 40000,
  });
  return { html: raw.html };
}
