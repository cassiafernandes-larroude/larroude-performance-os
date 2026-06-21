// Cassia 2026-06-21: gera a campanha estruturada via Gemini (Vertex AI), reaproveitando as credenciais GCP.
import { generateStructured } from '@/lib/gemini/client';
import { CAMPAIGN_TYPE_CODE } from '@/lib/klaviyo/classify';
import { buildPerformanceContext } from './context';
import { planSegmentationForGoal, computeExclusions } from './goal';
import { systemPrompt, userPrompt, CAMPAIGN_RESPONSE_SCHEMA } from './prompt';
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
  // Janela 3M: contexto mais leve = mais rápido (cabe no limite de 60s do Hobby); a voz já está em brand-voice.ts.
  const context = await buildPerformanceContext(input.market, input.type, input.period || '3M');

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

  const raw = await generateStructured<RawCampaign>({
    system: systemPrompt(input.market),
    user: userPrompt(input, context, goalPlanText),
    schema: CAMPAIGN_RESPONSE_SCHEMA,
    maxOutputTokens: 40000,
  });

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
