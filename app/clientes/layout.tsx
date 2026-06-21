// Cassia 2026-06-21: layout da aba Clientes com sub-abas (Clientes 360 · LTV por Produto).
import ClientesTabs from '@/components/clientes/ClientesTabs';

export default function ClientesLayout({ children }: { children: React.ReactNode }) {
  // .clientes-shell: a barra de sub-abas + o .page (min-height:100vh do LTV) somavam mais que a
  // área de scroll do Shell, criando um scroll vertical redundante no topo. O CSS abaixo zera o
  // min-height do .page só aqui (não afeta /ltv-native).
  return (
    <div className="clientes-shell">
      <ClientesTabs />
      {children}
    </div>
  );
}
