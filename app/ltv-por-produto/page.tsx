// Cassia 2026-06-21: Aba "LTV por Produto" — seções "LTV by product" + "Customer Journey" da aba
// LTV, recompostas numa página dedicada. Reusa os componentes e o CSS escopado do LTV.
import LtvByProductDashboard from '@/components/ltv-dashboard/LtvByProductDashboard';
import { getDataFreshness } from '@/lib/ltv-dashboard/queries';
import '../ltv-native/ltv-dashboard.css';

export const revalidate = 3600;

export default async function LtvByProductPage() {
  let freshness = '';
  try {
    freshness = await getDataFreshness();
  } catch (err) {
    console.error('[ltv-por-produto] freshness failed', err);
  }
  return (
    <div className="ltv-root">
      <LtvByProductDashboard freshness={freshness} />
    </div>
  );
}
