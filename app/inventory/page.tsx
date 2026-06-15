// Cassia 2026-06-14: substituído o iframe pelo componente nativo.
import InventoryDashboard from '@/components/inventory-native/Dashboard';

export const dynamic = 'force-dynamic';

export default function InventoryPage() {
  return <InventoryDashboard />;
}
