// Native CAC Dashboard — replica completa do larroude-cac-dashboard-app.vercel.app
// dentro do Performance OS. Reusa Dashboard.tsx + 8 componentes em
// components/cac-dashboard/* + queries em lib/cac-dashboard/queries.ts.
//
// CSS escopado em cac-dashboard.css (importado abaixo). As classes globais
// (.card, .kpi-grid, .header, etc.) sao do design system CAC standalone — o
// wrapper <div className="cac-root"> isola este escopo para nao conflitar com
// o resto do lpos.

import Dashboard from '@/components/cac-dashboard/Dashboard';
import { getDataFreshness } from '@/lib/cac-dashboard/queries-bq';
import './cac-dashboard.css';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default async function CacNativePage() {
  let freshness = '';
  try {
    freshness = await getDataFreshness();
  } catch (err) {
    console.error('[cac-native] freshness failed', err);
  }
  return (
    <div className="cac-root">
      <Dashboard freshness={freshness} />
    </div>
  );
}
