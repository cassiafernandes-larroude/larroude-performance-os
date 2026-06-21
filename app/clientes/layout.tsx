// Cassia 2026-06-21: layout da aba Clientes com sub-abas (Clientes 360 · LTV por Produto).
import ClientesTabs from '@/components/clientes/ClientesTabs';

export default function ClientesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ClientesTabs />
      {children}
    </>
  );
}
