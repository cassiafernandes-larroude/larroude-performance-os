// Native LTV Dashboard - replica completa do larroude-ltv-dashboard-app.vercel.app
// dentro do Performance OS. Reusa Dashboard.tsx + 14 componentes em
// components/ltv-dashboard/* + queries em lib/ltv-dashboard/queries.ts.
//
// CSS escopado em ltv-dashboard.css (importado abaixo). As classes globais
// (.card, .kpi-grid, etc.) sao do design system LTV - podem conflitar com
// classes do lpos. O wrapper <div className="ltv-root"> isola este escopo.

import Dashboard from '@/components/ltv-dashboard/Dashboard';
import { getDataFreshness } from '@/lib/ltv-dashboard/queries';
import './ltv-dashboard.css';

export const revalidate = 3600;

export default async function LtvNativePage() {
  let freshness = '';
  try {
    freshness = await getDataFreshness();
  } catch (err) {
    console.error('[ltv-native] freshness failed', err);
  }
  return (
    <div className="ltv-root">
      <Dashboard freshness={freshness} />
    </div>
  );
}
