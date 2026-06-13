// Klaviyo Journey — internalizado a partir do source larroude-klaviyo-dashboard.
// HTML estatico servido de /klaviyo-journey/index.html, com 11 APIs Edge em
// /api/klaviyo-journey/*. Iframe full-height sem chrome externo, header POS-padrao.
import KlaviyoJourneyEmbed from "@/components/dashboards/KlaviyoJourneyEmbed";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Klaviyo Journey · Larroudé Performance OS",
};

export default function KlaviyoJourneyPage() {
  return <KlaviyoJourneyEmbed />;
}
