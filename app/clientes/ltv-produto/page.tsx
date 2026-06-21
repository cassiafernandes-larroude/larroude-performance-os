// Cassia 2026-06-21: sub-aba "LTV por Produto" dentro de Clientes. Rota própria → carrega o CSS
// escopado do LTV sem vazar para a visão Clientes 360. Reusa os componentes e rotas do LTV.
import LtvByProductDashboard from '@/components/ltv-dashboard/LtvByProductDashboard';
import { getDataFreshness } from '@/lib/ltv-dashboard/queries';
import '../../ltv-native/ltv-dashboard.css';

export const revalidate = 3600;

export default async function ClientesLtvProdutoPage() {
  let freshness = '';
  try {
    freshness = await getDataFreshness();
  } catch (err) {
    console.error('[clientes/ltv-produto] freshness failed', err);
  }
  return (
    <div className="ltv-root">
      <LtvByProductDashboard freshness={freshness} />
    </div>
  );
}
