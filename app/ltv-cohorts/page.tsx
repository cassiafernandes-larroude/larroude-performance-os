import { DashboardEmbed } from "@/components/dashboards/DashboardEmbed";

export default function LtvCohortsPage() {
  return (
    <DashboardEmbed
      src="https://larroude-ltv-dashboard-app.vercel.app"
      title="LTV · Cohorts"
      subtitle="Lifetime value, coortes e razão LTV:CAC"
      externalUrl="https://larroude-ltv-dashboard-app.vercel.app"
    />
  );
}
