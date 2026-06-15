// Cassia 2026-06-15: aba Produção 2.0 internalizada no Performance OS.
// Estrutura inicial wrapper do dashboard externo larroude-producao-dashboard.vercel.app;
// proxima iteracao migra pra componente nativo com proxy aos endpoints.
import ProducaoDashboard from '@/components/producao-native/Dashboard';

export const dynamic = 'force-dynamic';

export default function ProducaoPage() {
  return <ProducaoDashboard />;
}
