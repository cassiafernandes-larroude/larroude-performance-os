// Cassia 2026-06-15: clone 100% fiel ao larroude-inventory-dashboard.vercel.app
// CSS Larroudé creme + design system completo importado em escopo namespaced (.inv-root).
import './inventory.css';
import InventoryDashboard from '@/components/inventory-native/Dashboard';

export const dynamic = 'force-dynamic';

export default function InventoryPage() {
  return <InventoryDashboard />;
}
