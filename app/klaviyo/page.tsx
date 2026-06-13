import { DashboardEmbed } from "@/components/dashboards/DashboardEmbed";

export const metadata = {
  title: 'Klaviyo Journey · Larroudé Performance OS',
};

export default function KlaviyoJourneyPage() {
  return (
    <DashboardEmbed
      src="https://larroude-klaviyo-dashboard.vercel.app/"
      title="Klaviyo Journey"
      subtitle="Flows, campaigns, segmentation and attributed revenue"
      externalUrl="https://larroude-klaviyo-dashboard.vercel.app/"
    />
  );
}
