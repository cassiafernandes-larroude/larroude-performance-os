import Dashboard from '@/components/produtos-apostar/Dashboard';

export const metadata = {
  title: 'Products to Bet On · Larroudé Performance OS',
};

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default function Page() {
  return (
    <main className="mx-auto max-w-[1480px] px-4 py-6 lg:px-8 print-container main-dashboard-root">
      <Dashboard />
    </main>
  );
}
