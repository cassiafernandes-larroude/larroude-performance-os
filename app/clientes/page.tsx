// Cassia 2026-06-21: Aba Clientes — visão 360° do cliente (DTC). Client component faz o fetch
// de /api/clientes/[market]; esta page é só o shell server.
import { Suspense } from 'react';
import ClientesDashboard from '@/components/clientes/ClientesDashboard';

// Cassia 2026-06-21: dinâmica — ClientesDashboard usa useSearchParams (filtro FiltersBar via URL).
export const dynamic = 'force-dynamic';

export default function ClientesPage() {
  return (
    <Suspense fallback={null}>
      <ClientesDashboard />
    </Suspense>
  );
}
