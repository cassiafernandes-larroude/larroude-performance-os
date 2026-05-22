import { DashboardEmbed } from "@/components/dashboards/DashboardEmbed";

export default function LtvPage() {
  return (
    <DashboardEmbed
      src="https://larroude-ltv-dashboard-app.vercel.app"
      title="LTV"
      subtitle="Lifetime value, cohorts and LTV:CAC ratio"
      externalUrl="https://larroude-ltv-dashboard-app.vercel.app"
    />
  );
}
