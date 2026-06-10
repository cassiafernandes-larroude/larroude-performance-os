import Dashboard from '@/components/unit-economics/Dashboard';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

function freshnessISO(): string {
  // D-1 em UTC (mesmo padrão dos outros dashboards)
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function UnitEconomicsPage() {
  return (
    <main className="mx-auto max-w-[1480px] px-4 py-6 lg:px-8 print-container main-dashboard-root">
      <Dashboard freshness={freshnessISO()} />
    </main>
  );
}
