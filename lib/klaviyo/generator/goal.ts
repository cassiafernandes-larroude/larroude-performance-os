// Cassia 2026-06-21: monta a melhor segmentação para bater uma meta de faturamento,
// com base no RPR (revenue per recipient) e alcance histórico de cada audiência.
// Regras:
// - Prioriza audiências de MAIOR RPR (mais eficientes) e acumula até atingir a meta.
// - Prefere audiências NÃO impactadas nos últimos 3 dias (anti-fadiga).
// - Gera EXCLUSÕES: audiências mailed nos últimos 3 dias que não entraram → evita overlap/fadiga.
// - Overlap dentro do envio é deduplicado nativamente pelo Klaviyo (audiência incluída repetida = 1 envio).
import type { AudienceOption, SegmentRec, GoalPlan } from '@/types/klaviyo/generator';

// Exclusões = audiências impactadas na janela recente que NÃO estão incluídas (suprime overlap/fadiga).
export function computeExclusions(
  recentlyMailed: AudienceOption[],
  includedIds: Set<string>,
  days = 3
): SegmentRec[] {
  return recentlyMailed
    .filter((a) => !includedIds.has(a.id))
    .map((a) => ({
      id: a.id,
      name: a.name,
      estReach: a.recipients,
      why: `Impactada nos últimos ${days} dias — excluída para evitar overlap/fadiga`,
    }));
}

export function planSegmentationForGoal(
  audiences: AudienceOption[],
  goal: number,
  currency: 'USD' | 'BRL',
  recentlyMailed: AudienceOption[]
): { segments: SegmentRec[]; excluded: SegmentRec[]; plan: GoalPlan } {
  const recentIds = new Set(recentlyMailed.map((a) => a.id));

  const scored = audiences
    .filter((a) => (a.rpr || 0) > 0 && (a.recipients || 0) > 0)
    .map((a) => ({ a, est: (a.recipients as number) * (a.rpr as number) }));

  // Frescas (não impactadas) primeiro, depois as recentes — ambas por RPR desc.
  const byRpr = (x: { a: AudienceOption }, y: { a: AudienceOption }) => (y.a.rpr as number) - (x.a.rpr as number);
  const ordered = [
    ...scored.filter((s) => !recentIds.has(s.a.id)).sort(byRpr),
    ...scored.filter((s) => recentIds.has(s.a.id)).sort(byRpr),
  ];

  const chosen: { a: AudienceOption; est: number }[] = [];
  let rev = 0;
  let reach = 0;
  for (const c of ordered) {
    if (rev >= goal) break;
    chosen.push(c);
    rev += c.est;
    reach += c.a.recipients as number;
  }
  if (!chosen.length && ordered.length) {
    const c = ordered[0];
    chosen.push(c);
    rev = c.est;
    reach = c.a.recipients as number;
  }

  const includedIds = new Set(chosen.map((c) => c.a.id));
  const segments: SegmentRec[] = chosen.map(({ a, est }) => ({
    id: a.id,
    name: a.name,
    estReach: a.recipients,
    estRevenue: Math.round(est),
    rpr: a.rpr,
    why:
      `RPR ${a.rpr} × ~${a.recipients?.toLocaleString()} ≈ ${currency} ${Math.round(est).toLocaleString()}` +
      (recentIds.has(a.id) ? ' · (impactada <3d — incluída por necessidade da meta)' : ''),
  }));

  const excluded = computeExclusions(recentlyMailed, includedIds);

  return {
    segments,
    excluded,
    plan: {
      goal,
      currency,
      projectedRevenue: Math.round(rev),
      totalReach: reach,
      achievable: rev >= goal,
      gap: Math.max(0, Math.round(goal - rev)),
    },
  };
}
