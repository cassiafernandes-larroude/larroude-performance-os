// Unit Economics — Campaigns tab.
// Cassia 2026-06-13: "incluir uma aba onde eu possa fazer por campanha:
// selecionar os produtos, periodo, nomear, aplicar descontos calculados,
// listar campanhas aplicadas, e selecionar produtos via SKU bulk paste".
import CampaignsTab from '@/components/unit-economics/CampaignsTab';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Campaigns · Unit Economics · Larroudé Performance OS',
};

export default function UnitEconomicsCampaignsPage() {
  return (
    <main className="mx-auto max-w-[1480px] px-4 py-6 lg:px-8 print-container main-dashboard-root">
      <CampaignsTab />
    </main>
  );
}
