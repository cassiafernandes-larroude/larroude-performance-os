// Cassia 2026-06-21: Aba Clientes 360 — mesmo design system do LTV por Produto. Carrega o CSS
// escopado do LTV e renderiza dentro de .ltv-root; ClientesDashboard usa Header/PeriodFilter/.card
// do LTV. Fetch de dados é client-side (/api/clientes); esta page resolve só o freshness.
import ClientesDashboard from '@/components/clientes/ClientesDashboard';
import { getDataFreshness } from '@/lib/ltv-dashboard/queries';
import '../ltv-native/ltv-dashboard.css';

export const revalidate = 3600;

export default async function ClientesPage() {
  let freshness = '';
  try {
    freshness = await getDataFreshness();
  } catch (err) {
    console.error('[clientes] freshness failed', err);
  }
  return (
    <div className="ltv-root">
      <ClientesDashboard freshness={freshness} />
    </div>
  );
}
