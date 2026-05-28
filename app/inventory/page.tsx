import { DashboardEmbed } from "@/components/dashboards/DashboardEmbed";

export default function InventoryPage() {
  return (
    <DashboardEmbed
      src="https://larroude-inventory-dashboard.vercel.app"
      title="Inventory Intelligence"
      subtitle="Stock levels, sell-through, replenishment signals"
      externalUrl="https://larroude-inventory-dashboard.vercel.app"
    />
  );
}
