// Cassia 2026-06-14: Meta Ads dashboard internalizado (era iframe pro larroude-dash-meta.vercel.app).
// Source clonado de github.com/cassiafernandes-larroude/larroude-dash-meta.
import MetaAdsDashboard from "@/components/meta-ads-native/Dashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Meta Ads · Larroudé Performance OS",
};

export default function MetaAdsPage() {
  return (
    <main className="print-container meta-ads-root">
      <MetaAdsDashboard />
    </main>
  );
}
