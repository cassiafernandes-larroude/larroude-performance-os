// Cassia 2026-06-21: Aba Clientes — visão 360° do cliente (DTC). Client component faz o fetch
// de /api/clientes/[market]; esta page é só o shell server.
import ClientesDashboard from '@/components/clientes/ClientesDashboard';

export const revalidate = 3600;

export default function ClientesPage() {
  return <ClientesDashboard />;
}
