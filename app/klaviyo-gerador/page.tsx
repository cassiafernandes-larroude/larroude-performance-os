// Cassia 2026-06-20: página do Gerador de Campanhas Klaviyo.
import CampaignGenerator from "@/components/klaviyo/CampaignGenerator";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Gerador de Campanhas · Klaviyo · Larroudé Performance OS",
};

export default function KlaviyoGeneratorPage() {
  return <CampaignGenerator />;
}
