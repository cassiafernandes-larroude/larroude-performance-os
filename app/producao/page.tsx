// Cassia 2026-06-15: aba Produção 2.0 com design system Larroudé namespaced (.prod-root).
import './producao.css';
import ProducaoDashboard from '@/components/producao-native/Dashboard';

export const dynamic = 'force-dynamic';

export default function ProducaoPage() {
  return <ProducaoDashboard />;
}
