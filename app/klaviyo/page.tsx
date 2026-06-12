import KlaviyoDashboard from '@/components/klaviyo/Dashboard';
import './klaviyo.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Klaviyo CRM · Larroudé Performance OS',
};

export default function KlaviyoPage() {
  return <KlaviyoDashboard />;
}
