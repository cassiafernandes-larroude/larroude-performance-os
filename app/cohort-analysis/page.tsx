// Cassia 2026-07-02: aba Cohort Analysis ligada (era placeholder Fase 3) — matriz de retenção
// por safra de aquisição. Mesmo design system do LTV/Clientes; dados via /api/cohorts/[market].
import CohortDashboard from './CohortDashboard';
import { getDataFreshness } from '@/lib/ltv-dashboard/queries';
import '../ltv-native/ltv-dashboard.css';

export const revalidate = 3600;

export default async function CohortPage() {
  let freshness = '';
  try {
    freshness = await getDataFreshness();
  } catch (err) {
    console.error('[cohort-analysis] freshness failed', err);
  }
  return (
    <div className="ltv-root">
      <CohortDashboard freshness={freshness} />
    </div>
  );
}
