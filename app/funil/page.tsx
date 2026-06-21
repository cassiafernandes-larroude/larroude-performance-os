// Cassia 2026-06-21: Aba Funil de Conversão — dados direto do Shopify (ShopifyQL) + orders.
import { Suspense } from 'react';
import FunnelDashboard from '@/components/funnel/FunnelDashboard';

// useSearchParams (FiltersBar URL-driven) → dinâmica.
export const dynamic = 'force-dynamic';

export default function FunilPage() {
  return (
    <Suspense fallback={null}>
      <FunnelDashboard />
    </Suspense>
  );
}
