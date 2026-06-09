import Dashboard from '@/components/cac-dashboard/Dashboard';
import { getDataFreshness } from '@/lib/cac-dashboard/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default async function CacNativePage() {
  let freshness = '';
  try {
    freshness = await getDataFreshness();
  } catch (err) {
    console.error('[cac-native freshness] failed', err);
  }
  return <Dashboard freshness={freshness} />;
}
