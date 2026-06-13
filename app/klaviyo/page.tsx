import { DashboardEmbed } from "@/components/dashboards/DashboardEmbed";

export const metadata = {
  title: 'Klaviyo Journey · Larroudé Performance OS',
};

export default function KlaviyoJourneyPage() {
  return (
    <DashboardEmbed
      src="/klaviyo-journey/index.html"
      title="Klaviyo Journey"
      subtitle="Flows, campaigns, segmentation and attributed revenue"
      externalUrl="/klaviyo-journey/index.html"
    />
  );
}
